import type { JobManifestV1, ManifestStore } from './manifest.js';

export interface ContractTestApi {
  describe(name: string, body: () => void): void;
  it(name: string, body: () => Promise<void>): void;
  expect(value: unknown): { toBe(value: unknown): void };
}

/** Общий contract-набор REQ-032: adapter обязан сохранить immutable plan и owner boundary. */
export function runManifestStoreContract(
  api: ContractTestApi,
  createStore: () => Promise<ManifestStore>,
): void {
  api.describe('ManifestStore contract', () => {
    api.it(
      'читает полный snapshot и выполняет recovery до выдачи owner',
      async () => {
        const store = await createStore();
        const manifest = manifestFixture();
        await store.create(manifest);
        let recovered = false;
        const session = await store.acquire(manifest.jobId, {
          recover: async (stored) => {
            recovered = true;
            return stored;
          },
        });
        api.expect(recovered).toBe(true);
        api
          .expect((await store.read(manifest.jobId))?.plan.tracks[0]?.trackKey)
          .toBe('1');
        await session.release();
      },
    );
  });
}

export function manifestFixture(jobId = 'contract-job'): JobManifestV1 {
  return {
    version: 1,
    jobId,
    provider: 'test',
    source: { provider: 'test', kind: 'track', id: 'source' },
    quality: 'best',
    destination: '/music',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    control: { state: 'paused' },
    plan: {
      source: { provider: 'test', kind: 'track', id: 'source' },
      title: 'Трек',
      tracks: [
        {
          position: 1,
          trackKey: '1',
          track: { id: 'track', availability: 'unknown' },
        },
      ],
    },
    tracks: [
      {
        position: 1,
        trackKey: '1',
        status: 'paused',
        attempts: 0,
        history: [],
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
  };
}
