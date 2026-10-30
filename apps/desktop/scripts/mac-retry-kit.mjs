import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {
  generateKeyPairSync,
  sign,
  verify as verifySignature,
} from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  readFile,
  writeFile,
  mkdir,
  rm,
  cp,
  chmod,
  mkdtemp,
} from 'node:fs/promises';
import {
  inventory,
  verifyKit,
  sha,
  assertReplacementInventory,
} from '../e2e/final-check.mjs';
import {
  createRun,
  resolveRun,
  assertBefore,
  checksFor,
  prepareBaseline,
  run as runLogged,
} from '../e2e/mac-retry-check.mjs';
import { repairArm64App, verifyArm64App } from './mac-signature.mjs';

const root = path.resolve(import.meta.dirname, '../../..');
const destination = path.join(root, '.cache/desktop-mac-retry');
const sourceDirectory = path.join(root, '.cache/desktop-final-check');
const evidence = path.join(
  root,
  'apps/desktop/e2e/evidence/STEP-054/native-mac-20261030',
);
const targets = ['darwin-arm64', 'darwin-x64'];
const json = async (file) => JSON.parse(await readFile(file, 'utf8'));
const save = async (file, value) => {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(value, null, 2) + '\n');
};
function run(command, args) {
  const value = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(
    value.status,
    0,
    value.error?.message ?? value.stderr + value.stdout,
  );
  return value.stdout.trim();
}
function zip(directory, file) {
  run('python3', [
    '-c',
    `import os,sys,zipfile
root,out=sys.argv[1:]
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED,compresslevel=4) as z:
 for parent,dirs,names in os.walk(root):
  dirs.sort(); names.sort()
  for name in dirs+names:
   f=os.path.join(parent,name); r=os.path.relpath(f,root)
   if os.path.islink(f):
    i=zipfile.ZipInfo(r); i.create_system=3; i.external_attr=os.lstat(f).st_mode<<16; z.writestr(i,os.readlink(f))
   elif os.path.isfile(f): z.write(f,r)
`,
    directory,
    file,
  ]);
}
function fixture(target, bytes) {
  const pair = generateKeyPairSync('ed25519');
  const descriptor = Buffer.from(
    JSON.stringify({
      schemaVersion: 1,
      version: '0.0.1',
      channel: 'stable',
      target,
      url: 'https://final-kit.invalid/payload',
      size: bytes.length,
      sha256: sha(bytes),
    }),
  );
  return {
    descriptor: descriptor.toString('base64'),
    signature: sign(null, descriptor, pair.privateKey).toString('base64'),
    publicKey: pair.publicKey
      .export({ type: 'spki', format: 'pem' })
      .toString(),
  };
}
function verifyFixture(manifest, bytes) {
  const f = manifest.updateFixture;
  const descriptor = Buffer.from(f.descriptor, 'base64');
  assert(
    verifySignature(
      null,
      descriptor,
      f.publicKey,
      Buffer.from(f.signature, 'base64'),
    ),
  );
  const data = JSON.parse(descriptor);
  assert.equal(data.target, manifest.target);
  assert.equal(data.version, '0.0.1');
  assert.equal(data.size, bytes.length);
  assert.equal(data.sha256, sha(bytes));
  assert.equal(data.sha256, manifest.nextArtifactHash);
}
function assertPlan(manifest) {
  assert.deepEqual(manifest.checkPlan, checksFor(manifest.target));
  assert.equal(manifest.nativeAcceptance, 'PENDING');
  assert.equal(manifest.reused.status, 'REUSED');
  assert.equal(
    manifest.source.revision,
    '94fa63b4dbbc9ae40b2e18c850c8e986df1d6d62',
  );
  assert(manifest.reused.reportSha256);
  assert(manifest.reused.sourceManifestSha256);
  if (manifest.target === 'darwin-x64')
    assert.equal(manifest.appArtifactHash, manifest.source.appArtifactHash);
}
/** Один вход сохраняет даже отказ runtime до Node; ручная замена остаётся явной по ADR-019. */
function launcher() {
  return String.raw`#!/bin/bash
set -uo pipefail
cd "$(dirname "$0")" || exit 1
run_id="$(date -u +%Y%m%dT%H%M%SZ)-$(printf '%08x' "$$")"
reports="$PWD/reports/$run_id"
mkdir -p "$PWD/reports" || exit 1
mkdir "$reports" || exit 1
runner="project/apps/desktop/e2e/mac-retry-check.mjs"
run_all() {
  echo "Начало: $(date -u). Отчёт: $reports"
  uname -smr
  echo "Запуск встроенного Node: ./runtime/node $runner --run $run_id"
  ./runtime/node "$runner" --run "$run_id"
  code=$?
  if [ "$code" -ne 0 ]; then
    echo "Проверка до обновления остановилась, код $code. Подробности сохранены в $reports"
    return "$code"
  fi
  echo "Автоматическая часть завершена. Осталась ручная замена приложения."
  echo "В папке replacement возьмите Yandex Music Downloader.app и перетащите в current, подтвердив Заменить."
  echo "Источник: $PWD/.runs/$run_id/replacement"
  echo "Назначение: $PWD/.runs/$run_id/current"
  if [ "$(uname -s)" = Darwin ]; then
    /usr/bin/open "$PWD/.runs/$run_id/replacement" "$PWD/.runs/$run_id/current" || true
  fi
  printf 'После замены вернитесь сюда и нажмите Enter: '
  read -r answer || { echo "Ручная замена не подтверждена; итогового PASS нет."; return 1; }
  echo "Ручная замена подтверждена: $(date -u)"
  ./runtime/node "$runner" --after --confirmed-manual-replacement --run "$run_id"
}
# pipefail/PIPESTATUS сохраняют настоящий отказ Node, а tee пишет журнал с первой команды.
run_all 2>&1 | tee "$reports/terminal.log"
statuses=("@{PIPESTATUS[@]}")
code="@{statuses[0]}"
if [ "$code" -eq 0 ] && [ "@{statuses[1]}" -ne 0 ]; then code="@{statuses[1]}"; fi
printf 'Завершение: %s\nКод запуска: %s\nОтчёт: %s\n' "$(date -u)" "$code" "$reports" | tee "$reports/launcher-summary.txt"
echo "Пришлите папку reports целиком. Лог терминала уже внутри."
if [ "$(uname -s)" = Darwin ]; then /usr/bin/open "$reports" || true; fi
if [ -t 0 ]; then read -r -p 'Нажмите Enter, чтобы закрыть окно.' answer || true; fi
exit "$code"
`.replaceAll('@{', '${');
}
async function selfCheck() {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'mac-retry-check-'));
  try {
    // Воспроизведение отказа после Finder: допускается только обычный .DS_Store рядом с .app.
    const expected = {
      'Example.app/Contents/payload': { sha256: 'original', executable: false },
    };
    assert.deepEqual(
      assertReplacementInventory(
        { ...expected, '.DS_Store': { sha256: 'finder', executable: false } },
        expected,
      ),
      ['.DS_Store'],
    );
    assert.throws(() =>
      assertReplacementInventory(
        {
          ...expected,
          'Example.app/Contents/.DS_Store': {
            sha256: 'finder',
            executable: false,
          },
        },
        expected,
      ),
    );
    assert.throws(() =>
      assertReplacementInventory(
        { ...expected, '.DS_Store': { link: 'Example.app/Contents/payload' } },
        expected,
      ),
    );
    assert.throws(() =>
      assertReplacementInventory(
        {
          ...expected,
          'Example.app/Contents/payload': {
            sha256: 'changed',
            executable: false,
          },
        },
        expected,
      ),
    );
    const logged = runLogged(
      process.execPath,
      [
        '-e',
        'process.stderr.write("Перед падением\\n"); process.kill(process.pid, "SIGKILL")',
      ],
      { logDirectory: tmp },
    );
    assert.equal(logged.signal, 'SIGKILL');
    assert.match(await readFile(logged.logs.stderr, 'utf8'), /Перед падением/);
    const fake = path.join(tmp, 'launcher-kit');
    await mkdir(path.join(fake, 'runtime'), { recursive: true });
    await writeFile(path.join(fake, 'run-check.command'), launcher());
    run('bash', ['-n', path.join(fake, 'run-check.command')]);
    const mock = path.join(fake, 'runtime/node');
    await writeFile(
      mock,
      '#!/bin/sh\necho "Диагностика отказа runtime" >&2\nexit 137\n',
    );
    await chmod(mock, 0o755);
    const failed = spawnSync('bash', [path.join(fake, 'run-check.command')], {
      encoding: 'utf8',
      timeout: 10_000,
    });
    assert.equal(failed.status, 137);
    const { readdir } = await import('node:fs/promises');
    const [launchId] = await readdir(path.join(fake, 'reports'));
    assert.match(
      await readFile(
        path.join(fake, 'reports', launchId, 'terminal.log'),
        'utf8',
      ),
      /Диагностика отказа runtime/,
    );
    assert.match(
      await readFile(
        path.join(fake, 'reports', launchId, 'launcher-summary.txt'),
        'utf8',
      ),
      /137/,
    );
    // Один запуск проходит обе фазы только после Enter; EOF не выдаёт ручную замену за выполненную.
    await writeFile(mock, '#!/bin/sh\necho "Фаза: $*"\nexit 0\n');
    const completed = spawnSync(
      'bash',
      [path.join(fake, 'run-check.command')],
      {
        encoding: 'utf8',
        input: '\n',
        timeout: 10_000,
      },
    );
    assert.equal(completed.status, 0);
    assert.match(completed.stdout, /--after --confirmed-manual-replacement/);
    const unconfirmed = spawnSync(
      'bash',
      [path.join(fake, 'run-check.command')],
      {
        encoding: 'utf8',
        input: '',
        timeout: 10_000,
      },
    );
    assert.equal(unconfirmed.status, 1);
    assert(
      !unconfirmed.stdout.includes('--after --confirmed-manual-replacement'),
    );
    const a = await createRun(tmp),
      b = await createRun(tmp);
    await assert.rejects(createRun(tmp, a.id), { code: 'EEXIST' });
    assert.notEqual(a.id, b.id);
    assert.notEqual(a.directory, b.directory);
    for (const item of [a, b]) {
      await mkdir(path.join(item.directory, 'current'));
      await writeFile(
        path.join(item.directory, 'current', 'sentinel'),
        item.id,
      );
    }
    assert.equal((await resolveRun(tmp)).id, b.id);
    assert.equal((await resolveRun(tmp, a.id)).id, a.id);
    await assert.rejects(resolveRun(tmp, '../foreign'));
    const manifest = {
      buildId: 'fixture',
      target: 'darwin-arm64',
      nextArtifactHash: 'hash',
    };
    const before = {
      ...manifest,
      runId: a.id,
      status: 'AWAITING_MANUAL_REPLACEMENT',
    };
    assertBefore(before, manifest, a.id);
    assert.throws(() => assertBefore(before, manifest, b.id));
    assert.throws(() =>
      assertBefore({ ...before, status: 'FAIL' }, manifest, a.id),
    );
    assert.throws(() =>
      assertBefore(before, { ...manifest, nextArtifactHash: 'other' }, a.id),
    );
    assert.deepEqual(checksFor('darwin-arm64'), {
      shippingN: 'EXECUTED',
      offlineE2E: 'REUSED',
      update: 'EXECUTED',
      shippingNPlus1: 'EXECUTED',
    });
    assert.deepEqual(checksFor('darwin-x64'), {
      shippingN: 'REUSED',
      offlineE2E: 'EXECUTED',
      update: 'EXECUTED',
      shippingNPlus1: 'EXECUTED',
    });
    const bytes = Buffer.from('Проверка точных байтов N+1');
    const proof = {
      target: 'darwin-arm64',
      nextArtifactHash: sha(bytes),
      updateFixture: fixture('darwin-arm64', bytes),
    };
    verifyFixture(proof, bytes);
    assert.throws(() => verifyFixture(proof, Buffer.from('Подмена')));
    // Синтетическая запись обязана проходить production decoder и попадать в реальную историю.
    const { createApplication } =
      await import('../../../packages/application/dist/index.js');
    const fixtureKit = path.join(tmp, 'baseline-kit');
    const assets = path.join(fixtureKit, 'project/apps/desktop/e2e/assets');
    await mkdir(assets, { recursive: true });
    await cp(
      path.join(root, 'apps/desktop/e2e/assets/tone.mp3'),
      path.join(assets, 'tone.mp3'),
    );
    const state = path.join(fixtureKit, 'state');
    const app = createApplication({
      stateDir: state,
      clientProfile: 'desktop',
      providerOverride: {
        async getAccount() {
          return null;
        },
      },
    });
    try {
      const baseline = await prepareBaseline(fixtureKit, state, fixtureKit);
      const history = await app.history();
      assert.equal(history.kind, 'result');
      assert.equal(history.data[0].jobId, baseline.jobId);
      assert.equal(history.data[0].bytes, baseline.bytes);
    } finally {
      await app.shutdown();
    }
    console.log(
      'PASS Mac retry: отдельные повторные run/current, before/after binding, отказ FAIL/чужого run/хеша, исключение PASS-проверок, полный stderr при SIGKILL, launcher при отказе Node, Ed25519 над итоговым payload, baseline виден production history',
    );
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}
async function addReuse(directory, original, target) {
  const isArm = target === 'darwin-arm64';
  const relative = isArm
    ? 'arm64-reports-previous-runs-0820-0822/reports/diagnostic-e2e-stdio.json'
    : 'x64-retry-reports/reports/shipping-n/window-report.json';
  const source = path.join(evidence, relative);
  const bytes = await readFile(source);
  const raw = JSON.parse(bytes);
  if (isArm) assert.equal(raw.exitCode, 0);
  else {
    assert.equal(raw.status, 'PASS');
    assert.equal(raw.uiReady, true);
  }
  const report = 'reused/' + path.basename(relative);
  await mkdir(path.join(directory, 'reused'));
  await writeFile(path.join(directory, report), bytes);
  await cp(
    path.join(evidence, 'provenance.json'),
    path.join(directory, 'reused/provenance.json'),
  );
  return {
    status: 'REUSED',
    check: isArm ? 'offlineE2E' : 'shippingN',
    report,
    reportSha256: sha(bytes),
    sourceReport: relative,
    sourceManifestSha256: sha(
      await readFile(path.join(directory, 'source-manifest.json')),
    ),
    sourceRevision: original.revision,
    sourceBuildId: original.buildId,
    inputScope: isArm
      ? 'Исходные automation Electron/runtime/host/production closure. PASS не относится к исправленному shipping arm64.'
      : 'Точный исходный portable N darwin-x64; запуск под Rosetta, не отдельное Intel-доказательство.',
    runtimeArchives: original.runtimeArchives,
    productionInputs: original.productionInputs,
    originalArtifactHash: original.appArtifactHash,
  };
}
async function buildKits() {
  assert.equal(process.platform, 'linux', 'Подготовка только на Linux');
  const originalIndex = await json(path.join(sourceDirectory, 'manifest.json'));
  const revision = run('git', ['rev-parse', 'HEAD']);
  const buildId =
    new Date().toISOString().replace(/[-:.]/g, '') + '-' + revision.slice(0, 8);
  await mkdir(destination, { recursive: true });
  const index = {
    schema: 1,
    buildId,
    revision,
    sourceBuildId: originalIndex.buildId,
    nativeAcceptance: 'PENDING',
    builtOn: { platform: 'linux', arch: process.arch },
    targets: {},
  };
  const work = await mkdtemp(path.join(destination, '.build-'));
  try {
    for (const target of targets) {
      const old = originalIndex.targets[target];
      const sourceArchive = path.join(sourceDirectory, old.archive);
      assert.equal(
        sha(await readFile(sourceArchive)),
        old.sha256,
        'Исходный архив изменён',
      );
      const directory = path.join(work, target);
      await mkdir(directory);
      run('unzip', ['-q', sourceArchive, '-d', directory]);
      const original = await json(path.join(directory, 'kit-manifest.json'));
      await verifyKit(directory, original);
      await cp(
        path.join(directory, 'kit-manifest.json'),
        path.join(directory, 'source-manifest.json'),
      );
      await rm(path.join(directory, 'kit-manifest.json'));
      const reused = await addReuse(directory, original, target);
      const signatures = [];
      if (target === 'darwin-arm64') {
        for (const name of ['n', 'n-plus-1']) {
          signatures.push(
            await repairArm64App(
              path.join(
                directory,
                'shipping-' + name,
                'Yandex Music Downloader.app',
              ),
            ),
          );
          await rm(path.join(directory, 'portable', name + '.zip'));
          zip(
            path.join(directory, 'shipping-' + name),
            path.join(directory, 'portable', name + '.zip'),
          );
        }
        // В arm64 retry нет исполняемого E2E: пройденный сценарий остаётся только в immutable provenance.
        for (const name of [
          'download.spec.mjs',
          'playwright.config.mjs',
          'prepare.mjs',
          'main.mjs',
          'run.mjs',
        ])
          await rm(path.join(directory, 'project/apps/desktop/e2e', name), {
            force: true,
          });
        for (const name of [
          'electron',
          '@playwright',
          'playwright',
          'playwright-core',
        ])
          await rm(path.join(directory, 'project/node_modules', name), {
            recursive: true,
            force: true,
          });
      } else {
        const spec = path.join(
          directory,
          'project/apps/desktop/e2e/download.spec.mjs',
        );
        const oldBytes = await readFile(spec, 'utf8');
        assert(oldBytes.includes('timeout: 15_000'));
        await writeFile(
          spec,
          oldBytes
            .replace('timeout: 15_000', 'timeout: 60_000')
            .replace(
              'await app.firstWindow()',
              'await app.firstWindow({ timeout: 60_000 })',
            ),
        );
        // Отмечаем вход до production main: пустой лог отличает отказ runtime от зависания UI/host.
        const bootstrap = path.join(
          directory,
          'project/apps/desktop/e2e/main.mjs',
        );
        const bootstrapSource = await readFile(bootstrap, 'utf8');
        assert(
          bootstrapSource.includes("await import('./dist/main/index.js');"),
        );
        await writeFile(
          bootstrap,
          bootstrapSource.replace(
            "await import('./dist/main/index.js');",
            "log('bootstrap-enter', { arch: process.arch, versions: process.versions });\napp.on('ready', () => log('app-ready'));\nlog('production-main-import');\nawait import('./dist/main/index.js');\nlog('production-main-imported');",
          ),
        );
        const config = path.join(
          directory,
          'project/apps/desktop/e2e/playwright.config.mjs',
        );
        const oldConfig = await readFile(config, 'utf8');
        await writeFile(
          config,
          oldConfig.replace('timeout: 90_000', 'timeout: 180_000'),
        );
      }
      await cp(
        path.join(root, 'apps/desktop/e2e/mac-retry-check.mjs'),
        path.join(directory, 'project/apps/desktop/e2e/mac-retry-check.mjs'),
      );
      // Новый runner использует общую проверку Finder и отдельную оценку code pages; production payload не меняется.
      await cp(
        path.join(root, 'apps/desktop/e2e/final-check.mjs'),
        path.join(directory, 'project/apps/desktop/e2e/final-check.mjs'),
      );
      await mkdir(path.join(directory, 'project/apps/desktop/scripts'), {
        recursive: true,
      });
      await cp(
        path.join(root, 'apps/desktop/scripts/mac-signature.mjs'),
        path.join(directory, 'project/apps/desktop/scripts/mac-signature.mjs'),
      );
      await writeFile(path.join(directory, 'run-check.command'), launcher());
      await chmod(path.join(directory, 'run-check.command'), 0o755);
      const runner = 'project/apps/desktop/e2e/mac-retry-check.mjs';
      for (const phase of ['before', 'after']) {
        const launcher = path.join(directory, `run-${phase}.command`);
        await writeFile(
          launcher,
          `#!/bin/sh\nset -eu\ncd "$(dirname "$0")"\nexec ./runtime/node ${runner}${phase === 'after' ? ' --after --confirmed-manual-replacement --run "${1:-$(cat latest-run.txt)}"' : ''}\n`,
        );
        await chmod(launcher, 0o755);
      }
      await writeFile(
        path.join(directory, 'README.txt'),
        `ПРОВЕРКА MAC — ${target}\n\n1. Распакуйте архив на локальный диск. Дважды нажмите run-check.command.\n2. Скрипт выполнит оставшиеся автоматические проверки и откроет две папки: replacement и current. Перетащите Yandex Music Downloader.app из replacement в current, подтвердите «Заменить». Вернитесь в Terminal и нажмите Enter. Вторая часть и проверка сохранности данных выполнятся сами.\n3. В конце откроется reports/<runId>. Пришлите папку reports целиком (можно сжать через Finder). При ошибке она также содержит журнал — вручную копировать Terminal не нужно.\n\nКаждый запуск создаёт новые каталоги: предыдущие результаты не удаляются. Не закрывайте Terminal во время проверки. Node.js, FFmpeg, компилятор, сеть и авторизация не нужны. Для x64 на Apple Silicon нужна Rosetta.\nЕсли macOS блокирует неизвестного издателя, разрешите запуск через «Конфиденциальность и безопасность» и повторите run-check.command. Если двойной щелчок не запускает скрипт: откройте Terminal, введите bash и пробел, перетащите туда run-check.command, нажмите Enter. При отказе runtime подробности находятся в reports/<runId>/terminal.log и launcher-summary.txt. Если Node начал работу — также before.json/after.json, phases.jsonl и отдельные stdout/stderr каждой команды, Electron/Playwright logs и screenshots.\n\nНе запускается повторно: ${target === 'darwin-arm64' ? 'offline E2E — ранее PASS. Sentinel истории/файла создаётся только для проверки обновления.' : 'shipping N smoke — ранее PASS через Rosetta. Выполняется только непройденный E2E и обновление.'}\nПроверка обновления требует одной ручной замены приложения; автоматической установки нет. Ad-hoc подпись не является Apple Developer ID/notarization.\nДля продолжения уже начатой попытки после замены доступен run-after.command; его run ID хранится в latest-run.txt. Обычный вход — только run-check.command.\n`,
      );
      const nextBytes = await readFile(
        path.join(directory, 'portable/n-plus-1.zip'),
      );
      const manifest = {
        schema: 2,
        buildId,
        revision,
        target,
        builtOn: index.builtOn,
        guestBuildAllowed: false,
        nativeAcceptance: 'PENDING',
        source: {
          revision: original.revision,
          buildId: original.buildId,
          archive: old.archive,
          archiveSha256: old.sha256,
          appArtifactHash: original.appArtifactHash,
          nextArtifactHash: original.nextArtifactHash,
        },
        appArtifactHash: sha(
          await readFile(path.join(directory, 'portable/n.zip')),
        ),
        nextArtifactHash: sha(nextBytes),
        nodeExecutable: original.nodeExecutable,
        shippingExecutable: original.shippingExecutable,
        reused,
        checkPlan: checksFor(target),
        signatures,
        updateFixture: fixture(target, nextBytes),
        nextShippingFiles: await inventory(
          path.join(directory, 'shipping-n-plus-1'),
        ),
        files: await inventory(directory),
      };
      assertPlan(manifest);
      verifyFixture(manifest, nextBytes);
      await save(path.join(directory, 'kit-manifest.json'), manifest);
      const archive = `music-downloader-mac-retry-${target}-${buildId}.zip`;
      zip(directory, path.join(destination, archive));
      index.targets[target] = {
        archive,
        sha256: sha(await readFile(path.join(destination, archive))),
        appArtifactHash: manifest.appArtifactHash,
        nextArtifactHash: manifest.nextArtifactHash,
        checkPlan: manifest.checkPlan,
      };
      console.log(`ГОТОВО ${target}: ${archive}`);
    }
    await save(path.join(destination, 'manifest.json'), index);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}
async function verify() {
  const index = await json(path.join(destination, 'manifest.json'));
  assert.deepEqual(Object.keys(index.targets).sort(), [...targets].sort());
  const work = await mkdtemp(path.join(destination, '.verify-'));
  try {
    for (const target of targets) {
      const item = index.targets[target];
      const archive = path.join(destination, item.archive);
      assert.equal(sha(await readFile(archive)), item.sha256);
      const directory = path.join(work, target);
      await mkdir(directory);
      run('unzip', ['-q', archive, '-d', directory]);
      const manifest = await json(path.join(directory, 'kit-manifest.json'));
      assertPlan(manifest);
      await verifyKit(directory, manifest);
      verifyFixture(
        manifest,
        await readFile(path.join(directory, 'portable/n-plus-1.zip')),
      );
      assert.equal(
        sha(await readFile(path.join(directory, manifest.reused.report))),
        manifest.reused.reportSha256,
      );
      assert.equal(
        sha(await readFile(path.join(directory, 'source-manifest.json'))),
        manifest.reused.sourceManifestSha256,
      );
      assert.deepEqual(
        await inventory(path.join(directory, 'shipping-n-plus-1')),
        manifest.nextShippingFiles,
      );
      if (target === 'darwin-arm64')
        for (const name of ['n', 'n-plus-1'])
          await verifyArm64App(
            path.join(
              directory,
              'shipping-' + name,
              'Yandex Music Downloader.app',
            ),
          );
      else
        assert.equal(
          sha(await readFile(path.join(directory, 'portable/n.zip'))),
          manifest.source.appArtifactHash,
        );
      assert(
        !Object.keys(manifest.files).some((name) =>
          /(?:^|\/)node_modules\/(?:esbuild|typescript|@esbuild)(?:\/|$)/.test(
            name,
          ),
        ),
        'В наборе не должно быть compiler packages',
      );
      for (const name of Object.keys(manifest.files).filter((name) =>
        /\.(?:pem|key)$/.test(name),
      )) {
        const text = await readFile(path.join(directory, name), 'utf8');
        assert(
          !/-----BEGIN (?:RSA |EC |ENCRYPTED |OPENSSH )?PRIVATE KEY-----/.test(
            text,
          ),
          'Приватный ключ не должен попадать в набор',
        );
      }
      console.log(
        `PASS ${target}: archive/inventory/fixture/reuse/подписи; native PENDING`,
      );
    }
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}
const mode = process.argv[2];
if (mode === '--check') await selfCheck();
else if (mode === '--verify') await verify();
else if (mode === undefined) await buildKits();
else throw new Error('Используйте без аргументов, --check либо --verify');
