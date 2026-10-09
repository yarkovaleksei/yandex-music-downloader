/**
 * Изолирует ручную проверку REQ-008 от обычного offline suite.
 * @link ../../../../planning/tasks/STEP-011.md
 */
const DEFAULT_TRACK_ID = '2224197';
const DEFAULT_ALBUM_ID = '221173';
const NEUTRAL_ACCOUNT_ID = 'provider-test-account';
const PROVIDER_ERROR_CODES = new Set([
  'NETWORK_ERROR',
  'AUTH_ERROR',
  'API_CHANGED',
  'SERVICE_UNAVAILABLE',
  'PROVIDER_RESPONSE_INVALID',
  'STREAM_EXPIRED',
  'TRACK_UNAVAILABLE',
  'QUALITY_UNAVAILABLE',
]);

function report(emit, line) {
  emit(`PROVIDER_TEST: ${line}`);
}

function failureCode(error) {
  return PROVIDER_ERROR_CODES.has(error?.code) ? error.code : 'UNKNOWN';
}

function isNumericId(value) {
  return /^\d+$/.test(value);
}

function isPlaylistId(value) {
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    return true;
  const legacy = /^users\/([^/]+)\/playlists\/\d+$/.exec(value);
  if (!legacy) return false;
  try {
    const owner = decodeURIComponent(legacy[1]);
    return (
      owner.length > 0 &&
      owner !== '.' &&
      owner !== '..' &&
      !owner.includes('/') &&
      encodeURIComponent(owner) === legacy[1]
    );
  } catch {
    return false;
  }
}

function configuredIds(environment, accountId) {
  const trackId = environment.PROVIDER_TEST_TRACK_ID || DEFAULT_TRACK_ID;
  const albumId = environment.PROVIDER_TEST_ALBUM_ID || DEFAULT_ALBUM_ID;
  const playlistId =
    environment.PROVIDER_TEST_PLAYLIST_ID ||
    `users/${encodeURIComponent(accountId)}/playlists/1000`;
  if (
    !isNumericId(trackId) ||
    !isNumericId(albumId) ||
    !isPlaylistId(playlistId)
  ) {
    throw Object.assign(new Error('invalid-resource-override'), {
      code: 'PROVIDER_RESPONSE_INVALID',
    });
  }
  return { trackId, albumId, playlistId };
}

function assertContract(condition) {
  if (!condition) {
    throw Object.assign(new Error('provider-contract-invalid'), {
      code: 'PROVIDER_RESPONSE_INVALID',
    });
  }
}

function assertTrack(track, id) {
  assertContract(
    track?.id === id &&
      track.availability === 'available' &&
      typeof track.title === 'string' &&
      track.title.length > 0 &&
      Array.isArray(track.artists),
  );
}

function assertAlbum(album, id) {
  assertContract(
    album?.id === id &&
      typeof album.title === 'string' &&
      album.title.length > 0 &&
      Array.isArray(album.artists) &&
      Array.isArray(album.tracks),
  );
}

function assertPlaylist(playlist, id) {
  assertContract(
    playlist?.id === id &&
      typeof playlist.title === 'string' &&
      playlist.title.length > 0 &&
      Array.isArray(playlist.tracks) &&
      playlist.tracks.every((item, index) => item?.position === index + 1),
  );
}

function assertVariants(variants) {
  assertContract(
    Array.isArray(variants) &&
      variants.length > 0 &&
      variants.every(
        (variant) =>
          typeof variant?.key === 'string' &&
          variant.key.length > 0 &&
          typeof variant.codec === 'string' &&
          variant.codec.length > 0 &&
          typeof variant.container === 'string' &&
          variant.container.length > 0 &&
          typeof variant.lossless === 'boolean' &&
          (variant.bitrate === undefined ||
            (Number.isFinite(variant.bitrate) && variant.bitrate > 0)),
      ),
  );
}

/** Строгий envelope v1 существует только в памяти процесса live suite.
 * @link ../../../../docs/requirements/REQ-008-provider-contract-tests.md
 */
export function createMemoryCredentialStore(token, issuedAt = Date.now()) {
  let value = JSON.stringify({
    schemaVersion: 1,
    accessToken: token,
    issuedAt,
    accountId: NEUTRAL_ACCOUNT_ID,
  });
  return {
    async read() {
      return value;
    },
    async write(next) {
      value = next;
    },
    async clear() {
      value = null;
    },
    isCleared() {
      return value === null;
    },
  };
}

export async function createLiveProvider(token) {
  const { YandexMusicProvider, PROVIDER_SCHEMA_VERSION } =
    await import('../dist/index.js');
  const credentialStore = createMemoryCredentialStore(token);
  return {
    provider: new YandexMusicProvider({
      credentialStore,
      authInteraction: { notify: () => {} },
    }),
    credentialStore,
    schemaVersion: PROVIDER_SCHEMA_VERSION,
  };
}

export async function runProvider({
  token,
  environment = process.env,
  factory = createLiveProvider,
  emit = console.log,
}) {
  if (typeof token !== 'string' || token.trim() === '') {
    report(emit, 'SKIP TOKEN_MISSING');
    return 0;
  }

  let exitCode = 1;
  let session;
  let stage = 'LOAD';
  try {
    session = await factory(token);
    const { provider, schemaVersion } = session;
    stage = 'ACCOUNT';
    const account = await provider.getAccount();
    assertContract(typeof account?.id === 'string' && account.id.length > 0);
    report(emit, `ACCOUNT_READY schema=${schemaVersion}`);

    stage = 'CONFIG';
    const { trackId, albumId, playlistId } = configuredIds(
      environment,
      account.id,
    );
    stage = 'TRACK';
    const track = await provider.getTrack(trackId);
    assertTrack(track, trackId);
    report(emit, 'TRACK_READY');

    stage = 'ALBUM';
    const album = await provider.getAlbum(albumId);
    assertAlbum(album, albumId);
    report(emit, `ALBUM_READY tracks=${album.tracks.length}`);

    stage = 'PLAYLIST';
    const playlist = await provider.getPlaylist(playlistId);
    assertPlaylist(playlist, playlistId);
    report(emit, `PLAYLIST_READY tracks=${playlist.tracks.length}`);

    stage = 'VARIANTS';
    const variants = await provider.getAudioVariants(trackId);
    assertVariants(variants);
    report(emit, `VARIANTS_READY count=${variants.length}`);
    exitCode = 0;
  } catch (error) {
    report(emit, `FAIL stage=${stage} code=${failureCode(error)}`);
  } finally {
    if (session) {
      let cleanupError;
      try {
        await session.provider.logout();
      } catch (error) {
        cleanupError = error;
      }
      try {
        // Явно стираем test-only store, даже если provider logout завершился ошибкой.
        await session.credentialStore.clear();
      } catch (error) {
        cleanupError ??= error;
      }
      if (session.credentialStore.isCleared() && !cleanupError) {
        report(emit, 'MEMORY_CLEANUP_PASS');
      } else {
        exitCode = 1;
        report(emit, `FAIL stage=CLEANUP code=${failureCode(cleanupError)}`);
      }
    }
  }
  if (exitCode === 0) report(emit, 'PASS');
  return exitCode;
}
