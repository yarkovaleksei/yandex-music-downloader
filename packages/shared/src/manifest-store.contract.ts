import type { JobManifestV1, ManifestStore } from './manifest.js';
import { decodeManifest, encodeManifest } from './manifest.js';

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
      'наблюдает inactive → active → inactive без recovery при чтении',
      async () => {
        const store = await createStore();
        const manifest = manifestFixture();
        api.expect(await store.readLeaseState('unknown-job')).toBe('inactive');
        await store.create(manifest);
        api.expect(await store.readLeaseState(manifest.jobId)).toBe('inactive');
        let recoveries = 0;
        const owner = await store.acquire(manifest.jobId, {
          recover: async (stored) => {
            recoveries += 1;
            return stored;
          },
        });
        try {
          api.expect(await store.readLeaseState(manifest.jobId)).toBe('active');
          api.expect(recoveries).toBe(1);
        } finally {
          await owner.release();
        }
        api.expect(await store.readLeaseState(manifest.jobId)).toBe('inactive');
      },
    );

    api.it('возвращает пустую историю нового хранилища', async () => {
      const store = await createStore();
      api.expect(JSON.stringify(await store.list())).toBe('[]');
    });

    api.it(
      'перечисляет все snapshot ровно один раз в строковом порядке jobId',
      async () => {
        const store = await createStore();
        const manifests: readonly JobManifestV1[] = [
          {
            ...manifestFixture('я'),
            control: { state: 'cancelled' },
            tracks: [{ ...manifestFixture().tracks[0]!, status: 'cancelled' }],
          },
          {
            ...manifestFixture('a'),
            control: { state: 'running' },
            tracks: [
              {
                ...manifestFixture().tracks[0]!,
                status: 'completed',
                resultPath: '/music/track.mp3',
              },
            ],
          },
          manifestFixture('Z'),
        ];
        for (const manifest of manifests) await store.create(manifest);
        const listed = await store.list();
        api
          .expect(JSON.stringify(listed.map((item) => item.jobId)))
          .toBe('["Z","a","я"]');
        api
          .expect(new Set(listed.map((item) => item.jobId)).size)
          .toBe(manifests.length);
        for (const item of listed) {
          api
            .expect(JSON.stringify(item))
            .toBe(JSON.stringify(await store.read(item.jobId)));
          api
            .expect(JSON.stringify(item))
            .toBe(
              JSON.stringify(
                decodeManifest(
                  encodeManifest(
                    manifests.find(
                      (manifest) => manifest.jobId === item.jobId,
                    )!,
                  ),
                ),
              ),
            );
        }
      },
    );

    api.it(
      'читает историю при owner без повторного recovery и допускает дальнейший save',
      async () => {
        const store = await createStore();
        const manifest = manifestFixture();
        await store.create(manifest);
        let recoveries = 0;
        const owner = await store.acquire(manifest.jobId, {
          recover: async (stored) => {
            recoveries += 1;
            return stored;
          },
        });
        try {
          api
            .expect(JSON.stringify(await store.list()))
            .toBe(JSON.stringify([await store.read(manifest.jobId)]));
          api.expect(recoveries).toBe(1);
          await owner.save({
            ...owner.manifest,
            updatedAt: '2026-01-02T00:00:00.000Z',
          });
          api
            .expect((await store.list())[0]?.updatedAt)
            .toBe('2026-01-02T00:00:00.000Z');
        } finally {
          await owner.release();
        }
      },
    );

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
