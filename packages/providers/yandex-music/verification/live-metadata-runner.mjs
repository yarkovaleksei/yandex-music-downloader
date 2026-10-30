import { mkdir, writeFile } from 'node:fs/promises';
import { YandexMusicProvider, PROVIDER_SCHEMA_VERSION } from '../dist/index.js';
import {
  rawAlbumSchema,
  rawPlaylistSchema,
  rawTrackSchema,
} from '../dist/metadata/schemas.js';
import { z } from 'zod';
import { artworkReference } from '../dist/metadata/artwork.js';

/** Сохраняет только allowlisted metadata, не headers, token или unredacted body.
 */
export async function runLiveMetadata(credentialStore, fixtureDirectory) {
  const fixtures = {};
  const fetch = async (url, init) => {
    const response = await globalThis.fetch(url, init);
    const path = new URL(url).pathname;
    const kind =
      path === '/tracks'
        ? 'track'
        : /\/with-tracks$/.test(path)
          ? 'album'
          : /\/playlists\/\d+$/.test(path)
            ? 'playlist'
            : undefined;
    if (!kind || response.status !== 200) return response;
    const bytes = await response.arrayBuffer();
    const envelope = JSON.parse(new TextDecoder().decode(bytes));
    const schema =
      kind === 'track'
        ? z.array(rawTrackSchema)
        : kind === 'album'
          ? rawAlbumSchema
          : rawPlaylistSchema;
    const result = schema.safeParse(envelope.result);
    console.log(
      `METADATA_LIVE: RAW_${kind.toUpperCase()}_${result.success ? 'PASS' : 'INVALID'}`,
    );
    if (!result.success)
      console.log(
        'METADATA_LIVE: SCHEMA_PATHS=' +
          JSON.stringify(
            result.error.issues.map((issue) => ({
              path: issue.path,
              code: issue.code,
            })),
          ),
      );
    if (result.success) {
      const redacted = result.data;
      redactResources(redacted);
      if (kind === 'playlist') {
        redacted.title = 'Тестовый плейлист';
        if (redacted.uid !== undefined) redacted.uid = 501;
        if (redacted.owner !== undefined)
          redacted.owner = {
            uid: 501,
            login: 'fixture-owner',
            name: 'Тестовый владелец',
          };
        if (redacted.kind !== undefined) redacted.kind = 1000;
        if (redacted.playlistUuid !== undefined)
          redacted.playlistUuid = '00000000-0000-4000-8000-000000000001';
        // User-uploaded cover не сохраняется; public cover shape доказывается album.
        delete redacted.cover;
      }
      fixtures[kind] = { result: redacted };
    }
    return {
      status: response.status,
      headers: response.headers,
      arrayBuffer: async () => bytes.slice(0),
    };
  };
  const original = await credentialStore.read();
  let temporary = false;
  const provider = new YandexMusicProvider({
    credentialStore,
    fetch,
    authInteraction: {
      notify: () => {
        console.log('METADATA_LIVE: BROWSER_CONFIRMATION_REQUIRED');
      },
    },
  });
  try {
    let account;
    try {
      account = await provider.getAccount();
    } catch (error) {
      if (error?.code !== 'AUTH_ERROR') throw error;
    }
    if (!account) {
      temporary = true;
      account = await provider.authenticate();
    }
    console.log('METADATA_LIVE: ACCOUNT_READY');
    const track = await provider.getTrack('2224197');
    console.log('METADATA_LIVE: TRACK_READY');
    const album = await provider.getAlbum('221173');
    console.log('METADATA_LIVE: ALBUM_READY');
    const playlist = await provider.getPlaylist(
      `users/${encodeURIComponent(account.id)}/playlists/1000`,
    );
    if (
      !track.id ||
      !album.tracks.length ||
      !playlist.tracks.every((item, index) => item.position === index + 1)
    )
      throw new Error('metadata-contract-invalid');
    if (!fixtures.track || !fixtures.album || !fixtures.playlist)
      throw new Error('fixture-capture-incomplete');
    await mkdir(fixtureDirectory, { recursive: true });
    for (const [kind, fixture] of Object.entries(fixtures))
      await writeFile(
        `${fixtureDirectory}/${kind}.json`,
        JSON.stringify(fixture, null, 2) + '\n',
      );
    await writeFile(
      `${fixtureDirectory}/provenance.json`,
      JSON.stringify(
        {
          capturedAt: new Date().toISOString(),
          sdkVersion: '0.3.0',
          schemaVersion: PROVIDER_SCHEMA_VERSION,
          source: 'runLiveMetadata: реальный facade, SDK и validated transport',
          operations: ['tracks', 'albumsWithTracks', 'usersPlaylists'],
          redaction:
            'Allowlisted raw schema fields; owner/title/uid/UUID заменены псевдонимами; user cover и unused поля исключены; headers/credentials/signed URLs не сохраняются.',
          limitations:
            'Один собственный аккаунт; отрицательные/неполные cases в tests являются synthetic mutations, не live observations.',
        },
        null,
        2,
      ) + '\n',
    );
    console.log(
      `METADATA_LIVE: PASS (track=${track.availability}, albumTracks=${album.tracks.length}, playlistTracks=${playlist.tracks.length}, schema=${PROVIDER_SCHEMA_VERSION})`,
    );
  } finally {
    if (temporary) {
      await provider.logout();
      if (original !== null) await credentialStore.write(original);
      console.log('METADATA_LIVE: TEMPORARY_SESSION_CLEANUP_PASS');
    }
  }
}

/** Даже unused album cover не должен сохранить credential-bearing URI в fixture. */
function redactResources(value) {
  if (Array.isArray(value)) {
    for (const item of value) redactResources(item);
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    if (key === 'coverUri' && typeof item === 'string') {
      try {
        artworkReference(item);
      } catch {
        delete value[key];
      }
    } else redactResources(item);
  }
}
