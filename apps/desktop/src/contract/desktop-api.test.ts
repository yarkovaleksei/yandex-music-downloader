import { describe, expect, it, vi } from 'vitest';
import { channel, methods, parseInput } from './desktop-api.js';
import type { Method } from './desktop-api.js';
import { safeResult, success } from './result.js';
import { invokeBroker } from '../main/broker.js';
import { DirectoryRegistry } from '../main/directory-registry.js';
const source = { provider: 'mock', kind: 'track', id: '1' };
const samples: Record<Method, unknown> = {
  checkUpdate: undefined,
  downloadUpdate: undefined,
  openUpdateFolder: undefined,
  authenticate: undefined,
  account: undefined,
  logout: undefined,
  resolve: { url: 'https://music.yandex.ru/track/1' },
  preview: { source },
  createDownload: {
    source,
    quality: 'best',
    directoryRef: 'dir:00000000-0000-0000-0000-000000000001',
  },
  pause: { jobId: '1' },
  resume: { jobId: '1' },
  retry: { jobId: '1' },
  cancel: { jobId: '1' },
  listJobs: undefined,
  clearDownloads: undefined,
  getDownload: { jobId: '1' },
  openDownloadsFolder: undefined,
  ffmpegHelp: undefined,
  checkFfmpeg: {},
  getJob: { jobId: '1' },
  diagnostics: undefined,
  getSettings: undefined,
  saveSettings: {
    quality: 'best',
    concurrency: 4,
    naming: 'collection',
    overwrite: false,
    logging: 'info',
  },
  history: undefined,
  historyArtwork: { jobId: '1' },
  hideHistory: { jobId: '1' },
  replay: { jobId: '1' },
  lastDiagnostics: undefined,
  refreshDiagnostics: undefined,
  selectFfmpeg: undefined,
  selectDirectory: undefined,
  showItemInFolder: { jobId: '1' },
  openExternal: { url: 'https://music.yandex.ru/' },
};
describe('DesktopApi ADR-016', () => {
  it.each(Object.keys(methods) as Method[])(
    '%s принимает закрытый DTO и отклоняет посторонние поля',
    (method) => {
      expect(() => parseInput(method, samples[method])).not.toThrow();
      expect(() =>
        parseInput(method, {
          ...(samples[method] as object),
          accessToken: 'fixture',
        }),
      ).toThrow();
      expect(channel(method)).toBe(`desktop-api:v1:${method}`);
    },
  );
  it('отклоняет чужой frame и пути вместо directoryRef до host/system side effects', async () => {
    const host = vi.fn(async () => success('host', null));
    const actions = {
      selectDirectory: vi.fn(async () => '/selected'),
      showItemInFolder: vi.fn(async () => true),
      openExternal: vi.fn(async () => undefined),
    };
    const dirs = new DirectoryRegistry();
    expect(
      await invokeBroker('account', undefined, false, dirs, actions, host),
    ).toMatchObject({ kind: 'error', error: { code: 'PERMISSION_DENIED' } });
    for (const directoryRef of [
      '/tmp/music',
      'C:\\Music',
      '\\\\server\\share',
      '//server/share',
      'https://host/dav',
      '\\\\?\\C:\\Music',
      '\\\\.\\device',
      samples.createDownload,
    ])
      expect(
        await invokeBroker(
          'createDownload',
          { source, quality: 'best', directoryRef },
          true,
          dirs,
          actions,
          host,
        ),
      ).toMatchObject({ kind: 'error' });
    expect(host).not.toHaveBeenCalled();
    expect(actions.selectDirectory).not.toHaveBeenCalled();
    const selected = dirs.add('/selected');
    expect(
      await invokeBroker(
        'createDownload',
        { source, quality: 'best', directoryRef: selected.directoryRef },
        true,
        dirs,
        actions,
        host,
      ),
    ).toMatchObject({ kind: 'result' });
    expect(host).toHaveBeenCalledWith('createDownload', {
      source,
      quality: 'best',
      destination: '/selected',
    });
  });
  it('открывает только https allowlist без credentials', async () => {
    const actions = {
      selectDirectory: async () => undefined,
      showItemInFolder: async () => false,
      openExternal: vi.fn(async () => undefined),
    };
    for (const url of [
      'file:///etc/passwd',
      'http://music.yandex.ru',
      'https://evil.example',
      'https://user:pass@music.yandex.ru',
    ])
      expect(
        await invokeBroker(
          'openExternal',
          { url },
          true,
          new DirectoryRegistry(),
          actions,
          async () => null,
        ),
      ).toMatchObject({ kind: 'error' });
    expect(actions.openExternal).not.toHaveBeenCalled();
  });
  it('при отказе системного хранилища показывает безопасную инструкцию без native message', () => {
    expect(
      safeResult(
        {
          kind: 'error',
          error: { code: 'DOWNLOAD_ERROR', message: 'native-fixture-secret' },
        },
        'account',
      ),
    ).toMatchObject({
      kind: 'error',
      error: { message: expect.stringContaining('Разблокируйте') },
    });
  });
  it('PRN-002 не пропускает token/cookie/challenge/signed URL или native error в IPC', () => {
    for (const key of [
      'accessToken',
      'cookie',
      'Authorization',
      'credential',
      'challenge',
      'stack',
    ])
      expect(
        JSON.stringify(
          safeResult(
            success('account', { [key]: 'fixture-secret' }),
            'account',
          ),
        ),
      ).not.toContain('fixture-secret');
    expect(
      JSON.stringify(
        safeResult(
          success('preview', {
            nested: 'https://cdn.example/audio?signature=fixture-secret',
          }),
          'preview',
        ),
      ),
    ).not.toContain('fixture-secret');
    expect(
      JSON.stringify(
        safeResult(
          {
            kind: 'error',
            error: {
              code: 'AUTH_ERROR',
              message: 'fixture-secret',
              details: { debug: { stack: 'fixture-secret' } },
            },
          },
          'account',
        ),
      ),
    ).not.toContain('fixture-secret');
  });
});

