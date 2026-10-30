import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import electron from 'electron';
const workspace = path.resolve(import.meta.dirname, '..');
const root = path.resolve(workspace, '../..');
const output = path.resolve(
  process.argv[2] ??
    path.join(
      workspace,
      // Локальные результаты проверки не входят в исходники приложения.
      '../../.cache/checks/desktop-native',
      `${process.platform}-${process.arch}`,
    ),
);
mkdirSync(output, { recursive: true });
const manifestFile = path.join(root, '../kit-manifest.json');
const kitManifest = existsSync(manifestFile)
  ? JSON.parse(readFileSync(manifestFile, 'utf8'))
  : null;
const report = {
  schema: 1,
  kitManifest,
  status: 'FAIL',
  platform: process.platform,
  arch: process.arch,
  build: { exitCode: 1, sourceHash: '', outputHash: '' },
  native: null,
  window: null,
};
function hashTree(directory, exclude = new Set()) {
  const digest = createHash('sha256');
  function walk(current) {
    for (const entry of readdirSync(current, { withFileTypes: true }).sort(
      (a, b) => a.name.localeCompare(b.name),
    )) {
      if (exclude.has(entry.name)) continue;
      const file = path.join(current, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (statSync(file).isFile()) {
        digest.update(path.relative(directory, file));
        digest.update(readFileSync(file));
      }
    }
  }
  walk(directory);
  return digest.digest('hex');
}
function hashSources() {
  const digest = createHash('sha256');
  const omit = new Set([
    'node_modules',
    'dist',
    'build',
    '.git',
    '.cache',
    '.yarn',
    'evidence',
    '__pycache__',
  ]);
  function walk(directory) {
    const entries = readdirSync(directory, { withFileTypes: true }).sort(
      (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
    );
    for (const entry of entries.filter((item) => !item.isDirectory())) {
      if (
        entry.name.startsWith('.env') ||
        /\.(log|tsbuildinfo)$/.test(entry.name)
      )
        continue;
      const file = path.join(directory, entry.name);
      digest.update(path.relative(root, file).replaceAll('\\', '/'));
      digest.update(readFileSync(file));
    }
    for (const entry of entries.filter(
      (item) => item.isDirectory() && !omit.has(item.name),
    ))
      walk(path.join(directory, entry.name));
  }
  for (const folder of ['apps', 'packages']) walk(path.join(root, folder));
  for (const name of [
    'package.json',
    'tsconfig.json',
    'tsconfig.base.json',
    'tsconfig.tests.json',
    'yarn.lock',
  ]) {
    digest.update(name);
    digest.update(readFileSync(path.join(root, name)));
  }
  return digest.digest('hex');
}
const actualSourceHash = hashSources();
if (kitManifest && actualSourceHash !== kitManifest.sourceHash)
  throw new Error('Исходники набора не совпадают с manifest');
// Target-side сборка запускается тем же Node, с которым запущен launcher набора.
const build = spawnSync(
  process.execPath,
  [path.join(workspace, 'scripts/target-build.mjs')],
  { cwd: root, stdio: 'inherit' },
);
report.build.exitCode = build.status ?? 1;
report.build.sourceHash = actualSourceHash;
if (build.status === 0) {
  report.build.outputHash = hashTree(path.join(workspace, 'dist'));
  const nativeFile = path.join(output, 'native-report.json');
  const native = spawnSync(
    electron,
    [path.join(workspace, 'platform-check/native-main.mjs')],
    {
      cwd: root,
      stdio: 'inherit',
      timeout: 90_000,
      env: { ...process.env, MD_PROBE_REPORT: nativeFile },
    },
  );
  if (existsSync(nativeFile))
    report.native = JSON.parse(readFileSync(nativeFile, 'utf8'));
  else
    report.native = {
      status: 'FAIL',
      code: native.error?.code ?? 'PROCESS_FAILED',
      exitCode: native.status,
    };
  const smoke = spawnSync(electron, [workspace], {
    cwd: root,
    stdio: 'inherit',
    timeout: 90_000,
    env: { ...process.env, MUSIC_DOWNLOADER_SMOKE_DIR: output },
  });
  if (smoke.status === 0)
    report.window = JSON.parse(
      readFileSync(path.join(output, 'window-report.json'), 'utf8'),
    );
  report.status =
    report.native?.status === 'PASS' &&
    report.window?.status === 'PASS' &&
    Object.values(report.window.isolation).every(Boolean)
      ? 'PASS'
      : 'FAIL';
}
const file = path.join(
  output,
  `report-${process.platform}-${process.arch}.json`,
);
writeFileSync(file, JSON.stringify(report, null, 2) + '\n');
console.log(`${report.status}: ${path.basename(file)}`);
process.exitCode = report.status === 'PASS' ? 0 : 1;
