import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { appendFileSync, openSync, closeSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  readFile,
  writeFile,
  mkdir,
  cp,
  readdir,
  stat,
} from 'node:fs/promises';
import {
  inventory,
  verifyKit,
  updateProof,
  sha,
  assertReplacementInventory,
} from './final-check.mjs';
import { verifyArm64App } from '../scripts/mac-signature.mjs';

const json = async (file) => JSON.parse(await readFile(file, 'utf8'));
const save = async (file, value) => {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(value, null, 2) + '\n');
};
export const checksFor = (target) => ({
  shippingN: target === 'darwin-arm64' ? 'EXECUTED' : 'REUSED',
  offlineE2E: target === 'darwin-x64' ? 'EXECUTED' : 'REUSED',
  update: 'EXECUTED',
  shippingNPlus1: 'EXECUTED',
});

/** @link planning/tasks/STEP-054.md У каждой попытки собственные current/home: повтор не затирает отчёт и не читает чужую очередь. */
export async function createRun(kit, supplied) {
  const id =
    supplied ??
    new Date().toISOString().replace(/[-:.]/g, '') +
      '-' +
      randomUUID().slice(0, 8);
  assert(/^[\dTZ]+-[a-f\d]{8}$/.test(id), 'Некорректный run ID');
  const directory = path.join(kit, '.runs', id);
  const reports = path.join(kit, 'reports', id);
  await mkdir(path.dirname(directory), { recursive: true });
  await mkdir(directory);
  await mkdir(path.join(directory, 'home'));
  await mkdir(reports, { recursive: true });
  await writeFile(path.join(kit, 'latest-run.txt'), id + '\n');
  return { id, directory, reports };
}
export async function resolveRun(kit, supplied) {
  const id =
    supplied ??
    (await readFile(path.join(kit, 'latest-run.txt'), 'utf8')).trim();
  assert(/^[\dTZ]+-[a-f\d]{8}$/.test(id), 'Некорректный run ID');
  return {
    id,
    directory: path.join(kit, '.runs', id),
    reports: path.join(kit, 'reports', id),
  };
}
export function assertBefore(before, manifest, id) {
  assert.equal(before.runId, id, 'Другая попытка before');
  assert.equal(before.buildId, manifest.buildId, 'Другой набор');
  assert.equal(before.target, manifest.target, 'Другая архитектура');
  assert.equal(
    before.nextArtifactHash,
    manifest.nextArtifactHash,
    'Другой N+1',
  );
  assert.equal(
    before.status,
    'AWAITING_MANUAL_REPLACEMENT',
    'Сначала нужен успешный before',
  );
}
let activeReports;
let activePhase = 'before';
let commandNumber = 0;
function event(name, data = {}) {
  const entry = { time: new Date().toISOString(), event: name, ...data };
  if (activeReports)
    appendFileSync(
      path.join(activeReports, 'phases.jsonl'),
      JSON.stringify(entry) + '\n',
    );
  console.log(`[${entry.time}] ${name}`);
}

/** Дочерний процесс пишет сразу на диск: SIGKILL или timeout не теряет накопленный stderr в памяти родителя. */
export function run(command, args, options = {}) {
  const { logDirectory = activeReports, ...spawnOptions } = options;
  const prefix = `${activePhase}-${String(++commandNumber).padStart(3, '0')}-${path.basename(command)}`;
  const logs = logDirectory
    ? {
        stdout: path.join(logDirectory, prefix + '-stdout.log'),
        stderr: path.join(logDirectory, prefix + '-stderr.log'),
      }
    : undefined;
  const handles = logs
    ? [openSync(logs.stdout, 'w'), openSync(logs.stderr, 'w')]
    : [];
  event('command-start', { command: [command, ...args], logs });
  let result;
  try {
    result = spawnSync(command, args, {
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      timeout: 180_000,
      killSignal: 'SIGKILL',
      ...spawnOptions,
      ...(logs ? { stdio: ['ignore', ...handles] } : {}),
    });
  } finally {
    for (const handle of handles) closeSync(handle);
  }
  const captured = {
    command: [command, ...args],
    exitCode: result.status,
    signal: result.signal,
    error: result.error?.message,
    stdout: logs ? readFileSync(logs.stdout, 'utf8') : (result.stdout ?? ''),
    stderr: logs ? readFileSync(logs.stderr, 'utf8') : (result.stderr ?? ''),
    logs,
  };
  event('command-exit', {
    command: captured.command,
    exitCode: captured.exitCode,
    signal: captured.signal,
    error: captured.error,
    logs,
  });
  return captured;
}
async function snapshot(state) {
  const { default: Database } = await import('better-sqlite3');
  const db = new Database(path.join(state, 'state.sqlite3'), {
    readonly: true,
  });
  try {
    return Object.fromEntries(
      ['jobs', 'history_hidden', 'job_settings'].map((table) => [
        table,
        db.prepare(`SELECT * FROM ${table} ORDER BY job_id`).all(),
      ]),
    );
  } finally {
    db.close();
  }
}