it('REQ-052/ADR-016: main разрешает settings refs из диалога, а default-output восстанавливается из host после restart', async () => {
  const dirs = new DirectoryRegistry();
  const selected = dirs.add('/fixture/output');
  const executable = dirs.addExecutable('/fixture/ffmpeg');
  const settings = {
    outputDirectory: '/persisted/output',
    quality: 'best',
    concurrency: 4,
    naming: 'collection',
    overwrite: false,
    ffmpegPath: null,
    logging: 'info',
  };
  const host = vi.fn(async (method: string, payload: unknown) =>
    success(method, method === 'getSettings' ? settings : payload),
  );
  const actions = {
    selectDirectory: async () => undefined,
    selectFfmpeg: async () => '/fixture/ffmpeg',
    showItemInFolder: async () => false,
    openExternal: async () => undefined,
  };
  const input = {
    quality: 'high',
    concurrency: 2,
    naming: 'album',
    overwrite: true,
    logging: 'warn',
    directoryRef: selected.directoryRef,
    ffmpegRef: executable.executableRef,
  };
  expect(
    await invokeBroker('saveSettings', input, true, dirs, actions, host),
  ).toMatchObject({ kind: 'result' });
  expect(host).toHaveBeenLastCalledWith('saveSettings', {
    quality: 'high',
    concurrency: 2,
    naming: 'album',
    overwrite: true,
    logging: 'warn',
    outputDirectory: '/fixture/output',
    ffmpegPath: '/fixture/ffmpeg',
  });
  host.mockClear();
  expect(
    await invokeBroker(
      'createDownload',
      { source, quality: 'best', directoryRef: 'default-output' },
      true,
      new DirectoryRegistry(),
      actions,
      host,
    ),
  ).toMatchObject({ kind: 'result' });
  expect(host).toHaveBeenLastCalledWith('createDownload', {
    source,
    quality: 'best',
    destination: '/persisted/output',
  });
  for (const ref of [
    '/local/path',
    'C:\\path',
    '\\\\server\\share',
    '//server/share',
    'https://host/dav',
    '\\\\?\\C:\\path',
    '\\\\.\\device',
    'dir:00000000-0000-0000-0000-000000000009',
  ]) {
    host.mockClear();
    expect(
      await invokeBroker(
        'saveSettings',
        { ...input, directoryRef: ref },
        true,
        dirs,
        actions,
        host,
      ),
    ).toMatchObject({ kind: 'error' });
    expect(host).not.toHaveBeenCalled();
  }
  for (const ref of [
    '/raw/ffmpeg',
    '\\\\server\\ffmpeg',
    'https://host/dav',
    'exe:00000000-0000-0000-0000-000000000009',
  ]) {
    host.mockClear();
    expect(
      await invokeBroker(
        'saveSettings',
        { ...input, ffmpegRef: ref },
        true,
        dirs,
        actions,
        host,
      ),
    ).toMatchObject({ kind: 'error' });
    expect(host).not.toHaveBeenCalled();
  }
});
it('REQ-052: settings runtime schema отклоняет открытые шаблоны, concurrency вне диапазона и executable path', () => {
  const input = {
    quality: 'best',
    concurrency: 4,
    naming: 'collection',
    overwrite: false,
    logging: 'info',
  };
  for (const change of [
    { concurrency: 0 },
    { concurrency: 9 },
    { concurrency: 1.5 },
    { naming: '../../{title}' },
    { quality: 'mp3' },
    { logging: 'all' },
    { ffmpegPath: '/usr/bin/ffmpeg' },
    { outputDirectory: '/tmp' },
  ])
    expect(() => parseInput('saveSettings', { ...input, ...change })).toThrow();
  expect(() =>
    parseInput('replay', { jobId: '1', source, quality: 'best' }),
  ).toThrow();
});

