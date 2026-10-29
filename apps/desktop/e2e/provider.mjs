import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

export const track = {
  id: 'e2e-track',
  availability: 'available',
  title: 'Проверочный сигнал',
  artists: [{ id: 'e2e-artist', name: 'Тестовый исполнитель' }],
  durationMs: 2000,
};

/** Синтетический offline-источник STEP-033; задержка потока оставляет наблюдаемое окно для pause. */
export function offlineProvider() {
  return {
    async authenticate() {
      return { id: 'e2e-account', displayName: 'Тестовый аккаунт' };
    },
    async getAccount() {
      return null;
    },
    async logout() {},
    async resolveUrl(url) {
      if (url !== 'mock://track/e2e-track')
        throw new Error('Неизвестная тестовая ссылка');
      return { provider: 'e2e-offline', kind: 'track', id: track.id };
    },
    async getTrack(id) {
      if (id !== track.id) throw new Error('Неизвестный тестовый трек');
      return structuredClone(track);
    },
    async getAlbum() {
      throw new Error('Альбом вне сценария');
    },
    async getPlaylist() {
      throw new Error('Плейлист вне сценария');
    },
    async getAudioVariants() {
      return [
        {
          key: 'e2e-mp3',
          codec: 'mp3',
          container: 'mp3',
          bitrate: 192,
          lossless: false,
        },
      ];
    },
    async openAudioStream(_id, _key, { offset = 0, signal }) {
      const bytes = await readFile(process.env.MUSIC_E2E_AUDIO);
      let cursor = offset;
      return {
        contentLength: bytes.length,
        container: 'mp3',
        acceptsRanges: true,
        startOffset: offset,
        stream: new ReadableStream({
          async pull(controller) {
            try {
              if (cursor >= bytes.length) {
                controller.close();
                return;
              }
              await delay(250, undefined, { signal });
              const end = Math.min(cursor + 2048, bytes.length);
              controller.enqueue(bytes.subarray(cursor, end));
              cursor = end;
            } catch (error) {
              controller.error(error);
            }
          },
        }),
      };
    },
    async fetchArtwork() {
      throw new Error('В fixture отсутствует обложка');
    },
  };
}