/** Это подготовка sentinel для update, не повтор скачивания/E2E: синтетический manifest лежит только в новом isolated state. */
export async function prepareBaseline(kit, state, directory) {
  const { default: Database } = await import('better-sqlite3');
  const outputPath = path.join(directory, 'baseline.mp3');
  await cp(
    path.join(kit, 'project/apps/desktop/e2e/assets/tone.mp3'),
    outputPath,
  );
  const bytes = (await readFile(outputPath)).length;
  const at = new Date().toISOString();
  const source = {
    provider: 'e2e-offline',
    kind: 'track',
    id: 'mac-update-baseline',
  };
  const manifest = {
    version: 1,
    jobId: 'mac-update-baseline',
    provider: source.provider,
    source,
    quality: 'best',
    destination: directory,
    createdAt: at,
    updatedAt: at,
    control: { state: 'running' },
    plan: {
      source,
      title: 'Проверка сохранности при обновлении',
      tracks: [
        {
          position: 1,
          trackKey: '1',
          track: {
            id: source.id,
            title: 'Проверочный сигнал',
            availability: 'available',
            artists: [{ id: 'fixture', name: 'Проверочный исполнитель' }],
          },
        },
      ],
    },
    tracks: [
      {
        position: 1,
        trackKey: '1',
        status: 'completed',
        attempts: 1,
        history: [{ at, status: 'completed' }],
        updatedAt: at,
        resultPath: outputPath,
        postProcessing: { size: bytes },
      },
    ],
  };
  const db = new Database(path.join(state, 'state.sqlite3'));
  try {
    assert.equal(
      db.pragma('user_version', { simple: true }),
      3,
      'Ожидается прежняя схема fixture v3',
    );
    db.prepare(
      'INSERT INTO jobs (job_id, manifest, control_state, updated_at) VALUES (?, ?, ?, ?)',
    ).run(manifest.jobId, JSON.stringify(manifest), manifest.control.state, at);
  } finally {
    db.close();
  }
  return {
    status: 'PREPARATION',
    explanation:
      'Синтетические файл и запись истории для update; E2E не запускался повторно.',
    jobId: manifest.jobId,
    outputPath,
    bytes,
  };
}
async function findResult(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      const found = await findResult(file);
      if (found) return found;
    } else if (entry.name === 'result.json') return json(file);
  }
}
async function shipping(kit, manifest, current, runInfo, env, after) {
  const name = after ? 'shipping-n-plus-1' : 'shipping-n';
  const directory = path.join(runInfo.directory, name);
  await mkdir(directory, { recursive: true });
  const result = run(path.join(current, manifest.shippingExecutable), [], {
    cwd: current,
    env: {
      ...env,
      MUSIC_DOWNLOADER_SMOKE_DIR: directory,
      MUSIC_DOWNLOADER_SMOKE_SEED_SETTINGS: after ? '0' : '1',
      ELECTRON_ENABLE_LOGGING: '1',
      ELECTRON_LOG_FILE: path.join(directory, 'electron.log'),
    },
  });
  await save(path.join(runInfo.reports, name, 'stdio.json'), result);
  for (const file of ['window-report.json', 'window.png', 'electron.log']) {
    try {
      await cp(
        path.join(directory, file),
        path.join(runInfo.reports, name, file),
      );
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  assert.equal(
    result.exitCode,
    0,
    `Shipping завершился: signal=${result.signal ?? 'нет'}, error=${result.error ?? 'нет'}; см. ${name}/stdio.json`,
  );
  const report = await json(path.join(directory, 'window-report.json'));
  assert.equal(report.status, 'PASS');
  assert.equal(report.uiReady, true);
  assert.equal(report.appVersion, after ? '0.0.1' : '0.0.0');
  return report;
}
async function main() {
  const kit = path.resolve(import.meta.dirname, '../../../..');
  const manifest = await json(path.join(kit, 'kit-manifest.json'));
  const after = process.argv.includes('--after');
  const supplied = process.argv.includes('--run')
    ? process.argv[process.argv.indexOf('--run') + 1]
    : undefined;
  const info = after
    ? await resolveRun(kit, supplied)
    : await createRun(kit, supplied);
  activeReports = info.reports;
  activePhase = after ? 'after' : 'before';
  event(after ? 'after-start' : 'before-start', { runId: info.id });
  const current = path.join(info.directory, 'current');
  const home = path.join(info.directory, 'home');
  const state = path.join(home, 'Library/Application Support/music-downloader');
  const startedAt = Date.now();
  const env = {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    XDG_STATE_HOME: path.join(home, '.local/state'),
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const report = {
    status: 'RUNNING',
    nativeAcceptance: 'PENDING',
    runId: info.id,
    buildId: manifest.buildId,
    revision: manifest.revision,
    sourceRevision: manifest.source.revision,
    target: manifest.target,
    appArtifactHash: manifest.appArtifactHash,
    nextArtifactHash: manifest.nextArtifactHash,
    platform: process.platform,
    arch: process.arch,
    os: os.release(),
    runtime: process.versions,
    cpu: os.cpus().map((cpu) => cpu.model),
    rosetta: run('/usr/sbin/sysctl', ['-n', 'sysctl.proc_translated']),
    hostArm64: run('/usr/sbin/sysctl', ['-n', 'hw.optional.arm64']),
    guestBuildPerformed: false,
    checkPlan: checksFor(manifest.target),
    checks: Object.fromEntries(
      Object.entries(checksFor(manifest.target)).map(([name, disposition]) => [
        name,
        disposition === 'REUSED' ? 'REUSED' : 'NOT_RUN',
      ]),
    ),
    reused: manifest.reused,
    commands: [],
  };
  const checkpoint = async (phase) => {
    report.phase = phase;
    report.updatedAt = new Date().toISOString();
    event(phase);
    await save(
      path.join(info.reports, after ? 'after.json' : 'before.json'),
      report,
    );
  };
  try {
    await checkpoint('integrity-before');
    assert.equal(`${process.platform}-${process.arch}`, manifest.target);
    await verifyKit(kit, manifest);
    report.integrityBefore = 'PASS';
    if (!after) {
      await cp(path.join(kit, 'shipping-n'), current, {
        recursive: true,
        errorOnExist: true,
        force: false,
        verbatimSymlinks: true,
      });
      // codesign только читает подпись. Отказ диагностического инструмента не меняет байты и не маскирует signal запуска.
      if (manifest.target === 'darwin-arm64') {
        await checkpoint('shipping-n');
        // Проверка code pages обязательна. codesign дополнительно проверяет resource seal bundle, которого ADR-019 не требует.
        report.codeSignatureAssessment = await verifyArm64App(
          path.join(current, 'Yandex Music Downloader.app'),
        );
        report.codeSignatureDiagnostics = run('/usr/bin/codesign', [
          '--verify',
          '--strict',
          path.join(
            current,
            'Yandex Music Downloader.app/Contents/Frameworks/Electron Framework.framework/Versions/A/Electron Framework',
          ),
        ]);
        report.checks.shippingN = 'EXECUTED';
        report.shipping = await shipping(
          kit,
          manifest,
          current,
          info,
          env,
          false,
        );
        report.baseline = await prepareBaseline(kit, state, info.directory);
      } else {
        await checkpoint('offline-e2e');
        report.checks.offlineE2E = 'EXECUTED';
        const e2e = run(
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
              MUSIC_FINAL_DIAGNOSTICS: path.join(
                info.reports,
                'electron-events.jsonl',
              ),
              MUSIC_E2E_ARTIFACTS: path.join(info.reports, 'e2e'),
              DEBUG: 'pw:browser',
              ELECTRON_ENABLE_LOGGING: '1',
              ELECTRON_LOG_FILE: path.join(info.reports, 'electron-e2e.log'),
            },
            timeout: 240_000,
          },
        );
        report.commands.push(e2e);
        await save(path.join(info.reports, 'e2e-stdio.json'), e2e);
        assert.equal(
          e2e.exitCode,
          0,
          'Offline E2E не прошёл: см. e2e-stdio.json и electron-events.jsonl',
        );
        report.baseline = await findResult(path.join(info.reports, 'e2e'));
        assert.equal(report.baseline.status, 'completed');
      }
      report.historySnapshot = await snapshot(state);
      assert(
        report.historySnapshot.jobs.some(
          (job) => job.job_id === report.baseline.jobId,
        ),
      );
      report.outputHash = sha(await readFile(report.baseline.outputPath));
      const { PortableUpdates } =
        await import('../dist/main/update/service.js');
      report.checks.update = 'EXECUTED';
      await checkpoint('update-descriptor-download');
      report.update = await updateProof({
        Service: PortableUpdates,
        fixture: manifest.updateFixture,
        payload: await readFile(path.join(kit, 'portable/n-plus-1.zip')),
        target: manifest.target,
        directory: path.join(info.reports, 'download'),
      });
      // Подготавливается только источник; current заменяет пользователь по ADR-019.
      const replacement = path.join(info.directory, 'replacement');
      const unpacked = run('/usr/bin/ditto', [
        '-x',
        '-k',
        report.update.downloaded,
        replacement,
      ]);
      report.commands.push(unpacked);
      assert.equal(
        unpacked.exitCode,
        0,
        'Не удалось подготовить N+1; см. журнал ditto',
      );
      report.preparedFinderMetadata = assertReplacementInventory(
        await inventory(replacement),
        manifest.nextShippingFiles,
      );
      report.status = 'AWAITING_MANUAL_REPLACEMENT';
      report.manualReplacement = {
        current,
        replacement,
        archive: report.update.downloaded,
        next: `./run-after.command ${info.id}`,
      };
    } else {
      const before = await json(path.join(info.reports, 'before.json'));
      assertBefore(before, manifest, info.id);
      report.checks = { ...before.checks };
      assert(
        process.argv.includes('--confirmed-manual-replacement'),
        'Нужно подтверждение ручной замены',
      );
      report.ignoredFinderMetadata = assertReplacementInventory(
        await inventory(current),
        manifest.nextShippingFiles,
      );
      report.checks.shippingNPlus1 = 'EXECUTED';
      await checkpoint('shipping-n-plus-1');
      report.shipping = await shipping(kit, manifest, current, info, env, true);
      assert.deepEqual(
        await snapshot(state),
        before.historySnapshot,
        'История изменилась после update',
      );
      assert.equal(
        sha(await readFile(before.baseline.outputPath)),
        before.outputHash,
        'Файл изменился после update',
      );
      report.fileAndHistoryPreserved = true;
      report.baseline = before.baseline;
      report.status = 'PASS';
      report.nativeAcceptance = 'PASS';
    }
    await checkpoint('integrity-after');
    await verifyKit(kit, manifest);
    report.integrityAfter = 'PASS';
  } catch (error) {
    report.status = 'FAIL';
    report.nativeAcceptance = 'PENDING';
    report.error = error.stack;
    if (process.platform === 'darwin') {
      // Только свежие отчёты проверяемых процессов; чужие приложения и старые crash logs в набор не попадают.
      report.crashReports = [];
      for (const base of [os.homedir(), home]) {
        const crashDirectory = path.join(
          base,
          'Library/Logs/DiagnosticReports',
        );
        try {
          for (const name of (await readdir(crashDirectory)).filter((name) =>
            /^(Electron|Yandex Music Downloader|node)[-_].*\.(ips|crash)$/.test(
              name,
            ),
          )) {
            const source = path.join(crashDirectory, name);
            if ((await stat(source)).mtimeMs < startedAt - 2000) continue;
            const relative = 'crashes/' + name;
            await mkdir(path.join(info.reports, 'crashes'), {
              recursive: true,
            });
            await cp(source, path.join(info.reports, relative));
            report.crashReports.push(relative);
          }
        } catch (diagnosticError) {
          report.crashReports.push({
            directory: crashDirectory,
            error: diagnosticError.message,
          });
        }
      }
      report.kernelDiagnostics = run(
        '/usr/bin/log',
        [
          'show',
          '--last',
          '3m',
          '--style',
          'compact',
          '--predicate',
          '(process == "amfid" OR process == "taskgated-helper" OR process == "kernel" OR process == "ReportCrash") AND (eventMessage CONTAINS "Yandex Music Downloader" OR eventMessage CONTAINS "Electron" OR eventMessage CONTAINS "code signature")',
        ],
        { timeout: 15_000 },
      );
    }
    process.exitCode = 1;
  } finally {
    event('phase-finished', {
      status: report.status,
      phase: report.phase,
      error: report.error,
    });
    await save(
      path.join(info.reports, after ? 'after.json' : 'before.json'),
      report,
    );
    console.log(JSON.stringify(report, null, 2));
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
)
  await main();