it('REQ-057: общая папка и FFmpeg разрешаются из trusted settings/opaque ref, помощь фиксирована', async () => {
  const dirs = new DirectoryRegistry();
  const executable = dirs.addExecutable('/fixture/ffmpeg');
  const host = vi.fn(async (method: Method) =>
    method === 'getSettings'
      ? success(method, { outputDirectory: '/fixture/music' })
      : success(method, { available: true }),
  );
  const actions = {
    selectDirectory: async () => undefined,
    showItemInFolder: async () => false,
    openDirectory: vi.fn(async () => true),
    openExternal: vi.fn(async () => {}),
  };
  expect(
    await invokeBroker(
      'openDownloadsFolder',
      undefined,
      true,
      dirs,
      actions,
      host,
    ),
  ).toMatchObject({ kind: 'result' });
  expect(actions.openDirectory).toHaveBeenCalledWith('/fixture/music');
  await invokeBroker(
    'checkFfmpeg',
    { ffmpegRef: executable.executableRef },
    true,
    dirs,
    actions,
    host,
  );
  expect(host).toHaveBeenLastCalledWith('checkFfmpeg', {
    ffmpegPath: '/fixture/ffmpeg',
  });
  expect(
    await invokeBroker(
      'checkFfmpeg',
      { ffmpegRef: '/fixture/arbitrary' },
      true,
      dirs,
      actions,
      host,
    ),
  ).toMatchObject({ kind: 'error' });
  expect(
    await invokeBroker(
      'openExternal',
      { url: 'https://ffmpeg.org/download.html#build-linux' },
      true,
      dirs,
      actions,
      host,
    ),
  ).toMatchObject({ kind: 'result' });
  expect(
    await invokeBroker(
      'openExternal',
      { url: 'https://ffmpeg.org/arbitrary' },
      true,
      dirs,
      actions,
      host,
    ),
  ).toMatchObject({ kind: 'error' });
});
