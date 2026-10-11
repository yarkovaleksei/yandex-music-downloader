import { describe, expect, it } from 'vitest';
import { decodeManifest, encodeManifest } from './manifest.js';

const manifest = {
  version: 1 as const,
  jobId: 'job',
  provider: 'test',
  source: { provider: 'test', kind: 'playlist' as const, id: 'source' },
  quality: 'best',
  destination: '/music',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  control: {
    state: 'paused' as const,
    pauseReason: 'AUTH_REQUIRED',
    pauseTrackKey: '2',
  },
  plan: {
    source: { provider: 'test', kind: 'playlist' as const, id: 'source' },
    title: 'Список',
    tracks: [
      {
        position: 1,
        trackKey: '1',
        track: { id: 'same', availability: 'unknown' as const },
      },
      {
        position: 2,
        trackKey: '2',
        track: { id: 'same', availability: 'unknown' as const },
      },
    ],
  },
  tracks: [1, 2].map((position) => ({
    position,
    trackKey: String(position),
    status: 'paused' as const,
    attempts: 0,
    history: [],
    updatedAt: '2026-01-01T00:00:00.000Z',
    partial: {
      bytes: 2,
      expectedSize: 4,
      variantKey: 'variant',
      tagged: false,
    },
  })),
};

describe('manifest v1', () => {
  it('сохраняет позиционные повторы и не переносит runtime-секреты', () => {
    const encoded = encodeManifest({
      ...manifest,
      runtime: { token: 'secret', signedUrl: 'https://secret' },
    } as unknown as typeof manifest);
    expect(encoded).toContain('"version":1');
    expect(encoded).not.toContain('secret');
    expect(decodeManifest(encoded).tracks).toHaveLength(2);
  });
  it('отвергает будущую версию и изменение позиционного плана', () => {
    expect(() =>
      decodeManifest(JSON.stringify({ ...manifest, version: 2 })),
    ).toThrow();
    expect(() =>
      decodeManifest(
        JSON.stringify({
          ...manifest,
          tracks: [manifest.tracks[1], manifest.tracks[0]],
        }),
      ),
    ).toThrow();
  });
  it('F-005 восстанавливает глубоко неизменяемый plan', () => {
    const decoded = decodeManifest(JSON.stringify(manifest));
    expect(() => {
      (decoded.plan.tracks[0] as { position: number }).position = 9;
    }).toThrow();
    expect(() => {
      (decoded.plan.tracks[0]!.track as { id: string }).id = 'other';
    }).toThrow();
    expect(() => {
      (decoded.plan.source as { id: string }).id = 'other';
    }).toThrow();
  });
  it('F-006 отвергает неполный v1 и недопустимую фазу retry', () => {
    expect(() =>
      decodeManifest(JSON.stringify({ ...manifest, source: {} })),
    ).toThrow();
    expect(() =>
      decodeManifest(
        JSON.stringify({
          ...manifest,
          plan: { ...manifest.plan, title: undefined },
        }),
      ),
    ).toThrow();
    expect(() =>
      decodeManifest(
        JSON.stringify({
          ...manifest,
          tracks: [
            { ...manifest.tracks[0], position: 0, retryPhase: 'invalid' },
          ],
          plan: { ...manifest.plan, tracks: [manifest.plan.tracks[0]] },
        }),
      ),
    ).toThrow();
  });
  it('сохраняет все разрешённые поля v1 при roundtrip', () => {
    const decoded = decodeManifest(
      encodeManifest({
        ...manifest,
        lastControl: {
          requestId: 'request',
          accepted: false,
          completedAt: manifest.updatedAt,
          error: { code: 'AUTH_ERROR', message: 'ignored', retryable: false },
        },
        tracks: manifest.tracks.map((track, index) => ({
          ...track,
          status: index === 0 ? 'processing' : 'retry_wait',
          retryPhase: index === 0 ? 'processing' : 'downloading',
          variant: {
            key: 'variant',
            codec: 'aac',
            container: 'm4a',
            bitrate: 320,
            lossless: false,
          },
          variantKey: 'variant',
          resultPath: '/music/result.m4a',
          partPath: '/music/result.m4a.part',
          attempts: 2,
          history: [
            {
              at: manifest.updatedAt,
              status: 'downloading',
              error: {
                code: 'NETWORK_ERROR',
                message: 'ignored',
                retryable: true,
              },
            },
          ],
          error: {
            code: 'DOWNLOAD_ERROR',
            message: 'ignored',
            retryable: false,
          },
          postProcessing: { size: 4, identity: 'identity' },
        })),
      }),
    );
    expect(decoded.tracks[0]!.variant?.bitrate).toBe(320);
    expect(decoded.tracks[0]!.postProcessing?.identity).toBe('identity');
    expect(decoded.lastControl?.error?.code).toBe('AUTH_ERROR');
  });
  it('F-010 проецирует вложенные runtime-секреты и raw error', () => {
    const encoded = encodeManifest({
      ...manifest,
      source: { ...manifest.source, token: 'source-token' },
      plan: {
        ...manifest.plan,
        tracks: [
          {
            ...manifest.plan.tracks[0],
            track: {
              ...manifest.plan.tracks[0]!.track,
              Authorization: 'Bearer secret',
            },
          },
          manifest.plan.tracks[1]!,
        ],
      },
      tracks: [
        {
          ...manifest.tracks[0],
          variant: {
            key: 'variant',
            codec: 'aac',
            container: 'm4a',
            lossless: false,
            signedUrl: 'https://secret',
          },
          error: {
            code: 'DOWNLOAD_ERROR',
            message: 'raw secret',
            retryable: false,
            cause: 'secret',
          },
        },
        manifest.tracks[1]!,
      ],
    } as unknown as typeof manifest);
    expect(encoded).not.toContain('source-token');
    expect(encoded).not.toContain('Bearer secret');
    expect(encoded).not.toContain('https://secret');
    expect(encoded).not.toContain('raw secret');
    expect(decodeManifest(encoded).tracks[0]!.error?.message).toBe(
      'Загрузка не выполнена.',
    );
  });
});
