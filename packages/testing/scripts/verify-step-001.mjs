#!/usr/bin/env node
/**
 * Автоматическая проверка acceptance STEP-001 в изолированных копиях.
 *
 * Владелец: STEP-001 (toolchain). Для каждой версии Node.js (22.13.0 и 24) создаётся
 * отдельная чистая копия текущего рабочего дерева (`git ls-files -co --exclude-standard`,
 * без .git, node_modules, dist и кешей), в ней выполняются установка, quality-проверки и
 * негативные сценарии. Оригинальное дерево не изменяется (проверяется хешами).
 *
 * Node.js 22.13.0 и 24 должны быть установлены заранее (nvm install выполняется отдельно);
 * при отсутствии версии результат FAIL с точной причиной, без skip. Нужен доступ к npm registry.
 * Проверено только на Linux; платформенную матрицу ведёт STEP-002.
 */
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);
const requestedVersions = ['22.13.0', '24'];
const failures = [];

const log = (line = '') => process.stdout.write(`${line}\n`);
const fail = (message) => {
  failures.push(message);
  log(`FAIL: ${message}`);
};

const sha256 = (file) =>
  crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function listSourceFiles() {
  const result = spawnSync(
    'git',
    ['ls-files', '-co', '--exclude-standard', '-z'],
    {
      cwd: projectRoot,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  if (result.status !== 0)
    throw new Error(
      `git ls-files завершился с кодом ${result.status}: ${result.stderr}`,
    );
  return result.stdout.split('\0').filter(Boolean);
}

/** Хеш содержимого всех исходных файлов оригинального дерева. */
function treeHash(files) {
  const hash = crypto.createHash('sha256');
  for (const file of [...files].sort()) {
    const absolute = path.join(projectRoot, file);
    hash.update(`${file}\0`);
    if (fs.existsSync(absolute)) hash.update(fs.readFileSync(absolute));
  }
  return hash.digest('hex');
}

/** Ищет установленный Node.js в каталоге nvm; nvm install не вызывается. */
function findNode(version) {
  const nvmDir = process.env.NVM_DIR ?? path.join(os.homedir(), '.nvm');
  const versionsDir = path.join(nvmDir, 'versions', 'node');
  if (!fs.existsSync(versionsDir)) {
    throw new Error(
      `Каталог ${versionsDir} не найден: установите Node.js ${version} через nvm отдельно`,
    );
  }
  const compare = (a, b) => {
    const [x, y] = [a, b].map((v) =>
      v.replace(/^v/, '').split('.').map(Number),
    );
    for (let i = 0; i < 3; i += 1)
      if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
    return 0;
  };
  const candidates = fs
    .readdirSync(versionsDir)
    .filter((name) =>
      version.includes('.')
        ? name === `v${version}`
        : name.startsWith(`v${version}.`),
    )
    .sort(compare);
  const best = candidates[candidates.length - 1];
  if (best === undefined) {
    throw new Error(
      `Node.js ${version} не установлен в ${versionsDir}: выполните nvm install ${version} отдельно`,
    );
  }
  return path.join(versionsDir, best, 'bin');
}

function cleanEnvironment(extra) {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    if (/^(npm_|YARN_|COREPACK_|INIT_CWD$|NODE_OPTIONS$|NODE_ENV$)/.test(key))
      continue;
    env[key] = value;
  }
  return { ...env, ...extra };
}

/** Выполняет команду, печатает её, код завершения и хвост вывода. */
function run(label, command, args, options) {
  log(`$ ${label}`);
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    timeout: 15 * 60 * 1000,
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  const status = result.status ?? (result.error ? 127 : 1);
  const tail = output.trim().split('\n').slice(-6).join('\n');
  log(`  exit=${status}${result.error ? ` (${result.error.message})` : ''}`);
  if (tail) log(tail.replace(/^/gm, '  | '));
  return { status, output };
}

function copyWorkspace(files, destination) {
  for (const file of files) {
    const source = path.join(projectRoot, file);
    if (!fs.existsSync(source)) continue;
    const target = path.join(destination, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
    fs.chmodSync(target, fs.statSync(source).mode);
  }
}

function verifyRuntime(version, files, temporaryDirectories) {
  log(`\n=== Node.js ${version} ===`);
  let nodeBin;
  try {
    nodeBin = findNode(version);
  } catch (error) {
    fail(error.message);
    return;
  }
  const make = (prefix) => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), `step-001-${prefix}-`),
    );
    temporaryDirectories.push(directory);
    return directory;
  };
  const clean = make(`node${version.replace(/\W/g, '')}`);
  const workspace = path.join(clean, 'workspace');
  const shims = path.join(clean, 'tmp-bin');
  fs.mkdirSync(shims, { recursive: true });
  copyWorkspace(files, workspace);
  const env = cleanEnvironment({
    PATH: `${shims}${path.delimiter}${nodeBin}${path.delimiter}${process.env.PATH ?? ''}`,
    COREPACK_HOME: path.join(workspace, '.cache', 'corepack'),
    COREPACK_ENABLE_DOWNLOAD_PROMPT: '0',
  });
  const node = path.join(nodeBin, 'node');
  const yarn = (args) => ['packages/testing/scripts/run-yarn.mjs', ...args];
  const step = (label, args, expectOk = true) => {
    const result = run(
      `node ${yarn(args).join(' ')}   # ${label}`,
      node,
      yarn(args),
      { cwd: workspace, env },
    );
    if (expectOk && result.status !== 0)
      fail(`[${version}] ${label}: exit ${result.status}`);
    return result;
  };

  const versionCheck = run('node --version', node, ['--version'], {
    cwd: workspace,
    env,
  });
  if (!versionCheck.output.trim().startsWith('v'))
    fail(`[${version}] node --version не сработал`);
  fs.mkdirSync(path.join(workspace, '.cache', 'corepack'), { recursive: true });
  const enable = run(
    'corepack enable --install-directory <tmp-bin>',
    path.join(nodeBin, 'corepack'),
    ['enable', '--install-directory', shims],
    { cwd: workspace, env },
  );
  if (enable.status !== 0)
    fail(
      `[${version}] corepack enable --install-directory: exit ${enable.status}`,
    );

  const toolchain = run(
    'node packages/testing/scripts/verify-toolchain.mjs',
    node,
    ['packages/testing/scripts/verify-toolchain.mjs'],
    { cwd: workspace, env },
  );
  if (toolchain.status !== 0)
    fail(`[${version}] verify-toolchain: exit ${toolchain.status}`);

  const lockBefore = sha256(path.join(workspace, 'yarn.lock'));
  step('install --immutable', ['install', '--immutable']);
  if (sha256(path.join(workspace, 'yarn.lock')) !== lockBefore)
    fail(`[${version}] yarn.lock изменился после install --immutable`);
  else log('  yarn.lock sha256 до/после install совпадает');

  const packageRoots = [
    'packages',
    'packages/core',
    'packages/providers',
    'apps',
  ];
  const distBefore = packageRoots.some((base) => {
    const baseDir = path.join(workspace, base);
    if (!fs.existsSync(baseDir)) return false;
    return fs
      .readdirSync(baseDir, { withFileTypes: true })
      .some(
        (entry) =>
          entry.isDirectory() &&
          fs.existsSync(path.join(baseDir, entry.name, 'dist')),
      );
  });
  if (distBefore)
    fail(
      `[${version}] dist существует до build: проверка src-resolution недействительна`,
    );
  step('run lint (до build)', ['run', 'lint']);
  step('test (до build, src-resolution)', ['test']);
  step('run typecheck', ['run', 'typecheck']);
  step('run format:check', ['run', 'format:check']);
  step('run build', ['run', 'build']);

  // Негативные boundary-сценарии: по одному временному файлу за прогон.
  const violations = [
    [
      'Yandex SDK вне provider',
      'packages/application/src/neg-yandex.ts',
      "import '@dvxch/yandex-music';\n",
      'boundaries/external',
    ],
    [
      'core/retry -> core/downloader',
      'packages/core/retry/src/neg-core.ts',
      "import '@music-downloader/core-downloader';\n",
      'boundaries/dependency',
    ],
    [
      'apps value-import shared',
      'apps/cli/src/neg-shared.ts',
      "import { sharedPackage } from '@music-downloader/shared';\nexport const marker = sharedPackage;\n",
      'boundaries/dependency',
    ],
  ];
  for (const [title, relative, code, ruleId] of violations) {
    const target = path.join(workspace, relative);
    try {
      fs.writeFileSync(target, code);
      const result = step(
        `lint с нарушением: ${title}`,
        ['run', 'lint'],
        false,
      );
      if (result.status === 0)
        fail(`[${version}] ${title}: lint завершился с exit 0`);
      else if (!result.output.includes(ruleId))
        fail(`[${version}] ${title}: нет ruleId ${ruleId}`);
      else log(`  observed: exit!=0 и ruleId ${ruleId}`);
    } finally {
      fs.rmSync(target, { force: true });
    }
    step(`lint после удаления: ${title}`, ['run', 'lint']);
  }

  // inline-disable: основной проход падает на неиспользованной директиве, boundary — напрямую без inline-config.
  const disabled = path.join(workspace, 'apps/cli/src/neg-disabled.ts');
  try {
    fs.writeFileSync(
      disabled,
      "// eslint-disable-next-line boundaries/external -- попытка снять границу\nimport '@dvxch/yandex-music';\n",
    );
    const combined = step(
      'lint с eslint-disable-next-line',
      ['run', 'lint'],
      false,
    );
    if (combined.status === 0)
      fail(`[${version}] inline-disable: lint завершился с exit 0`);
    const main = step(
      'основной проход напрямую',
      ['exec', 'eslint', '.', '--max-warnings', '0'],
      false,
    );
    // Правила boundaries/* не определены в основном проходе, поэтому директива для них
    // отклоняется как «Definition for rule ... was not found» либо как неиспользованная.
    const rejected =
      /Unused eslint-disable directive|Definition for rule 'boundaries\/external' was not found/;
    if (main.status === 0 || !rejected.test(main.output)) {
      fail(
        `[${version}] inline-disable: основной проход не отклонил директиву`,
      );
    } else {
      log(
        '  observed: основной проход exit!=0 и отклоняет директиву для boundaries/external',
      );
    }
    const boundary = step(
      'boundary-проход с --no-inline-config',
      [
        'exec',
        'eslint',
        '--no-inline-config',
        '-c',
        'eslint.boundaries.config.mjs',
        'apps/cli/src/neg-disabled.ts',
      ],
      false,
    );
    if (
      boundary.status === 0 ||
      !boundary.output.includes('boundaries/external')
    ) {
      fail(
        `[${version}] inline-disable: boundary-проход не сообщил boundaries/external`,
      );
    } else
      log('  observed: boundary-проход exit!=0 и ruleId boundaries/external');
  } finally {
    fs.rmSync(disabled, { force: true });
  }
  step('lint после удаления inline-disable файла', ['run', 'lint']);

  // Рассинхронизация lockfile: immutable install обязан упасть без сети/записи.
  const cliManifest = path.join(workspace, 'apps/cli/package.json');
  const original = fs.readFileSync(cliManifest, 'utf8');
  try {
    const parsed = JSON.parse(original);
    parsed.dependencies = {
      ...parsed.dependencies,
      '@music-downloader/shared': 'workspace:*',
    };
    fs.writeFileSync(cliManifest, `${JSON.stringify(parsed, null, 2)}\n`);
    const mismatch = step(
      'install --immutable при рассинхроне yarn.lock',
      ['install', '--immutable'],
      false,
    );
    if (mismatch.status === 0)
      fail(`[${version}] mismatch yarn.lock: install --immutable не упал`);
    else if (!mismatch.output.includes('YN0028'))
      fail(`[${version}] mismatch yarn.lock: нет YN0028`);
    else
      log('  observed: exit!=0 и YN0028 (lockfile would have been modified)');
  } finally {
    fs.writeFileSync(cliManifest, original);
  }
  step('install --immutable после восстановления', ['install', '--immutable']);
  if (sha256(path.join(workspace, 'yarn.lock')) !== lockBefore)
    fail(`[${version}] yarn.lock изменился в конце прогона`);

  // Отсутствующий workspace не должен резолвиться через публичный registry (отдельная негативная копия).
  const negative = make(`negative${version.replace(/\W/g, '')}`);
  const negativeWorkspace = path.join(negative, 'workspace');
  copyWorkspace(files, negativeWorkspace);
  const negativeEnv = {
    ...env,
    COREPACK_HOME: path.join(negativeWorkspace, '.cache', 'corepack'),
  };
  const appManifest = path.join(
    negativeWorkspace,
    'packages/application/package.json',
  );
  const appOriginal = fs.readFileSync(appManifest, 'utf8');
  for (const range of ['workspace:*', '*']) {
    const parsed = JSON.parse(appOriginal);
    parsed.dependencies = {
      ...parsed.dependencies,
      '@music-downloader/missing': range,
    };
    fs.writeFileSync(appManifest, `${JSON.stringify(parsed, null, 2)}\n`);
    const result = run(
      `install с отсутствующим workspace (${range})`,
      node,
      yarn(['install']),
      { cwd: negativeWorkspace, env: negativeEnv },
    );
    if (result.status === 0)
      fail(`[${version}] отсутствующий workspace (${range}) был установлен`);
    else if (
      /registry\.(npmjs\.org|yarnpkg\.com)\/@music-downloader/.test(
        result.output,
      )
    )
      fail(
        `[${version}] отсутствующий workspace (${range}) обратился к публичному registry`,
      );
    else
      log(
        `  observed: exit!=0, обращения к публичному registry для @music-downloader нет`,
      );
    fs.writeFileSync(appManifest, appOriginal);
  }
}

function main() {
  const files = listSourceFiles();
  const hashBefore = treeHash(files);
  const temporaryDirectories = [];
  try {
    for (const version of requestedVersions)
      verifyRuntime(version, files, temporaryDirectories);
  } finally {
    for (const directory of temporaryDirectories) {
      // Удаляются только собственные каталоги из mkdtemp с защитой точного префикса.
      if (
        path.dirname(directory) === os.tmpdir() &&
        path.basename(directory).startsWith('step-001-')
      ) {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    }
  }
  const hashAfter = treeHash(listSourceFiles());
  if (hashBefore !== hashAfter)
    fail('исходное рабочее дерево изменилось во время проверки');
  else
    log(
      '\nИсходное рабочее дерево не изменилось (sha256 всех исходных файлов совпадает).',
    );
  if (failures.length > 0) {
    log(`\nSTEP-001 VERIFICATION: FAIL (${failures.length})`);
    for (const message of failures) log(`  - ${message}`);
    process.exit(1);
  }
  log('\nSTEP-001 VERIFICATION: PASS');
}

main();
