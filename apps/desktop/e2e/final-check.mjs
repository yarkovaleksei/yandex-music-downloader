import path from 'node:path';
import os from 'node:os';
import {
  readFile,
  writeFile,
  mkdir,
  readdir,
  lstat,
  readlink,
  cp,
} from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

export const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const json = async (file) => JSON.parse(await readFile(file, 'utf8'));
const save = async (file, value) =>
  writeFile(file, JSON.stringify(value, null, 2) + '\n');

/** @link planning/tasks/STEP-054.md Учёт symlink не превращает повреждённый runtime в PASS. */
export async function inventory(directory, prefix = '') {
  const result = {};
  for (const name of (await readdir(path.join(directory, prefix))).sort()) {
    const relative = path.posix.join(prefix, name);
    const file = path.join(directory, relative);
    const info = await lstat(file);
    if (info.isSymbolicLink())
      result[relative] = { link: await readlink(file) };
    else if (info.isDirectory())
      Object.assign(result, await inventory(directory, relative));
    else
      result[relative] = {
        sha256: sha(await readFile(file)),
        bytes: info.size,
        executable: Boolean(info.mode & 0o111),
      };
  }
  return result;
}

/** @link planning/tasks/STEP-054.md Finder добавляет .DS_Store рядом с .app при ручной замене.
 * Исключаем только этот неисполняемый обычный файл в корне; payload, symlink и лишние файлы остаются под точной проверкой.
 */
export function assertReplacementInventory(actual, expected) {
  const comparable = { ...actual };
  const metadata = comparable['.DS_Store'];
  const ignored = [];
  if (
    !Object.hasOwn(expected, '.DS_Store') &&
    metadata?.executable === false &&
    !metadata.link
  ) {
    delete comparable['.DS_Store'];
    ignored.push('.DS_Store');
  }
  assert.deepEqual(
    comparable,
    expected,
    'Замените current точными файлами N+1 из проверенного download',
  );
  return ignored;
}
export async function verifyKit(directory, manifest) {
  assert.equal(manifest.builtOn.platform, 'linux');
  assert.equal(manifest.guestBuildAllowed, false);
  for (const [relative, expected] of Object.entries(manifest.files)) {
    assert(!relative.split('/').includes('..') && !path.isAbsolute(relative));
    const file = path.join(directory, relative);
    const info = await lstat(file);
    if (expected.link)
      assert.equal(await readlink(file), expected.link, relative);
    else {
      assert(info.isFile(), relative);
      assert.equal(sha(await readFile(file)), expected.sha256, relative);
      if (process.platform !== 'win32' && expected.executable)
        assert(info.mode & 0o111, relative);
    }
  }
}

