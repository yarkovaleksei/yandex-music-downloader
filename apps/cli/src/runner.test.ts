import { describe, expect, it, vi } from 'vitest';
import type {
  ApplicationApi,
  JobEvent,
} from '@music-downloader/application/contracts';
import { runCli } from './runner.js';

function api(): ApplicationApi {
  return {
    authenticate: async () => ({
      schemaVersion: 1,
      kind: 'result',
      command: 'authenticate',
      data: { id: 'a', displayName: 'Тест' },
    }),
    account: async () => ({
      schemaVersion: 1,
      kind: 'result',
      command: 'account',
      data: null,
    }),
    logout: async () => ({
      schemaVersion: 1,
      kind: 'result',
      command: 'logout',
      data: null,
    }),
    resolve: async () => ({
      schemaVersion: 1,
      kind: 'result',
      command: 'resolve',
      data: { provider: 'mock', kind: 'track', id: '1' },
    }),
    preview: async () => ({
      schemaVersion: 1,
      kind: 'result',
      command: 'preview',
      data: {
        source: { provider: 'mock', kind: 'track', id: '1' },
        title: 'x',
        kind: 'track',
        tracks: [],
      },
    }),
    createDownload: async () => ({
      schemaVersion: 1,
      kind: 'result',
      command: 'createDownload',
      data: {
        jobId: 'j',
        source: { provider: 'mock', kind: 'track', id: '1' },
        status: 'completed',
        tracks: [],
      },
    }),
    pause: async () => ({
      schemaVersion: 1,
      kind: 'result',
      command: 'pause',
      data: {
        jobId: 'j',
        source: { provider: 'mock', kind: 'track', id: '1' },
        status: 'paused',
        tracks: [],
      },
    }),
    resume: async () => ({
      schemaVersion: 1,
      kind: 'result',
      command: 'resume',
      data: {
        jobId: 'j',
        source: { provider: 'mock', kind: 'track', id: '1' },
        status: 'completed',
        tracks: [],
      },
    }),
    retry: async () => ({
      schemaVersion: 1,
      kind: 'result',
      command: 'retry',
      data: {
        jobId: 'j',
        source: { provider: 'mock', kind: 'track', id: '1' },
        status: 'completed',
        tracks: [],
      },
    }),
    cancel: async () => ({
      schemaVersion: 1,
      kind: 'result',
      command: 'cancel',
      data: {
        jobId: 'j',
        source: { provider: 'mock', kind: 'track', id: '1' },
        status: 'cancelled',
        tracks: [],
      },
    }),
    listJobs: async () => ({
      schemaVersion: 1,
      kind: 'result',
      command: 'listJobs',
      data: [],
    }),
    getJob: async () => ({
      schemaVersion: 1,
      kind: 'result',
      command: 'getJob',
      data: null,
    }),
    subscribe: () => () => undefined,
    diagnostics: async () => ({
      schemaVersion: 1,
      kind: 'result',
      command: 'diagnostics',
      data: { available: false },
    }),
    shutdown: async () => ({
      schemaVersion: 1,
      kind: 'result',
      command: 'shutdown',
      data: null,
    }),
  };
}
describe('runner', () => {
  it.each([
    { argv: ['auth'], method: 'authenticate', code: 0 },
    { argv: ['logout'], method: 'logout', code: 0 },
    { argv: ['jobs'], method: 'listJobs', code: 0 },
    { argv: ['cancel', 'j'], method: 'cancel', code: 5 },
    { argv: ['resume', 'j'], method: 'resume', code: 0 },
    { argv: ['retry', 'j'], method: 'retry', code: 0 },
  ])(
    'делегирует $argv через public ApplicationApi',
    async ({ argv, method, code }) => {
      const client = api();
      const original =
        client[
          method as
            | 'authenticate'
            | 'logout'
            | 'listJobs'
            | 'cancel'
            | 'resume'
            | 'retry'
        ];
      const spy = vi.fn(original);
      (client as unknown as Record<string, unknown>)[method] = spy;
      await expect(
        runCli({
          argv,
          env: {},
          homedir: () => '/tmp',
          stdout: () => undefined,
          stderr: () => undefined,
          signals: { on: () => undefined, off: () => undefined },
          createApplication: () => client,
        }),
      ).resolves.toBe(code);
      expect(spy).toHaveBeenCalledTimes(1);
    },
  );
  it.each(['track', 'album', 'playlist'] as const)(
    'создаёт %s через resolve и createDownload',
    async (kind) => {
      const client = api();
      const created = vi.fn(client.createDownload);
      client.createDownload = created;
      client.resolve = async () => ({
        schemaVersion: 1,
        kind: 'result',
        command: 'resolve',
        data: { provider: 'mock', kind, id: 'source' },
      });
      await expect(
        runCli({
          argv: [
            kind,
            'u',
            '--output',
            '/music',
            '--quality',
            'high',
            '--overwrite',
          ],
          env: {},
          homedir: () => '/tmp',
          stdout: () => undefined,
          stderr: () => undefined,
          signals: { on: () => undefined, off: () => undefined },
          createApplication: () => client,
        }),
      ).resolves.toBe(0);
      expect(created).toHaveBeenCalledWith({
        source: { provider: 'mock', kind, id: 'source' },
        destination: '/music',
        quality: 'high',
        overwrite: true,
      });
    },
  );
  it('показывает help без создания application', async () => {
    const createApplication = vi.fn();
    const out: string[] = [];
    await expect(
      runCli({
        argv: ['--help'],
        env: {},
        homedir: () => '/tmp',
        stdout: (v) => out.push(v),
        stderr: () => undefined,
        signals: { on: () => undefined, off: () => undefined },
        createApplication,
      }),
    ).resolves.toBe(0);
    expect(createApplication).not.toHaveBeenCalled();
    expect(out.join('\n')).toContain('download');
  });
  it('направляет help в stderr при --json без создания application', async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const createApplication = vi.fn();
    await expect(
      runCli({
        argv: ['--help', '--json'],
        env: {},
        homedir: () => '/tmp',
        stdout: (line) => stdout.push(line),
        stderr: (line) => stderr.push(line),
        signals: { on: () => undefined, off: () => undefined },
        createApplication,
      }),
    ).resolves.toBe(0);
    expect(stdout).toEqual([]);
    expect(stderr.join('\n')).toContain('download');
    expect(createApplication).not.toHaveBeenCalled();
  });
  it('не устанавливает обработчик паузы для auth', async () => {
    const signals = { on: vi.fn(), off: vi.fn() };
    await expect(
      runCli({
        argv: ['auth'],
        env: {},
        homedir: () => '/tmp',
        stdout: () => undefined,
        stderr: () => undefined,
        signals,
        createApplication: api,
      }),
    ).resolves.toBe(0);
    expect(signals.on).not.toHaveBeenCalled();
    expect(signals.off).not.toHaveBeenCalled();
  });
  it('передаёт logging и сохраняет NDJSON без human-строк', async () => {
    const out: string[] = [];
    const factory = vi.fn(() => api());
    await expect(
      runCli({
        argv: ['account', '--json', '--log-level', 'warn', '--debug'],
        env: {},
        homedir: () => '/tmp',
        stdout: (v) => out.push(v),
        stderr: () => undefined,
        signals: { on: () => undefined, off: () => undefined },
        createApplication: factory,
      }),
    ).resolves.toBe(3);
    expect(JSON.parse(out[0]!)).toMatchObject({
      kind: 'result',
      command: 'account',
      data: null,
    });
    expect(factory).toHaveBeenCalledWith({
      concurrency: 4,
      logging: { level: 'warn', debug: true },
    });
  });
  it('отклоняет неизвестную команду до application', async () => {
    const factory = vi.fn();
    await expect(
      runCli({
        argv: ['doctor'],
        env: {},
        homedir: () => '/tmp',
        stdout: () => undefined,
        stderr: () => undefined,
        signals: { on: () => undefined, off: () => undefined },
        createApplication: factory,
      }),
    ).resolves.toBe(2);
    expect(factory).not.toHaveBeenCalled();
  });
  it('выводит ошибку createDownload в NDJSON', async () => {
    const out: string[] = [];
    const client = api();
    client.resolve = async () => ({
      schemaVersion: 1,
      kind: 'result',
      command: 'resolve',
      data: { provider: 'mock', kind: 'track', id: '1' },
    });
    client.createDownload = async () => ({
      schemaVersion: 1,
      kind: 'error',
      command: 'createDownload',
      error: {
        code: 'DOWNLOAD_ERROR',
        message: 'Безопасная ошибка',
        retryable: false,
      },
    });
    await expect(
      runCli({
        argv: ['download', 'u', '--json'],
        env: {},
        homedir: () => '/tmp',
        stdout: (line) => out.push(line),
        stderr: () => undefined,
        signals: { on: () => undefined, off: () => undefined },
        createApplication: () => client,
      }),
    ).resolves.toBe(3);
    expect(JSON.parse(out.at(-1)!)).toMatchObject({
      kind: 'error',
      command: 'createDownload',
      error: { code: 'DOWNLOAD_ERROR' },
    });
  });
  it('не печатает событие чужого job', async () => {
    let listener:
      | ((event: {
          schemaVersion: 1;
          event: 'job.created' | 'track.started';
          seq: number;
          jobId: string;
          durationMs: number;
          trackKey?: string;
        }) => void)
      | undefined;
    const client = api();
    const out: string[] = [];
    client.subscribe = (callback) => {
      listener = callback as typeof listener;
      return () => undefined;
    };
    client.createDownload = async () => {
      listener!({
        schemaVersion: 1,
        event: 'job.created',
        seq: 1,
        jobId: 'target',
        durationMs: 0,
      });
      listener!({
        schemaVersion: 1,
        event: 'job.created',
        seq: 1,
        jobId: 'foreign',
        durationMs: 0,
      });
      return {
        schemaVersion: 1,
        kind: 'result',
        command: 'createDownload',
        data: {
          jobId: 'target',
          source: { provider: 'mock', kind: 'track', id: '1' },
          status: 'completed',
          tracks: [],
        },
      };
    };
    await expect(
      runCli({
        argv: ['download', 'u', '--json'],
        env: {},
        homedir: () => '/tmp',
        stdout: (line) => out.push(line),
        stderr: () => undefined,
        signals: { on: () => undefined, off: () => undefined },
        createApplication: () => client,
      }),
    ).resolves.toBe(0);
    expect(
      out
        .map((line) => JSON.parse(line))
        .filter((record) => record.event !== undefined)
        .map((record) => record.jobId),
    ).toEqual(['target']);
  });
  it('ставит pending SIGINT на паузу один раз после job.created и запуска', async () => {
    let listener: ((event: JobEvent) => void) | undefined;
    let interrupt: (() => void) | undefined;
    const client = api();
    const pause = vi.fn(async () => ({
      schemaVersion: 1 as const,
      kind: 'result' as const,
      command: 'pause',
      data: {
        jobId: 'target',
        source: { provider: 'mock', kind: 'track' as const, id: '1' },
        status: 'paused' as const,
        tracks: [],
      },
    }));
    client.pause = pause;
    client.subscribe = (callback) => {
      listener = callback;
      return () => undefined;
    };
    client.getJob = async () => ({
      schemaVersion: 1,
      kind: 'result',
      command: 'getJob',
      data: {
        jobId: 'target',
        source: { provider: 'mock', kind: 'track', id: '1' },
        status: 'running',
        tracks: [],
      },
    });
    client.createDownload = async () => {
      listener!({
        schemaVersion: 1,
        event: 'job.created',
        seq: 1,
        jobId: 'target',
        durationMs: 0,
      });
      interrupt!();
      interrupt!();
      listener!({
        schemaVersion: 1,
        event: 'track.started',
        seq: 2,
        jobId: 'target',
        trackKey: 't',
        durationMs: 0,
      });
      return {
        schemaVersion: 1,
        kind: 'result',
        command: 'createDownload',
        data: {
          jobId: 'target',
          source: { provider: 'mock', kind: 'track', id: '1' },
          status: 'paused',
          tracks: [],
        },
      };
    };
    await expect(
      runCli({
        argv: ['download', 'u'],
        env: {},
        homedir: () => '/tmp',
        stdout: () => undefined,
        stderr: () => undefined,
        signals: {
          on: (_event, callback) => {
            interrupt = callback;
          },
          off: () => undefined,
        },
        createApplication: () => client,
      }),
    ).resolves.toBe(4);
    expect(pause).toHaveBeenCalledTimes(1);
  });
  it('не создаёт download при SIGINT во время resolve', async () => {
    let interrupt: (() => void) | undefined;
    const client = api();
    const createDownload = vi.fn(client.createDownload);
    client.createDownload = createDownload;
    client.resolve = async () => {
      interrupt!();
      return {
        schemaVersion: 1,
        kind: 'result',
        command: 'resolve',
        data: { provider: 'mock', kind: 'track', id: '1' },
      };
    };
    await expect(
      runCli({
        argv: ['download', 'u'],
        env: {},
        homedir: () => '/tmp',
        stdout: () => undefined,
        stderr: () => undefined,
        signals: {
          on: (_event, callback) => {
            interrupt = callback;
          },
          off: () => undefined,
        },
        createApplication: () => client,
      }),
    ).resolves.toBe(3);
    expect(createDownload).not.toHaveBeenCalled();
  });
  it('превращает отказ shutdown в безопасный код без rejected promise', async () => {
    const client = api();
    client.shutdown = async () => ({
      schemaVersion: 1,
      kind: 'error',
      command: 'shutdown',
      error: {
        code: 'DOWNLOAD_ERROR',
        message: 'Безопасная ошибка',
        retryable: false,
        details: { reason: 'OWNER_ACK_TIMEOUT' },
      },
    });
    await expect(
      runCli({
        argv: ['account'],
        env: {},
        homedir: () => '/tmp',
        stdout: () => undefined,
        stderr: () => undefined,
        signals: { on: () => undefined, off: () => undefined },
        flush: async () => undefined,
        createApplication: () => client,
      }),
    ).resolves.toBe(6);
  });
  it('снимает обработчики и подписку до shutdown и flush', async () => {
    const order: string[] = [];
    const client = api();
    client.subscribe = () => () => {
      order.push('unsubscribe');
    };
    client.shutdown = async () => {
      order.push('shutdown');
      return {
        schemaVersion: 1,
        kind: 'result',
        command: 'shutdown',
        data: null,
      };
    };
    await runCli({
      argv: ['download', 'u'],
      env: {},
      homedir: () => '/tmp',
      stdout: () => undefined,
      stderr: () => undefined,
      signals: {
        on: () => undefined,
        off: () => {
          order.push('off');
        },
      },
      flush: async () => {
        order.push('flush');
      },
      createApplication: () => client,
    });
    expect(order).toEqual(['off', 'unsubscribe', 'shutdown', 'flush']);
  });
  it('не скрывает pause refusal и возвращает lease exit code', async () => {
    let listener: ((event: JobEvent) => void) | undefined;
    let interrupt: (() => void) | undefined;
    const client = api();
    client.subscribe = (callback) => {
      listener = callback;
      return () => undefined;
    };
    client.pause = async () => ({
      schemaVersion: 1,
      kind: 'error',
      command: 'pause',
      error: {
        code: 'DOWNLOAD_ERROR',
        message: 'Безопасный отказ',
        retryable: false,
        details: { reason: 'OWNER_ACK_TIMEOUT' },
      },
    });
    client.getJob = async () => ({
      schemaVersion: 1,
      kind: 'result',
      command: 'getJob',
      data: {
        jobId: 'j',
        source: { provider: 'mock', kind: 'track', id: '1' },
        status: 'running',
        tracks: [],
      },
    });
    client.createDownload = async () => {
      listener!({
        schemaVersion: 1,
        event: 'job.created',
        seq: 1,
        jobId: 'j',
        durationMs: 0,
      });
      interrupt!();
      listener!({
        schemaVersion: 1,
        event: 'track.started',
        seq: 2,
        jobId: 'j',
        trackKey: 't',
        durationMs: 0,
      });
      return {
        schemaVersion: 1,
        kind: 'result',
        command: 'createDownload',
        data: {
          jobId: 'j',
          source: { provider: 'mock', kind: 'track', id: '1' },
          status: 'completed',
          tracks: [],
        },
      };
    };
    const out: string[] = [];
    await expect(
      runCli({
        argv: ['download', 'u', '--json'],
        env: {},
        homedir: () => '/tmp',
        stdout: (line) => out.push(line),
        stderr: () => undefined,
        signals: {
          on: (_event, callback) => {
            interrupt = callback;
          },
          off: () => undefined,
        },
        createApplication: () => client,
      }),
    ).resolves.toBe(6);
    expect(JSON.parse(out.at(-1)!)).toMatchObject({
      kind: 'error',
      command: 'pause',
      error: { details: { reason: 'OWNER_ACK_TIMEOUT' } },
    });
  });
});
