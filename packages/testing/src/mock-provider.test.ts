import { describe, expect, it } from 'vitest';
import { ProviderError, type MusicProvider } from '@music-downloader/shared';
import {
  mockArtwork,
  mockAudioBytes,
  mockTrack,
  mockVariants,
  MockMusicProvider,
} from './index.js';

async function readBytes(
  stream: ReadableStream<Uint8Array>,
): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const result = await reader.read();
      if (result.done) break;
      if (result.value !== undefined) chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }
  return Uint8Array.from(chunks.flatMap((chunk) => [...chunk]));
}

describe('MockMusicProvider', () => {
  it('implements MusicProvider and deterministically supports account and media methods', async () => {
    const provider: MusicProvider = new MockMusicProvider();
    expect(await provider.getAccount()).toBeNull();
    expect(await provider.authenticate()).toMatchObject({
      id: 'account:fixture',
    });
    expect(await provider.resolveUrl('mock://track/track:fixture')).toEqual({
      provider: 'mock-music',
      kind: 'track',
      id: mockTrack.id,
    });
    expect((await provider.getTrack(mockTrack.id)).id).toBe(mockTrack.id);
    expect((await provider.getAlbum('album:fixture')).tracks).toHaveLength(1);
    expect(
      (await provider.getPlaylist('playlist:fixture')).tracks,
    ).toHaveLength(1);
    expect(await provider.getAudioVariants(mockTrack.id)).toEqual(mockVariants);
    await provider.logout();
    expect(await provider.getAccount()).toBeNull();
  });

  it('returns byte-exact suffix and the full expected size for Range', async () => {
    const provider = new MockMusicProvider();
    const audio = await provider.openAudioStream(
      mockTrack.id,
      mockVariants[0]?.key ?? '',
      { offset: 2 },
    );
    expect(audio).toMatchObject({
      contentLength: mockAudioBytes.byteLength,
      acceptsRanges: true,
      startOffset: 2,
    });
    expect(await readBytes(audio.stream)).toEqual(mockAudioBytes.slice(2));
  });

  it('starts from zero when Range is unavailable', async () => {
    const provider = new MockMusicProvider({ supportsRange: false });
    const audio = await provider.openAudioStream(
      mockTrack.id,
      mockVariants[0]?.key ?? '',
      { offset: 2 },
    );
    expect(audio).toMatchObject({ acceptsRanges: false, startOffset: 0 });
    expect(await readBytes(audio.stream)).toEqual(mockAudioBytes);
  });

  it('makes expiry, interruption and queued failures observable without retries', async () => {
    const variantKey = mockVariants[0]?.key ?? '';
    const expired = new MockMusicProvider({ expiredVariantKeys: [variantKey] });
    await expect(
      expired.openAudioStream(mockTrack.id, variantKey, {}),
    ).rejects.toMatchObject({ code: 'STREAM_EXPIRED' });
    const interrupted = new MockMusicProvider({
      interruptedVariantKeys: [variantKey],
    });
    const stream = await interrupted.openAudioStream(
      mockTrack.id,
      variantKey,
      {},
    );
    const reader = stream.stream.getReader();
    const prefix = await reader.read();
    expect(prefix.done).toBe(false);
    expect(prefix.value).toBeDefined();
    expect(prefix.value?.byteLength).toBeGreaterThan(0);
    expect(prefix.value?.byteLength).toBeLessThan(mockAudioBytes.byteLength);
    await expect(reader.read()).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
    });
    reader.releaseLock();
    const resumed = await new MockMusicProvider().openAudioStream(
      mockTrack.id,
      variantKey,
      { offset: prefix.value?.byteLength },
    );
    expect(resumed.startOffset).toBe(prefix.value?.byteLength);
    expect(await readBytes(resumed.stream)).toEqual(
      mockAudioBytes.slice(prefix.value?.byteLength),
    );
    const failed = new MockMusicProvider({
      failures: { getTrack: [new ProviderError('NETWORK_ERROR', true)] },
    });
    await expect(failed.getTrack(mockTrack.id)).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
    });
    expect((await failed.getTrack(mockTrack.id)).id).toBe(mockTrack.id);
  });

  it('models unavailable tracks, artwork copies and abortable delay', async () => {
    const unavailable = new MockMusicProvider({
      unavailableTrackIds: [mockTrack.id],
    });
    await expect(unavailable.getTrack(mockTrack.id)).rejects.toMatchObject({
      code: 'TRACK_UNAVAILABLE',
    });
    const provider = new MockMusicProvider();
    const first = await provider.fetchArtwork(mockArtwork, 100);
    const second = await provider.fetchArtwork(mockArtwork, 100);
    first.bytes[0] = 0;
    expect(second.bytes[0]).not.toBe(0);
    const controller = new AbortController();
    const delayed = new MockMusicProvider({ delays: { openAudioStream: 100 } });
    const opening = delayed.openAudioStream(
      mockTrack.id,
      mockVariants[0]?.key ?? '',
      { signal: controller.signal },
    );
    controller.abort();
    await expect(opening).rejects.toMatchObject({ code: 'DOWNLOAD_ERROR' });

    const readingController = new AbortController();
    const audio = await provider.openAudioStream(
      mockTrack.id,
      mockVariants[0]?.key ?? '',
      { signal: readingController.signal },
    );
    readingController.abort();
    await expect(readBytes(audio.stream)).rejects.toMatchObject({
      code: 'DOWNLOAD_ERROR',
    });
  });
});
