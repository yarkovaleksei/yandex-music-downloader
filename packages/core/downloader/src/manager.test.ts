import { describe, expect, it } from 'vitest';
import {
  AuthenticationError,
  DiskFullError,
  PermissionError,
  ProviderError,
  ValidationError,
} from '@music-downloader/shared';
import { createDownloadManager } from './manager.js';
import { managerFixture } from './fixtures/manager-fixture.js';

const pauseOptions = { controlPollMs: 10, stopTimeoutMs: 1000 };

describe('Download Manager', () => {
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
    await manager.command('auth', 'resume');
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(
      (await fixture.deps.store.read('auth'))?.tracks.map(
        (track) => track.status,
      ),
    ).toEqual(['completed', 'completed']);
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
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(fixture.opened()).toBe(4);
    expect(fixture.files.get('retry-1.mp3')).toBe(completed);
    expect(
      (await fixture.deps.store.read('retry'))?.tracks.map(
        (track) => track.status,
      ),
    ).toEqual(['completed', 'completed', 'completed']);
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
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(
      (await fixture.deps.store.read('parallel-auth'))?.tracks.map(
        (track) => track.status,
      ),
    ).toEqual(['completed', 'completed', 'completed', 'completed']);
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
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(
      (await fixture.deps.store.read('commit-save'))?.tracks[0]?.status,
    ).toBe('completed');
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
