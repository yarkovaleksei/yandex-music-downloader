import { describe, expect, it, vi } from 'vitest';
import {
  AuthenticationError,
  DiskFullError,
  DownloadError,
  PermissionError,
  ProviderError,
  ValidationError,
} from '@music-downloader/shared';
import { createDownloadManager } from './manager.js';
import { managerFixture } from './fixtures/manager-fixture.js';

const pauseOptions = { controlPollMs: 10, stopTimeoutMs: 1000 };

describe('Download Manager', () => {
  it('использует default artworkSize=400 и дедуплицирует общую обложку', async () => {
    const fixture = managerFixture(3);
    const fetchArtwork = fixture.deps.provider.fetchArtwork;
    const requestedSizes: number[] = [];
    fixture.deps.provider.fetchArtwork = async (reference, size) => {
      requestedSizes.push(size);
      if (size === 500) throw new DownloadError();
      if (size !== 400) throw new Error('Ожидался размер обложки 400.');
      return fetchArtwork(reference, size);
    };
    await fixture.create('default-artwork-size');

    const result = await createDownloadManager(fixture.deps).run(
      'default-artwork-size',
    );

    expect(result.tracks.every((track) => track.status === 'completed')).toBe(
      true,
    );
    expect(requestedSizes).toEqual([400]);
    expect(fixture.artworkRequests()).toBe(1);
  });

  it('передаёт processing исходный album и snapshot без нового запроса artwork', async () => {
    const fixture = managerFixture(1);
    const metadata = vi.fn();
    fixture.deps.processing = { metadata };
    await fixture.create('metadata-context');

    await createDownloadManager(fixture.deps).run('metadata-context');

    expect(metadata).toHaveBeenCalledTimes(1);
    expect(metadata.mock.calls[0]?.[3]).toMatchObject({
      plannedTrack: { track: { album: { title: 'Исходный альбом' } } },
      sourceKind: 'playlist',
      resultPath: 'metadata-context-1.mp3',
      embedArtwork: true,
      saveCoverFile: true,
    });
    expect(fixture.artworkRequests()).toBe(1);
  });

  it('загружает одну обложку для album из 12 tracks', async () => {
    const fixture = managerFixture(12);
    await fixture.create('album-12');

    const result = await createDownloadManager(fixture.deps).run('album-12');

    expect(result.tracks).toHaveLength(12);
    expect(result.tracks.every((track) => track.status === 'completed')).toBe(
      true,
    );
    expect(fixture.artworkRequests()).toBe(1);
  });

  it('передаёт явный artworkSize=600 без подмены и дедуплицирует обложку', async () => {
    const fixture = managerFixture(3);
    const fetchArtwork = fixture.deps.provider.fetchArtwork;
    const requestedSizes: number[] = [];
    fixture.deps.provider.fetchArtwork = async (reference, size) => {
      requestedSizes.push(size);
      if (size !== 600) throw new Error('Ожидался размер обложки 600.');
      return fetchArtwork(reference, size);
    };
    await fixture.create('explicit-artwork-size');

    const result = await createDownloadManager(fixture.deps, {
      artworkSize: 600,
    }).run('explicit-artwork-size');

    expect(result.tracks.every((track) => track.status === 'completed')).toBe(
      true,
    );
    expect(requestedSizes).toEqual([600]);
    expect(fixture.artworkRequests()).toBe(1);
  });

  it('завершает 20 треков при concurrency=3, дедуплицирует обложку и различает позиции', async () => {
    const fixture = managerFixture();
    await fixture.create('job');
    const manager = createDownloadManager(fixture.deps);
    const result = await manager.run('job');
    expect(result.tracks.every((track) => track.status === 'completed')).toBe(
      true,
    );
    expect(fixture.opened()).toBe(20);
    expect(fixture.peak()).toBeLessThanOrEqual(3);
    expect(fixture.artworkRequests()).toBe(1);
    // F-008: подписчик видит N/total, а не только внутренние fraction трека.
    const jobs = fixture.events.filter(
      (event) => event.event === 'job.progress',
    );
    expect(jobs).toHaveLength(20);
    const completed = jobs.map((event) => Number(event.payload?.completed));
    expect(completed).toEqual([...completed].sort((a, b) => a - b));
    for (const event of jobs) {
      expect(event.payload?.total).toBe(20);
      expect(event.payload?.fraction).toBe(
        Number(event.payload?.completed) / 20,
      );
    }
    expect(jobs.at(-1)?.payload).toMatchObject({
      completed: 20,
      total: 20,
      fraction: 1,
    });
    const seq = fixture.events.map((event) => event.seq);
    expect(seq).toEqual([...new Set(seq)].sort((a, b) => a - b));
    for (const key of result.tracks.map((track) => track.trackKey)) {
      const events = fixture.events.filter((event) => event.trackKey === key);
      expect(
        events
          .filter((event) =>
            [
              'track.started',
              'variant.selected',
              'download.started',
              'download.completed',
              'metadata.written',
              'validation.completed',
            ].includes(event.event),
          )
          .map((event) => event.event),
      ).toEqual([
        'track.started',
        'variant.selected',
        'download.started',
        'download.completed',
        'metadata.written',
        'validation.completed',
      ]);
      const fractions = events
        .filter((event) => event.event === 'track.progress')
        .map((event) => event.payload?.fraction);
      expect(fractions).toEqual([...fractions].sort());
      expect(events.every((event) => event.durationMs !== undefined)).toBe(
        true,
      );
    }
  });

  it('два job одного экземпляра разделяют общий бюджет', async () => {
    const fixture = managerFixture(10);
    await fixture.create('one');
    await fixture.create('two');
    const manager = createDownloadManager(fixture.deps);
    await Promise.all([manager.run('one'), manager.run('two')]);
    expect(fixture.opened()).toBe(20);
    expect(fixture.peak()).toBeLessThanOrEqual(3);
  });

  it('STREAM_EXPIRED повторно открывает поток и учитывается в maxAttempts', async () => {
    const fixture = managerFixture(1);
    await fixture.create('expired');
    fixture.fail(() =>
      fixture.opened() === 1
        ? new ProviderError('STREAM_EXPIRED', true)
        : undefined,
    );
    expect(
      (await createDownloadManager(fixture.deps).run('expired')).tracks[0]
        ?.status,
    ).toBe('completed');
    expect(fixture.opened()).toBe(2);
    const exhausted = managerFixture(1);
    await exhausted.create('exhausted');
    exhausted.fail(() => new ProviderError('STREAM_EXPIRED', true));
    const failed = await createDownloadManager(exhausted.deps).run('exhausted');
    expect(failed.tracks[0]?.status).toBe('failed');
    expect(failed.tracks[0]?.attempts).toBe(5);
    expect(exhausted.opened()).toBe(5);
  });

  it('AUTH_ERROR ставит job на паузу без replay; resume возвращает только auth-трек', async () => {
    const fixture = managerFixture(2, 1);
    await fixture.create('auth');
    fixture.fail(() => new AuthenticationError());
    const manager = createDownloadManager(fixture.deps, pauseOptions);
    const paused = await manager.run('auth');
    expect(paused.control).toMatchObject({
      state: 'paused',
      pauseReason: 'AUTH_REQUIRED',
      pauseTrackKey: '1',
    });
    expect(paused.tracks.map((track) => track.status)).toEqual([
      'failed',
      'queued',
    ]);
    expect(fixture.opened()).toBe(1);
    fixture.fail(() => undefined);
    fixture.slow(20);
    await manager.command('auth', 'resume');
    // Resume возвращается до завершения owner-задачи, поэтому ждём фактическое terminal state.
    // Это не связывает проверку AUTH_ERROR со скоростью CI или store-операций.
    await expect
      .poll(
        async () =>
          (await fixture.deps.store.read('auth'))?.tracks.map(
            (track) => track.status,
          ),
        { timeout: 1000, interval: 10 },
      )
      .toEqual(['completed', 'completed']);
  });

  it('pause сохраняет part, не запускает ожидающие треки; cancel удаляет part', async () => {
    const fixture = managerFixture(2, 1);
    fixture.slow(30);
    await fixture.create('pause');
    const manager = createDownloadManager(fixture.deps, pauseOptions);
    const running = manager.run('pause');
    while (fixture.opened() === 0)
      await new Promise((resolve) => setTimeout(resolve, 1));
    const paused = await manager.command('pause', 'pause');
    await running;
    expect(paused.control.state).toBe('paused');
    expect(fixture.opened()).toBe(1);
    expect(fixture.files.has('pause-1.part')).toBe(true);
    await manager.command('pause', 'cancel');
    await manager.shutdown('pause');
    expect(fixture.files.has('pause-1.part')).toBe(false);
  });

  it('late skip-existing не становится completed в checkpoint helper', async () => {
    const fixture = managerFixture(1);
    await fixture.create('skip');
    fixture.deps.processing!.metadata = async () => {
      fixture.files.set('skip-1.mp3', new Uint8Array([9]));
    };
    const result = await createDownloadManager(fixture.deps).run('skip');
    expect(result.tracks[0]?.status).toBe('skipped');
    expect(fixture.files.get('skip-1.mp3')).toEqual(new Uint8Array([9]));
  });

  it('не делает rename и сохраняет прежний result при final validation failure', async () => {
    const fixture = managerFixture(1);
    await fixture.create('validation-final');
    fixture.files.set('validation-final-1.mp3', new Uint8Array([9]));
    let calls = 0;
    fixture.deps.validator = {
      validate: async () => {
        calls += 1;
        if (calls === 1 || calls === 3) throw new ValidationError();
        return { durationMs: 1 };
      },
    };
    fixture.deps.processing!.metadata = async (part) => {
      fixture.files.set(part, new Uint8Array([0]));
    };
    const result = await createDownloadManager(fixture.deps).run(
      'validation-final',
    );
    expect(result.tracks[0]?.status).toBe('failed');
    expect(fixture.files.get('validation-final-1.mp3')).toEqual(
      new Uint8Array([9]),
    );
    expect(
      fixture.events.some((event) => event.event === 'validation.completed'),
    ).toBe(false);
  });

  it('недопустимый concurrency отвергается', () => {
    const fixture = managerFixture(1);
    const bad = {
      ...fixture.deps,
      scheduler: {
        ...fixture.deps.scheduler,
        concurrency: 9,
        activeCount: 0,
        run: async <T>(run: () => Promise<T>) => run(),
      },
    };
    expect(() => createDownloadManager(bad)).toThrow(ValidationError);
  });
  it('retry перезапускает только failed и не меняет completed', async () => {
    const fixture = managerFixture(3, 1);
    await fixture.create('retry');
    fixture.fail(() =>
      fixture.opened() === 2
        ? new ProviderError('PROVIDER_RESPONSE_INVALID', false)
        : undefined,
    );
    const manager = createDownloadManager(fixture.deps, pauseOptions);
    expect(
      (await manager.run('retry')).tracks.map((track) => track.status),
    ).toEqual(['completed', 'failed', 'completed']);
    const completed = fixture.files.get('retry-1.mp3');
    await manager.command('retry', 'retry');
    await expect
      .poll(
        async () =>
          (await fixture.deps.store.read('retry'))?.tracks.map(
            (track) => track.status,
          ),
        { timeout: 1000, interval: 10 },
      )
      .toEqual(['completed', 'completed', 'completed']);
    expect(fixture.opened()).toBe(4);
    expect(fixture.files.get('retry-1.mp3')).toBe(completed);
  });

  it('paused retry_wait не возобновляется после backoff', async () => {
    const fixture = managerFixture(1);
    await fixture.create('backoff');
    fixture.fail(() => new ProviderError('STREAM_EXPIRED', true));
    let completeBackoff!: () => void;
    fixture.deps.sleep = () =>
      new Promise<void>((resolve) => {
        completeBackoff = resolve;
      });
    const manager = createDownloadManager(fixture.deps, pauseOptions);
    const running = manager.run('backoff');
    while (completeBackoff === undefined)
      await new Promise((resolve) => setTimeout(resolve, 1));
    await manager.command('backoff', 'pause');
    completeBackoff();
    await running;
    expect(fixture.opened()).toBe(1);
    expect((await fixture.deps.store.read('backoff'))?.control.state).toBe(
      'paused',
    );
    await manager.shutdown('backoff');
  });

  it('таймаут resolving сохраняет lease до завершения owned операции', async () => {
    const fixture = managerFixture(1);
    await fixture.create('resolving');
    let finish!: () => void;
    const getTrack = fixture.deps.provider.getTrack;
    fixture.deps.provider.getTrack = async (id) => {
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      return getTrack(id);
    };
    const manager = createDownloadManager(fixture.deps, {
      ...pauseOptions,
      stopTimeoutMs: 10,
    });
    const running = manager.run('resolving');
    while (finish === undefined)
      await new Promise((resolve) => setTimeout(resolve, 1));
    await expect(manager.shutdown('resolving')).rejects.toThrow();
    expect(fixture.releases).toEqual([]);
    finish();
    await running;
    expect((await fixture.deps.store.read('resolving'))?.control.state).toBe(
      'paused',
    );
    await manager.shutdown('resolving');
    expect(fixture.releases).toEqual(['resolving']);
  });

  it('STEP-049: timeout release не освобождает lease до завершения того же close', async () => {
    const fixture = managerFixture(1);
    await fixture.create('release-timeout');
    const acquire = fixture.deps.store.acquire;
    let finishRelease!: () => void;
    const releaseGate = new Promise<void>((resolve) => {
      finishRelease = resolve;
    });
    fixture.deps.store.acquire = async (...args) => {
      const session = await acquire(...args);
      return Object.create(session, {
        release: {
          value: async () => {
            await releaseGate;
            await session.release();
          },
        },
      });
    };
    const manager = createDownloadManager(fixture.deps, {
      ...pauseOptions,
      stopTimeoutMs: 10,
    });

    await expect(manager.run('release-timeout')).rejects.toThrow();
    expect(fixture.releases).toEqual([]);
    finishRelease();
    await expect
      .poll(() => fixture.releases, { timeout: 1_000, interval: 10 })
      .toEqual(['release-timeout']);
    await expect(manager.shutdown('release-timeout')).resolves.toBeUndefined();
  });

  it('STEP-049: rejection release сохраняется без ложного освобождения lease', async () => {
    const fixture = managerFixture(1);
    await fixture.create('release-rejection');
    const acquire = fixture.deps.store.acquire;
    fixture.deps.store.acquire = async (...args) => {
      const session = await acquire(...args);
      return Object.create(session, {
        release: {
          value: async () => {
            throw new Error('release failed');
          },
        },
      });
    };
    const manager = createDownloadManager(fixture.deps, pauseOptions);

    await expect(manager.run('release-rejection')).rejects.toThrow(
      'release failed',
    );
    expect(fixture.releases).toEqual([]);
    await expect(manager.shutdown('release-rejection')).rejects.toThrow(
      'release failed',
    );
    expect(fixture.releases).toEqual([]);
  });

  it('сырой текст ошибки с canary token и signed URL отсутствует в manifest/events', async () => {
    const fixture = managerFixture(1);
    await fixture.create('secrets');
    const token = 'FAKE_TOKEN_CANARY_017';
    const signed = 'https://cdn.example/audio?sign=FAKE_SIGN_CANARY_017';
    fixture.fail(() => new Error(`${token} ${signed}`));
    const manifest = await createDownloadManager(fixture.deps).run('secrets');
    const output = JSON.stringify({ manifest, events: fixture.events });
    expect(output).not.toContain(token);
    expect(output).not.toContain(signed);
  });
  it('F-002: одновременные AUTH_ERROR не каскадируют failed и resume продолжает все позиции', async () => {
    const fixture = managerFixture(4, 3);
    await fixture.create('parallel-auth');
    const getTrack = fixture.deps.provider.getTrack;
    let arrivals = 0;
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    fixture.deps.provider.getTrack = async () => {
      arrivals += 1;
      if (arrivals === 3) release();
      await barrier;
      throw new AuthenticationError();
    };
    const manager = createDownloadManager(fixture.deps, pauseOptions);
    const paused = await manager.run('parallel-auth');
    expect(paused.control.pauseReason).toBe('AUTH_REQUIRED');
    expect(
      paused.tracks.filter((track) => track.status === 'failed'),
    ).toHaveLength(1);
    fixture.deps.provider.getTrack = getTrack;
    await manager.command('parallel-auth', 'resume');
    await expect
      .poll(
        async () =>
          (await fixture.deps.store.read('parallel-auth'))?.tracks.map(
            (track) => track.status,
          ),
        { timeout: 1000, interval: 10 },
      )
      .toEqual(['completed', 'completed', 'completed', 'completed']);
    expect(fixture.opened()).toBe(4);
  });

  it('F-003: rename сохраняет commit marker при ошибке save(completed)', async () => {
    const fixture = managerFixture(1);
    await fixture.create('commit-save');
    const acquire = fixture.deps.store.acquire;
    let rejected = false;
    fixture.deps.store.acquire = async (...args) => {
      const session = await acquire(...args);
      const save = session.save.bind(session);
      session.save = async (value) => {
        if (!rejected && value.tracks[0]?.status === 'completed') {
          rejected = true;
          throw new DiskFullError();
        }
        await save(value);
      };
      return session;
    };
    const manager = createDownloadManager(fixture.deps, pauseOptions);
    const pending = await manager.run('commit-save');
    expect(pending.control).toMatchObject({
      state: 'paused',
      pauseReason: 'DISK_FULL',
    });
    expect(pending.tracks[0]?.status).toBe('processing');
    expect(pending.tracks[0]?.postProcessing).toEqual({
      size: 4,
      identity: undefined,
    });
    expect(fixture.files.has('commit-save-1.mp3')).toBe(true);
    expect(fixture.files.has('commit-save-1.part')).toBe(false);
    await manager.command('commit-save', 'resume');
    await expect
      .poll(
        async () =>
          (await fixture.deps.store.read('commit-save'))?.tracks[0]?.status,
        { timeout: 1000, interval: 10 },
      )
      .toBe('completed');
    expect(fixture.opened()).toBe(1);
  });

  it('F-004: PermissionError inspection сохраняет глобальную паузу без invalid transition', async () => {
    const fixture = managerFixture(1);
    await fixture.create('inspect-permission');
    fixture.deps.files.inspect = async () => {
      throw new PermissionError();
    };
    const pending = await createDownloadManager(fixture.deps).run(
      'inspect-permission',
    );
    expect(pending.control).toMatchObject({
      state: 'paused',
      pauseReason: 'PERMISSION_DENIED',
    });
    expect(pending.tracks[0]?.status).toBe('failed');
    expect(pending.tracks[0]?.error?.code).toBe('PERMISSION_DENIED');
    expect(fixture.opened()).toBe(0);
  });

  it('F-001: PermissionError после paused resume закрывает lease', async () => {
    const fixture = managerFixture(1);
    fixture.slow(30);
    await fixture.create('resume-permission');
    const first = createDownloadManager(fixture.deps, pauseOptions);
    const running = first.run('resume-permission');
    await expect
      .poll(() => fixture.opened(), { timeout: 1000, interval: 10 })
      .toBe(1);
    await first.command('resume-permission', 'pause');
    await running;
    await first.shutdown('resume-permission');
    expect(await fixture.deps.store.readLeaseState('resume-permission')).toBe(
      'inactive',
    );

    fixture.deps.files.inspect = async () => {
      throw new PermissionError();
    };
    const resumed = createDownloadManager(fixture.deps, pauseOptions);
    await resumed.command('resume-permission', 'resume');
    await expect
      .poll(
        async () =>
          (await fixture.deps.store.read('resume-permission'))?.control,
        { timeout: 1000, interval: 10 },
      )
      .toMatchObject({ state: 'paused', pauseReason: 'PERMISSION_DENIED' });
    await expect
      .poll(
        async () =>
          (await fixture.deps.store.read('resume-permission'))?.tracks[0]?.error
            ?.code,
        { timeout: 1000, interval: 10 },
      )
      .toBe('PERMISSION_DENIED');
    await expect
      .poll(() => fixture.deps.store.readLeaseState('resume-permission'), {
        timeout: 1000,
        interval: 10,
      })
      .toBe('inactive');
  });

  it('F-005: invalid existing файл заменяется только после успешной загрузки', async () => {
    const fixture = managerFixture(1);
    await fixture.create('invalid');
    fixture.files.set('invalid-1.mp3', new Uint8Array([9]));
    fixture.deps.files.inspect = async () => 'invalid';
    const result = await createDownloadManager(fixture.deps).run('invalid');
    expect(result.tracks[0]?.status).toBe('completed');
    expect(fixture.files.get('invalid-1.mp3')).toEqual(
      new Uint8Array([1, 1, 1, 1]),
    );
  });
});