/** Fixture transport ограничен фиксированным HTTPS origin; production trust не меняется. */
export async function updateProof({
  Service,
  fixture,
  payload,
  target,
  directory,
}) {
  const descriptor = Buffer.from(fixture.descriptor, 'base64');
  const signature = Buffer.from(fixture.signature, 'base64');
  const origin = 'https://final-kit.invalid';
  const results = {};
  for (const mode of ['valid', 'signature', 'size', 'hash']) {
    let revealed;
    const altered = Buffer.from(payload);
    if (mode === 'hash') altered[0] ^= 1;
    const service = new Service({
      trust: {
        feedBaseUrl: origin,
        origins: [origin],
        publicKey: fixture.publicKey,
        channel: 'stable',
      },
      currentVersion: '0.0.0',
      target,
      directory: path.join(directory, mode),
      fetch: async (value) => {
        const url = new URL(value);
        assert.equal(url.origin, origin);
        if (url.pathname.endsWith('.sig'))
          return new Response(
            mode === 'signature' ? Buffer.alloc(64) : signature,
          );
        if (url.pathname.endsWith('latest.json'))
          return new Response(descriptor);
        assert.equal(url.pathname, '/payload');
        return new Response(
          mode === 'size' ? payload.subarray(0, payload.length - 1) : altered,
        );
      },
      reveal: (file) => {
        revealed = file;
      },
    });
    const checked = await service.check();
    assert.equal(checked.status, mode === 'signature' ? 'error' : 'available');
    const downloaded = await service.download();
    assert.equal(downloaded.status, mode === 'valid' ? 'ready' : 'error');
    assert.equal(revealed, undefined, 'Автоматического открытия/запуска нет');
    const opened = await service.reveal();
    assert.equal(opened.status, mode === 'valid' ? 'ready' : 'error');
    if (mode === 'valid') {
      assert.equal(sha(await readFile(revealed)), sha(payload));
      results.downloaded = revealed;
    }
    results[mode] = { checked, downloaded, opened };
  }
  return results;
}
/** История строится из jobs и history_hidden; сравниваем точные строки, а не наличие jobId где угодно. */
async function historySnapshot(state) {
  const { default: Database } = await import('better-sqlite3');
  const database = new Database(path.join(state, 'state.sqlite3'), {
    readonly: true,
  });
  try {
    return {
      jobs: database
        .prepare(
          'SELECT job_id, manifest, control_state FROM jobs ORDER BY job_id',
        )
        .all(),
      hidden: database
        .prepare('SELECT job_id FROM history_hidden ORDER BY job_id')
        .all(),
      settings: database
        .prepare('SELECT job_id, value FROM job_settings ORDER BY job_id')
        .all(),
    };
  } finally {
    database.close();
  }
}
function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    timeout: 180_000,
    ...options,
  });
  return {
    command: [command, ...args],
    exitCode: result.status,
    signal: result.signal,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    error: result.error?.message,
  };
}
async function main() {
  const kit = path.resolve(import.meta.dirname, '../../../..');
  const manifest = await json(path.join(kit, 'kit-manifest.json'));
  const reports = path.join(kit, 'reports');
  await mkdir(reports, { recursive: true });
  const after = process.argv.includes('--after');
  const reportFile = path.join(reports, after ? 'after.json' : 'before.json');
  const externalTools =
    process.platform === 'win32'
      ? {
          node: run('where.exe', ['node']),
          ffmpeg: run('where.exe', ['ffmpeg']),
        }
      : {
          node: run('/bin/sh', ['-c', 'command -v node']),
          ffmpeg: run('/bin/sh', ['-c', 'command -v ffmpeg']),
        };
  const cleanEnvironment = Object.values(externalTools).every(
    (result) => result.exitCode === 1 && result.stdout.trim() === '',
  );
  const report = {
    status: 'FAIL',
    externalTools,
    cleanEnvironment,
    executionRuntimes:
      'Только встроенные Node/Electron по абсолютным путям; externalTools и cleanEnvironment — справочные наблюдения PATH, не условия приёмки',
    nativeAcceptance: 'PENDING',
    revision: manifest.revision,
    buildId: manifest.buildId,
    appArtifactHash: manifest.appArtifactHash,
    nextArtifactHash: manifest.nextArtifactHash,
    platform: process.platform,
    arch: process.arch,
    cpu: os.cpus().map((cpu) => cpu.model),
    os: os.release(),
    rosetta:
      process.platform === 'darwin'
        ? run('/usr/sbin/sysctl', ['-n', 'sysctl.proc_translated'])
        : null,
    hostArm64:
      process.platform === 'darwin'
        ? run('/usr/sbin/sysctl', ['-n', 'hw.optional.arm64'])
        : null,
    runtime: process.versions,
    guestBuildPerformed: false,
    commands: [],
    manualReplacement: 'PENDING',
  };
  const home = path.join(kit, 'isolated-home');
  await mkdir(home, { recursive: true });
  const state =
    process.platform === 'darwin'
      ? path.join(home, 'Library/Application Support/music-downloader')
      : process.platform === 'win32'
        ? path.join(home, 'Local/music-downloader')
        : path.join(home, '.local/state/music-downloader');
  const env = {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    LOCALAPPDATA: path.join(home, 'Local'),
    XDG_STATE_HOME: path.join(home, '.local/state'),
  };
  delete env.ELECTRON_RUN_AS_NODE;
  let e2eAttempted = false;
  const offlineE2E = (name) => {
    e2eAttempted = true;
    return run(
      process.execPath,
      [
        path.join(kit, 'project/node_modules/@playwright/test/cli.js'),
        'test',
        '--config',
        path.join(import.meta.dirname, 'playwright.config.mjs'),
      ],
      {
        cwd: path.join(kit, 'project'),
        env: {
          ...env,
          MUSIC_FINAL_KIT: '1',
          MUSIC_FINAL_STATE: state,
          MUSIC_FINAL_DIAGNOSTICS: path.join(reports, 'electron-events.jsonl'),
          MUSIC_E2E_ARTIFACTS: path.join(reports, name),
          DEBUG: 'pw:browser',
          ELECTRON_ENABLE_LOGGING: '1',
          ELECTRON_LOG_FILE: path.join(reports, 'electron-e2e.log'),
        },
      },
    );
  };
  try {
    assert.equal(
      `${process.platform}-${process.arch}`,
      manifest.target,
      'Неверная ОС/архитектура runtime',
    );
    await verifyKit(kit, manifest);
    report.integrityBefore = 'PASS';
    const shipping = path.join(kit, 'current', manifest.shippingExecutable);
    if (after) {
      assert(
        process.argv.includes('--confirmed-manual-replacement'),
        'Подтвердите выполненную ручную замену',
      );
      const before = await json(path.join(reports, 'before.json'));
      assert.equal(before.status, 'AWAITING_MANUAL_REPLACEMENT');
      assert.equal(before.buildId, manifest.buildId);
      const current = await inventory(path.join(kit, 'current'));
      // Windows ZIP не переносит POSIX execute bits; байты и symlink остаются обязательными.
      const comparable = (entries) =>
        Object.fromEntries(
          Object.entries(entries).map(([name, metadata]) => {
            const value = { ...metadata };
            if (process.platform === 'win32') delete value.executable;
            return [name, value];
          }),
        );
      report.ignoredFinderMetadata = assertReplacementInventory(
        comparable(current),
        comparable(manifest.nextShippingFiles),
      );
      report.manualReplacement = 'CONFIRMED_BY_USER';
    } else {
      // Первый запуск помещает N в отдельный рабочий каталог, не трогая эталонные portable ZIP.
      await cp(path.join(kit, 'shipping-n'), path.join(kit, 'current'), {
        recursive: true,
        errorOnExist: true,
        force: false,
        verbatimSymlinks: true,
      });
    }
    const smokeDir = path.join(
      reports,
      after ? 'shipping-n-plus-1' : 'shipping-n',
    );
    await mkdir(smokeDir, { recursive: true });
    const smoke = run(shipping, [], {
      cwd: path.dirname(shipping),
      env: {
        ...env,
        MUSIC_DOWNLOADER_SMOKE_DIR: smokeDir,
        MUSIC_DOWNLOADER_SMOKE_SEED_SETTINGS: after ? '0' : '1',
        ELECTRON_ENABLE_LOGGING: '1',
        ELECTRON_LOG_FILE: path.join(smokeDir, 'electron.log'),
      },
    });
    report.commands.push(smoke);
    await save(path.join(smokeDir, 'stdio.json'), smoke);
    assert.equal(smoke.exitCode, 0, 'Shipping process завершился с ошибкой');
    const window = await json(path.join(smokeDir, 'window-report.json'));
    assert.equal(window.status, 'PASS');
    assert.equal(window.uiReady, true);
    assert.equal(window.appVersion, after ? '0.0.1' : '0.0.0');
    assert.deepEqual(window.settings, {
      quality: 'normal',
      logging: 'debug',
      concurrency: 3,
    });
    report.shipping = window;
    if (!after) {
      const testOutput = path.join(reports, 'e2e');
      const e2e = offlineE2E('e2e');
      report.commands.push(e2e);
      await save(path.join(reports, 'e2e-stdio.json'), e2e);
      assert.equal(e2e.exitCode, 0, 'Offline UI E2E завершился с ошибкой');
      const find = async (directory) => {
        for (const entry of await readdir(directory, { withFileTypes: true })) {
          const file = path.join(directory, entry.name);
          if (entry.isDirectory()) {
            const found = await find(file);
            if (found) return found;
          } else if (entry.name === 'result.json') return file;
        }
      };
      report.e2e = await json(await find(testOutput));
      report.historySnapshot = await historySnapshot(state);
      assert(
        report.historySnapshot.jobs.some(
          (row) => row.job_id === report.e2e.jobId,
        ),
      );
      assert(
        !report.historySnapshot.hidden.some(
          (row) => row.job_id === report.e2e.jobId,
        ),
      );
      report.outputHash = sha(await readFile(report.e2e.outputPath));
      const { PortableUpdates } =
        await import('../dist/main/update/service.js');
      report.update = await updateProof({
        Service: PortableUpdates,
        fixture: manifest.updateFixture,
        payload: await readFile(path.join(kit, 'portable/n-plus-1.zip')),
        target: manifest.target,
        directory: path.join(reports, 'download'),
      });
      report.status = 'AWAITING_MANUAL_REPLACEMENT';
    } else {
      const before = await json(path.join(reports, 'before.json'));
      assert.deepEqual(
        await historySnapshot(state),
        before.historySnapshot,
        'Та же история и состояние скрытия сохраняются после shipping N+1',
      );
      assert.equal(
        sha(await readFile(before.e2e.outputPath)),
        before.outputHash,
      );
      report.e2e = before.e2e;
      report.fileAndHistoryPreserved = true;
      report.status = 'PASS';
      // @link planning/tasks/STEP-054.md Системные Node.js/FFmpeg не мешают приёмке:
      // launcher и E2E используют встроенные runtime, а все обязательные проверки уже прошли.
      report.nativeAcceptance = 'PASS';
    }
    await verifyKit(kit, manifest);
    report.integrityAfter = 'PASS';
  } catch (error) {
    report.error = error.stack;
    // Shipping FAIL сохраняется; один отдельный E2E собирает preload/load/crash причины раннего пустого окна.
    if (!after && !e2eAttempted && report.integrityBefore === 'PASS') {
      report.diagnosticE2E = offlineE2E('e2e-diagnostic');
      await save(
        path.join(reports, 'diagnostic-e2e-stdio.json'),
        report.diagnosticE2E,
      );
    }
    process.exitCode = 1;
  } finally {
    try {
      await verifyKit(kit, manifest);
      report.integrityAfter = 'PASS';
    } catch (error) {
      report.integrityAfter = 'FAIL';
      report.integrityError = error.stack;
      report.status = 'FAIL';
      report.nativeAcceptance = 'PENDING';
      process.exitCode = 1;
    }
    await save(reportFile, report);
    console.log(JSON.stringify(report, null, 2));
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
)
  await main();
