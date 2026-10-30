import path from 'node:path';
import { repairArm64App } from './mac-signature.mjs';
import { mkdir, readFile, rm, cp, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { build, Platform, Arch } from 'electron-builder';
import {
  root,
  output,
  targets as allTargets,
  appId,
  productName,
  sha,
  json,
  save,
  stage,
  versionFromTag,
  files,
} from '../packaging/lib.mjs';

/** @link docs/architecture-decisions/ADR-018-linux-packaging-and-updates.md Сборщик никогда не публикует артефакты. */
if (process.platform !== 'linux')
  throw new Error('Сборка разрешена только на Linux');
// Кеш сборочных утилит отделён от home и от очищаемого каталога результатов.
process.env.ELECTRON_BUILDER_CACHE ??= path.join(
  root,
  '.cache/desktop-packaging/tools',
);
await mkdir(process.env.ELECTRON_BUILDER_CACHE, { recursive: true });
// Загруженные CLI builder являются CommonJS и не должны наследовать type:module этого monorepo.
await save(path.join(process.env.ELECTRON_BUILDER_CACHE, 'package.json'), {
  private: true,
  type: 'commonjs',
});
const args = process.argv.slice(2);
const explicitVersion = args[0] === '--local-version' ? args[1] : undefined;
if (explicitVersion) versionFromTag('v' + explicitVersion);
const linuxOnly = args.at(-1) === '--linux-only';
const modeArgs = linuxOnly ? args.slice(0, -1) : args;
const local =
  (modeArgs.length === 1 && modeArgs[0] === '--local') ||
  (modeArgs.length === 2 && Boolean(explicitVersion));
const tag =
  modeArgs.length === 2 && modeArgs[0] === '--tag' ? modeArgs[1] : null;
if (!local && !tag)
  throw new Error('Укажите --local, --local-version 0.0.1 либо --tag v1.2.3');
const targets = linuxOnly ? ['linux-x64'] : allTargets;
if (
  spawnSync('wine', ['--version'], { stdio: 'ignore' }).error?.code === 'ENOENT'
) {
  // Wine используется только как Linux build tool. Не требуем его установки в систему владельца.
  const dockerConfig = path.join(
    root,
    '.cache/desktop-packaging/docker-config',
  );
  const prepared = spawnSync(
    'docker',
    [
      '--config',
      dockerConfig,
      'build',
      '--file',
      path.join(root, 'apps/desktop/packaging/Dockerfile.build'),
      '--tag',
      'ymd-packaging',
      path.join(root, 'apps/desktop/packaging'),
    ],
    { stdio: 'inherit' },
  );
  if (prepared.error || prepared.status !== 0)
    throw (
      prepared.error ?? new Error('Не удалось подготовить Linux build image')
    );
  const image = spawnSync(
    'docker',
    [
      '--config',
      dockerConfig,
      'image',
      'inspect',
      '--format',
      '{{.Id}}',
      'ymd-packaging',
    ],
    { encoding: 'utf8' },
  );
  if (image.error || image.status !== 0)
    throw image.error ?? new Error('Не найден build image');
  const buildImage = image.stdout.trim();
  const result = spawnSync(
    'docker',
    [
      '--config',
      path.join(root, '.cache/desktop-packaging/docker-config'),
      'run',
      '--rm',
      '--init',
      '--user',
      `${process.getuid()}:${process.getgid()}`,
      '--env',
      'HOME=/tmp/ymd-build-home',
      '--env',
      'WINEPREFIX=/tmp/ymd-wine',
      '--env',
      'XDG_RUNTIME_DIR=/tmp/ymd-runtime',
      '--env',
      `YMD_PACKAGE_IMAGE=${buildImage}`,
      '--mount',
      `type=bind,source=${root},target=${root}`,
      '--workdir',
      root,
      '--entrypoint',
      '/bin/sh',
      buildImage,
      '-c',
      'mkdir -p /tmp/ymd-build-home /tmp/ymd-wine /tmp/ymd-runtime; chmod 700 /tmp/ymd-runtime; exec "$@"',
      'ymd-build',
      'xvfb-run',
      '-a',
      'node',
      import.meta.filename,
      ...args,
    ],
    { stdio: 'inherit' },
  );
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}
const run = (command, argv, options = {}) => {
  const result = spawnSync(command, argv, {
    cwd: root,
    stdio: 'inherit',
    ...options,
  });
  if (result.error || result.status !== 0)
    throw result.error ?? new Error(`${command}: exit ${result.status}`);
  return result.stdout;
};
const git = (...argv) =>
  run('git', argv, { encoding: 'utf8', stdio: 'pipe' }).trim();
const head = git('rev-parse', 'HEAD');
const version = local ? (explicitVersion ?? '0.0.0') : versionFromTag(tag);
if (!local) {
  if (git('rev-parse', `refs/tags/${tag}^{commit}`) !== head)
    throw new Error('Тег не соответствует HEAD');
  if (git('status', '--porcelain'))
    throw new Error('Релизная сборка требует чистого дерева');
}
if (
  process.env.YMD_PACKAGE_IMAGE &&
  !existsSync(path.join(process.env.WINEPREFIX, 'system.reg'))
) {
  // NSIS не использует .NET/HTML: первый запуск Wine не должен открывать установщики Mono/Gecko.
  const initialized = spawnSync('wineboot', ['-u'], {
    stdio: 'inherit',
    timeout: 60_000,
    env: {
      ...process.env,
      WINEDLLOVERRIDES: 'mscoree,mshtml=;winemenubuilder.exe=d',
    },
  });
  if (initialized.error || initialized.status !== 0)
    throw initialized.error ?? new Error('Не удалось подготовить Wine prefix');
}
const toolingInputs = {};
for (const file of [
  'package.json',
  'apps/desktop/package.json',
  'yarn.lock',
  'docs/brand/icon.png',
  ...(await files(path.join(root, 'apps/desktop/packaging'))),
  ...(await files(path.join(root, 'apps/desktop/scripts'))),
]) {
  const absolute = path.isAbsolute(file) ? file : path.join(root, file);
  toolingInputs[path.relative(root, absolute)] = sha(await readFile(absolute));
}
run('npm', ['run', 'build']);
const buildRoot = local
  ? version === '0.0.0'
    ? output
    : path.join(root, '.cache/desktop-packaging', `local-${version}`)
  : path.join(root, '.cache/desktop-packaging', tag);
await rm(buildRoot, { recursive: true, force: true });
await mkdir(buildRoot, { recursive: true });
const resources = path.join(buildRoot, 'brand');
await mkdir(resources);
// Форматы и размеры создаёт закреплённый builder из исходной утверждённой иконки.
await cp(
  path.join(root, 'docs/brand/icon.png'),
  path.join(resources, 'icon.png'),
);
const checksum = await json(
  path.join(root, 'node_modules/electron/checksums.json'),
);
const manifest = {
  schema: 1,
  version,
  tag,
  local,
  signed: false,
  published: false,
  gitHead: head,
  builtOn: { platform: process.platform, arch: process.arch },
  buildToolImage: process.env.YMD_PACKAGE_IMAGE ?? null,
  buildNode: process.version,
  inputs: {},
  targets: {},
};
const electronVersion = (
  await json(path.join(root, 'node_modules/electron/package.json'))
).version;
const stagingRoot = await mkdtemp(path.join(tmpdir(), 'ymd-packaging-'));
for (const target of targets) {
  const [platform, arch] = target.split('-');
  const directory = path.join(stagingRoot, target);
  const staged = await stage(target, directory, version);
  for (const [file, hash] of Object.entries(staged.inputs)) {
    if (manifest.inputs[file] && manifest.inputs[file] !== hash)
      throw new Error(`Input изменился между target сборками: ${file}`);
    manifest.inputs[file] = hash;
  }
  const name = `electron-v${electronVersion}-${target}.zip`;
  const electronArchive = path.join(
    root,
    '.cache/desktop-platform-check/downloads',
    name,
  );
  if (!existsSync(electronArchive)) {
    const response = await fetch(
      `https://github.com/electron/electron/releases/download/v${electronVersion}/${name}`,
    );
    if (!response.ok)
      throw new Error(`Не удалось скачать ${name}: HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (sha(bytes) !== checksum[name])
      throw new Error(`Неверный SHA256 загруженного ${name}`);
    await mkdir(path.dirname(electronArchive), { recursive: true });
    await import('node:fs/promises').then(({ writeFile }) =>
      writeFile(electronArchive, bytes),
    );
  }
  if (sha(await readFile(electronArchive)) !== checksum[name])
    throw new Error(`Electron checksum не совпал: ${target}`);
  const out = path.join(buildRoot, target);
  const fuses = {
    runAsNode: false,
    enableNodeOptionsEnvironmentVariable: false,
    enableNodeCliInspectArguments: false,
    onlyLoadAppFromAsar: true,
    enableEmbeddedAsarIntegrityValidation: platform !== 'linux',
    resetAdHocDarwinSignature: false,
  };
  const artifacts = await build({
    publish: 'never',
    projectDir: directory,
    targets: (platform === 'darwin'
      ? Platform.MAC
      : platform === 'win32'
        ? Platform.WINDOWS
        : Platform.LINUX
    ).createTarget(
      platform === 'darwin' ? 'zip' : platform === 'win32' ? 'zip' : 'AppImage',
      arch === 'x64' ? Arch.x64 : Arch.arm64,
    ),
    config: {
      appId,
      productName,
      electronVersion,
      electronDist: electronArchive,
      directories: { app: directory, output: out, buildResources: resources },
      files: ['**/*'],
      asar: true,
      asarUnpack: ['**/*.node', '**/*.dylib', '**/*.so'],
      npmRebuild: false,
      nodeGypRebuild: false,
      electronFuses: fuses,
      afterPack: async (context) => {
        // Custom electronDist сохраняет демонстрационное приложение Electron; shipping содержит только наше.
        const resources =
          platform === 'darwin'
            ? path.join(
                context.appOutDir,
                `${productName}.app`,
                'Contents/Resources',
              )
            : path.join(context.appOutDir, 'resources');
        await rm(path.join(resources, 'default_app.asar'), { force: true });
      },
      artifactName: `music-downloader-${version}-${target}.${platform === 'linux' ? 'AppImage' : 'zip'}`,
      mac: {
        target: 'zip',
        identity: null,
        hardenedRuntime: false,
        icon: path.join(resources, 'icon.png'),
      },
      win: {
        target: 'zip',
        icon: path.join(resources, 'icon.png'),
        signAndEditExecutable: true,
        signExecutable: false,
      },
      linux: {
        target: 'AppImage',
        category: 'AudioVideo',
        icon: path.join(resources, 'icon.png'),
        executableName: 'music-downloader',
      },
    },
  });
  const extension = platform === 'linux' ? '.AppImage' : '.zip';
  const artifact = artifacts.find((file) => file.endsWith(extension));
  if (!artifact) throw new Error(`Не создан ${extension}: ${target}`);
  const tree = (await files(out)).filter(
    (file) => path.basename(file) === 'app.asar',
  );
  if (tree.length !== 1)
    throw new Error(`Не найден единственный app.asar: ${target}`);
  const packaged = path.dirname(tree[0]);
  let adHocRepair;
  if (target === 'darwin-arm64') {
    //  Builder меняет fuses после afterPack.
    // Подпись восстанавливается после build; итоговый ZIP и manifest получают только исправленные байты.
    const app = path.resolve(packaged, '../..');
    adHocRepair = await repairArm64App(app);
    run('python3', [
      '-c',
      `import os,sys,zipfile
root,out=sys.argv[1:]
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED,compresslevel=4) as z:
 for parent,dirs,names in os.walk(root):
  for name in sorted(dirs+names):
   file=os.path.join(parent,name); rel=os.path.relpath(file,root)
   if os.path.islink(file):
    info=zipfile.ZipInfo(rel); info.create_system=3; info.external_attr=os.lstat(file).st_mode<<16
    z.writestr(info,os.readlink(file))
   elif os.path.isfile(file): z.write(file,rel)
`,
      path.dirname(app),
      artifact,
    ]);
    // Portable updater проверяет собственный descriptor; старый builder blockmap уже не соответствует ZIP.
    await rm(artifact + '.blockmap', { force: true });
  }
  // Verifier получает путь к тем же unpacked файлам, из которых builder изготовил дистрибутив.
  manifest.targets[target] = {
    artifact: path.relative(buildRoot, artifact),
    sha256: sha(await readFile(artifact)),
    bytes: (await readFile(artifact)).length,
    resources: path.relative(buildRoot, packaged),
    closure: staged.closure,
    ...(adHocRepair ? { adHocRepair } : {}),
    electronArchiveSha256: checksum[name],
  };
  console.log(`ГОТОВО ${target}: ${artifact}`);
}
for (const [file, hash] of Object.entries(toolingInputs)) {
  if (sha(await readFile(path.join(root, file))) !== hash)
    throw new Error(`Build input изменился: ${file}`);
  manifest.inputs[file] = hash;
}
await save(path.join(buildRoot, 'manifest.json'), manifest);
await rm(stagingRoot, { recursive: true, force: true });
await cp(path.join(resources, 'icon.png'), path.join(buildRoot, 'icon.png'));
console.log(`Manifest: ${path.join(buildRoot, 'manifest.json')}`);
