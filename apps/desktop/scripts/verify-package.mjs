import path from 'node:path';
import { readFile, mkdir, rm, stat, lstat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import asar from '@electron/asar';
import { getCurrentFuseWire, FuseV1Options } from '@electron/fuses';
import {
  root,
  output,
  targets,
  productName,
  json,
  save,
  sha,
  files,
  binaryTarget,
} from '../packaging/lib.mjs';

/** @link planning/tasks/STEP-035.md Проверяем реальные installer/AppImage/ZIP, а не только staging. */
if (process.platform !== 'linux')
  throw new Error('Проверка состава выполняется только на Linux');
const directory = process.argv[2] ? path.resolve(process.argv[2]) : output;
const manifest = await json(path.join(directory, 'manifest.json'));
const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    ...options,
  });
  if (result.error || result.status !== 0)
    throw result.error ?? new Error(`${command}: ${result.stderr}`);
  return result.stdout;
};
for (const [relative, expected] of Object.entries(manifest.inputs))
  assert.equal(
    sha(await readFile(path.join(root, relative))),
    expected,
    `Устаревший input: ${relative}`,
  );
assert.equal(manifest.builtOn.platform, 'linux');
assert.equal(manifest.signed, false);
assert.equal(manifest.published, false);
assert.deepEqual(
  Object.keys(manifest.targets).sort(),
  process.argv[3] === '--linux-only' ? ['linux-x64'] : [...targets].sort(),
);
const reports = {};
for (const target of Object.keys(manifest.targets)) {
  const entry = manifest.targets[target];
  const artifact = path.join(directory, entry.artifact);
  assert.equal(
    sha(await readFile(artifact)),
    entry.sha256,
    `Повреждённый ${target} artifact`,
  );
  const unpack = path.join(directory, 'verify', target);
  await rm(unpack, { recursive: true, force: true });
  await mkdir(unpack, { recursive: true });
  if (target.startsWith('linux')) {
    const offset = run(artifact, ['--appimage-offset']).trim();
    assert.match(offset, /^\d+$/);
    run('unsquashfs', ['-quiet', '-d', unpack, '-o', offset, artifact]);
  } else run('unzip', ['-q', artifact, '-d', unpack]);
  const all = await files(unpack);
  const archives = all.filter(
    (file) =>
      file.endsWith('/resources/app.asar') ||
      file.endsWith('/Resources/app.asar'),
  );
  assert.equal(
    archives.length,
    1,
    `В installer нет единственного ASAR: ${target}`,
  );
  const archive = archives[0];
  assert.equal(
    sha(await readFile(archive)),
    sha(await readFile(path.join(directory, entry.resources, 'app.asar'))),
    'Installer/staging ASAR различаются',
  );
  const names = asar
    .listPackage(archive)
    .map((name) => name.replace(/^\//, ''));
  for (const required of [
    'package.json',
    'dist/main/index.js',
    'dist/host/index.js',
    'dist/preload.cjs',
    'dist/renderer/index.html',
    'production-closure.json',
    'dist/update-trust.json',
  ])
    assert(names.includes(required), `Нет ${required}: ${target}`);
  assert(
    !names.some((name) =>
      /(?:^|\/)fixtures\/|(?:^|\/)e2e\/|native-probe|\.test\.[cm]?[jt]s/.test(
        name,
      ),
    ),
    'Тестовые данные в shipping ASAR',
  );
  const pkg = JSON.parse(asar.extractFile(archive, 'package.json'));
  assert.equal(pkg.version, manifest.version);
  assert.equal(pkg.main, 'dist/main/index.js');
  const closure = JSON.parse(
    asar.extractFile(archive, 'production-closure.json'),
  );
  const metadata = new Map(
    names
      .filter((name) => name.endsWith('/package.json'))
      .map((name) => [name, JSON.parse(asar.extractFile(archive, name))]),
  );
  const actual = [...metadata].filter(
    ([file, value]) =>
      value.name && file.endsWith(`node_modules/${value.name}/package.json`),
  );
  const identities = new Set(
    actual.map(([, value]) => `${value.name}@${value.version}`),
  );
  // Builder вправе hoist-ить package; проверяем identity и реальный Node lookup после упаковки.
  for (const item of closure)
    assert(
      identities.has(`${item.name}@${item.version}`),
      `Потерян package ${item.name}@${item.version}`,
    );
  assert(
    !names.some((name) =>
      /node_modules\/@music-downloader\/[^/]+\/src\//.test(name),
    ),
    'Workspace src в shipping ASAR',
  );
  // Node resolution проверяется от каждого package вверх: потерянная transitive dependency не скрывается manifest-ом.
  for (const [file, value] of [['package.json', pkg], ...actual]) {
    const directory = path.posix.dirname(file);
    for (const dependency of Object.keys(value.dependencies ?? {})) {
      if (Object.hasOwn(value.optionalDependencies ?? {}, dependency)) continue;
      let current = directory === '.' ? '' : directory;
      let found = false;
      for (;;) {
        const candidate = path.posix.join(
          current,
          'node_modules',
          dependency,
          'package.json',
        );
        if (metadata.has(candidate)) {
          found = true;
          break;
        }
        if (!current || current === '.') break;
        const parent = path.posix.dirname(current);
        current = parent === '.' ? '' : parent;
      }
      assert(found, `Отсутствует ${dependency}, необходимый ${value.name}`);
    }
  }
  const native = names.filter((name) => name.endsWith('.node'));
  for (const name of native) {
    assert(
      asar.statFile(archive, name).unpacked,
      `Native binary остался внутри ASAR: ${name}`,
    );
    assert.equal(binaryTarget(asar.extractFile(archive, name)), target, name);
  }
  for (const name of ['better-sqlite3', 'keyring', 'fs-native-extensions'])
    assert(
      native.some((file) => file.includes(name)),
      `Нет обязательного ${name}: ${target}`,
    );
  const resources = path.dirname(archive);
  const executable = target.startsWith('darwin')
    ? path.join(resources, '..', 'MacOS', productName)
    : path.join(
        resources,
        '..',
        target.startsWith('linux') ? 'music-downloader' : `${productName}.exe`,
      );
  assert.equal(binaryTarget(await readFile(executable)), target);
  if (!target.startsWith('win32'))
    assert((await stat(executable)).mode & 0o111, 'Утрачен executable bit');
  if (target.startsWith('darwin'))
    assert(
      (
        await lstat(
          path.resolve(
            resources,
            '../Frameworks/Electron Framework.framework/Versions/Current',
          ),
        )
      ).isSymbolicLink(),
      'Утрачена framework symlink',
    );
  const fusePath = target.startsWith('darwin')
    ? path.resolve(resources, '../..')
    : executable;
  const wire = await getCurrentFuseWire(fusePath);
  for (const name of [
    'RunAsNode',
    'EnableNodeOptionsEnvironmentVariable',
    'EnableNodeCliInspectArguments',
  ])
    assert.equal(
      wire[FuseV1Options[name]],
      48,
      `${name} не выключен: ${target}`,
    );
  assert.equal(wire[FuseV1Options.OnlyLoadAppFromAsar], 49);
  if (!target.startsWith('linux')) {
    assert.equal(wire[FuseV1Options.EnableEmbeddedAsarIntegrityValidation], 49);
    const headerHash = sha(asar.getRawHeader(archive).headerString);
    const metadataFile = target.startsWith('darwin')
      ? path.join(resources, '..', 'Info.plist')
      : executable;
    assert(
      (await readFile(metadataFile)).includes(Buffer.from(headerHash)),
      'Нет правильного embedded ASAR hash',
    );
  }
  assert(
    existsSync(path.join(directory, entry.resources, 'app.asar.unpacked')),
  );
  reports[target] = {
    status: 'PASS',
    artifactSha256: entry.sha256,
    version: pkg.version,
    productionPackages: closure.length,
    nativeFiles: native.length,
    fuses: wire,
    extracted: path.relative(directory, unpack),
    executable: path.relative(directory, executable),
  };
  console.log(
    `PASS ${target}: installer contents, closure, native, version, fuses`,
  );
}
await save(path.join(directory, 'verification.json'), {
  status: 'PASS',
  local: manifest.local,
  targets: reports,
});
