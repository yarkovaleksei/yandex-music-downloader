import { cp, mkdir, mkdtemp, symlink, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

export const repository = path.resolve(import.meta.dirname, '../../..');

/** Копия dist сохраняет относительные пути production main/preload/renderer/host. */
export async function prepare() {
  const directory = await mkdtemp(path.join(tmpdir(), 'music-desktop-e2e-'));
  try {
    const dist = path.join(directory, 'dist');
    await cp(
      path.join(import.meta.dirname, 'main.mjs'),
      path.join(directory, 'bootstrap.mjs'),
    );
    await cp(path.join(repository, 'apps/desktop/dist'), dist, {
      recursive: true,
    });
    await symlink(
      path.join(repository, 'node_modules'),
      path.join(directory, 'node_modules'),
      'junction',
    );
    for (const name of ['state', 'user-data', 'output'])
      await mkdir(path.join(directory, name));
    const host = path.join(repository, 'apps/desktop/src/host/index.ts');
    //  На госте разрешено только копирование Linux-built host.
    if (process.env.MUSIC_FINAL_KIT === '1') {
      await cp(
        path.join(repository, 'apps/desktop/dist/prebuilt-host.js'),
        path.join(dist, 'host/index.js'),
      );
    } else {
      if (process.platform !== 'linux')
        throw new Error('E2E host собирается только на Linux');
      const { build } = await import('esbuild');
      await build({
        entryPoints: [host],
        outfile: path.join(dist, 'host/index.js'),
        bundle: true,
        platform: 'node',
        format: 'esm',
        packages: 'external',
        target: 'node24',
        plugins: [
          {
            name: 'e2e-application',
            setup(builder) {
              builder.onResolve(
                { filter: /^@music-downloader\/application$/ },
                (args) =>
                  args.importer === host
                    ? {
                        path: path.join(import.meta.dirname, 'application.mjs'),
                      }
                    : undefined,
              );
            },
          },
        ],
      });
    }
    return {
      directory,
      env: {
        MUSIC_E2E_STATE:
          process.env.MUSIC_FINAL_STATE ?? path.join(directory, 'state'),
        MUSIC_E2E_USER_DATA: path.join(directory, 'user-data'),
        MUSIC_E2E_OUTPUT: path.join(directory, 'output'),
        MUSIC_E2E_AUDIO: path.join(import.meta.dirname, 'assets/tone.mp3'),
      },
    };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}
