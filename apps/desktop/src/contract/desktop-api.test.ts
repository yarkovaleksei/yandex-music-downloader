import { describe, expect, it, vi } from 'vitest';
import { channel, methods, parseInput } from './desktop-api.js';
import type { Method } from './desktop-api.js';
import { safeResult, success } from './result.js';
import { invokeBroker } from '../main/broker.js';
import { DirectoryRegistry } from '../main/directory-registry.js';
const source = { provider: 'mock', kind: 'track', id: '1' };
const samples: Record<Method, unknown> = {
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
  getJob: { jobId: '1' },
  diagnostics: undefined,
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
