import { describe, expect, it, vi } from 'vitest';
import type { MusicProvider, Track } from '@music-downloader/shared';
import { resolveVariant } from '@music-downloader/core-planner';
import { preview, supportsDownloadVariant } from './preview.js';

const track: Track = {
  id: '1',
  title: 'Трек',
  availability: 'available',
  artists: [{ id: 'a', name: 'Автор' }],
  artwork: { key: 'private-artwork' },
};
const lossy = {
  key: 'secret-variant',
  codec: 'mp3',
  container: 'mp3',
  lossless: false,
  bitrate: 320000,
};
const lossless = {
  key: 'private-lossless',
  codec: 'flac',
  container: 'flac',
  lossless: true,
};
function fixture() {
  return {
    getTrack: vi.fn(async () => track),
    getAlbum: vi.fn(async () => ({
      id: 'album',
      title: 'Альбом',
      artists: track.artists,
      tracks: [
        track,
        { id: '2', availability: 'available', title: 'Пустой', artists: [] },
        { id: '3', availability: 'unknown' },
        { id: '4', availability: 'unavailable' },
      ],
    })),
    getPlaylist: vi.fn(async () => ({
      id: 'playlist',
      title: 'Плейлист',
      owner: 'Владелец',
      tracks: [
        { position: 1, track },
        { position: 2, track },
      ],
    })),
    getAudioVariants: vi.fn(async (id: string) =>
      id === '1' ? [lossy, lossless] : [],
    ),
    fetchArtwork: vi.fn(async () => ({
      mimeType: 'image/png',
      bytes: new Uint8Array([1]),
    })),
    openAudioStream: vi.fn(),
  } as unknown as MusicProvider;
}
describe('безопасный preview REQ-049', () => {
  it.each(['track', 'album', 'playlist'] as const)(
    'сохраняет форму %s и считает реальные позиции без audio stream',
    async (kind) => {
      const provider = fixture();
      const result = await preview(provider, {
        provider: 'mock',
        kind,
        id: '1',
      });
      expect(result.author).toBe(kind === 'playlist' ? 'Владелец' : 'Автор');
      const total = kind === 'track' ? 1 : kind === 'album' ? 4 : 2;
      expect(result.qualities).toEqual(
        ['best', 'lossless', 'high', 'normal'].map((preference) => ({
          preference,
          available:
            preference === 'lossless' ? 0 : kind === 'album' ? 1 : total,
          total,
        })),
      );
      expect(result.tracks[0]).toMatchObject(
        kind === 'playlist'
          ? { position: 1, track: { id: '1', title: 'Трек' } }
          : { id: '1', title: 'Трек' },
      );
      expect(provider.openAudioStream).not.toHaveBeenCalled();
      expect(provider.getAudioVariants).toHaveBeenCalledTimes(
        kind === 'album' || kind === 'playlist' ? 2 : 1,
      );
      expect(JSON.stringify(result)).not.toMatch(
        /secret-variant|private-lossless|private-artwork|https:|Authorization/,
      );
    },
  );
  it.each([[lossy], [lossless], []])(
    'классифицирует варианты той же семантикой resolveVariant',
    async (...variants) => {
      const provider = fixture();
      vi.mocked(provider.getAudioVariants).mockResolvedValue(variants);
      const result = await preview(provider, {
        provider: 'mock',
        kind: 'track',
        id: '1',
      });
      for (const item of result.qualities!)
        expect(item.available).toBe(
          Number(
            resolveVariant(variants, item.preference, {
              supports: supportsDownloadVariant,
            }).ok,
          ),
        );
    },
  );
});

it('REQ-058 H-002: partial exact coverage считает повторные позиции и не обещает неподдерживаемый raw FLAC', async () => {
  const provider = fixture();
  vi.mocked(provider.getPlaylist).mockResolvedValue({
    id: 'p',
    title: 'Коллекция',
    description: 'Описание',
    tracks: [
      { position: 1, track: { ...track, durationMs: 1000 } },
      { position: 2, track: { ...track, durationMs: 1000 } },
      { position: 3, track: { ...track, id: '2' } },
    ],
  });
  vi.mocked(provider.getAudioVariants).mockImplementation(async (id) =>
    id === '1' ? [lossy, lossless] : [{ ...lossy, bitrate: 128000 }],
  );
  const result = await preview(provider, {
    provider: 'mock',
    kind: 'playlist',
    id: 'p',
  });
  expect(result.description).toBe('Описание');
  expect(result.durationMs).toBeUndefined();
  expect(result.variants).toEqual([
    {
      selection: {
        codec: 'mp3',
        container: 'mp3',
        lossless: false,
        bitrate: 320000,
      },
      available: 2,
      total: 3,
    },
    {
      selection: {
        codec: 'mp3',
        container: 'mp3',
        lossless: false,
        bitrate: 128000,
      },
      available: 1,
      total: 3,
    },
  ]);
  for (const item of result.variants!) {
    const byPosition = await Promise.all(
      ['1', '1', '2'].map((id) => provider.getAudioVariants(id)),
    );
    expect(
      byPosition.filter(
        (variants) =>
          resolveVariant(variants, 'best', {
            supports: supportsDownloadVariant,
            variantSelection: item.selection,
          }).ok,
      ),
    ).toHaveLength(item.available);
  }
  vi.mocked(provider.fetchArtwork).mockRejectedValue(
    new Error('CDN недоступен'),
  );
  await expect(
    preview(provider, { provider: 'mock', kind: 'track', id: '1' }),
  ).resolves.toMatchObject({ title: 'Трек' });
});
