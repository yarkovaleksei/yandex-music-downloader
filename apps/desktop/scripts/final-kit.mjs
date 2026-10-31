import path from 'node:path';
import {
  readFile,
  writeFile,
  mkdir,
  rm,
  cp,
  chmod,
  mkdtemp,
} from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import {
  generateKeyPairSync,
  sign,
  verify as verifySignature,
} from 'node:crypto';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import {
  root,
  json,
  save,
  sha,
  stage,
  files,
  binaryTarget,
  extractPortable,
} from '../packaging/lib.mjs';
import { inventory, verifyKit, updateProof } from '../e2e/final-check.mjs';

/**  Все компиляторы остаются на Linux; гостю передаются готовые байты. */
if (process.platform !== 'linux')
  throw new Error('Подготовка/проверка наборов разрешена только на Linux');
const destination = path.join(root, '.cache/desktop-final-check');
const targets = ['win32-x64', 'darwin-arm64', 'darwin-x64'];
const run = (command, args) => {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0 || result.error)
    throw result.error ?? new Error(result.stdout + result.stderr);
  return result.stdout.trim();
};
const python = (script, ...args) => run('python3', ['-c', script, ...args]);
const extractZip = (archive, directory) => {
  // unzip сохраняет symlinks/frameworks и executable flags официальных Electron/macOS ZIP.
  run('unzip', ['-q', archive, '-d', directory]);
};
const zip = (directory, archive) =>
  python(
    `import os,sys,zipfile,stat
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
    directory,
    archive,
  );
const kitInputs = async () => {
  const result = {};
  for (const file of [
    ...(await files(path.join(root, 'apps/desktop/e2e'))).filter(
      (file) =>
        !file.includes('/evidence/') && !file.includes('/node_modules/'),
    ),
    path.join(root, 'apps/desktop/scripts/final-kit.mjs'),
    path.join(
      root,
      'apps/desktop/e2e/node_modules/@playwright/test/package.json',
    ),
    path.join(root, 'apps/desktop/e2e/node_modules/playwright/package.json'),
    path.join(
      root,
      'apps/desktop/e2e/node_modules/playwright-core/package.json',
    ),
    path.join(root, 'node_modules/electron/checksums.json'),
  ])
    result[path.relative(root, file)] = sha(await readFile(file));
  return result;
};
async function packaging(version) {
  const directory = path.join(
    root,
    '.cache/desktop-packaging',
    `local-${version}`,
  );
  const manifest = await json(path.join(directory, 'manifest.json'));
  assert.equal(manifest.version, version);
  assert.equal(manifest.local, true);
  assert.equal(manifest.tag, null);
  assert.equal(manifest.builtOn.platform, 'linux');
  for (const [file, hash] of Object.entries(manifest.inputs))
    assert.equal(
      sha(await readFile(path.join(root, file))),
      hash,
      `Устаревший packaging input: ${file}`,
    );
  for (const target of targets) {
    const artifact = manifest.targets[target];
    const file = path.join(directory, artifact.artifact);
    assert(file.endsWith(target.startsWith('win32') ? '.exe' : '.zip'));
    assert.equal(sha(await readFile(file)), artifact.sha256);
    if (file.endsWith('.zip')) run('unzip', ['-tq', file]);
    else run('7z', ['t', file]);
  }
  return { directory, manifest };
}
function fixture(target, payload, pair) {
  const descriptor = Buffer.from(
    JSON.stringify({
      schemaVersion: 1,
      version: '0.0.1',
      channel: 'stable',
      target,
      url: 'https://final-kit.invalid/payload',
      size: payload.length,
      sha256: sha(payload),
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
async function selfCheck() {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'final-kit-fixture-'));
  try {
    const { PortableUpdates } = await import('../dist/main/update/service.js');
    const payload = Buffer.from('Проверочный portable payload');
    const pair = generateKeyPairSync('ed25519');
    const proof = await updateProof({
      Service: PortableUpdates,
      fixture: fixture('win32-x64', payload, pair),
      payload,
      target: 'win32-x64',
      directory: temporary,
    });
    assert(proof.valid && proof.signature && proof.size && proof.hash);
    const file = path.join(temporary, 'prebuilt-host.js');
    await writeFile(file, '// Готовый проверочный host\n');
    const list = await inventory(temporary);
    const manifest = {
      builtOn: { platform: 'linux' },
      guestBuildAllowed: false,
      files: list,
    };
    await verifyKit(temporary, manifest);
    await writeFile(file, 'повреждено');
    await assert.rejects(verifyKit(temporary, manifest));
    const prepare = await readFile(
      path.join(root, 'apps/desktop/e2e/prepare.mjs'),
      'utf8',
    );
    assert(!prepare.includes("import { build } from 'esbuild'"));
    assert(prepare.includes("MUSIC_FINAL_KIT === '1'"));
    console.log(
      'PASS fixture: production Ed25519/download, signature/size/hash rejection, integrity tamper, guest prebuilt branch; native PENDING',
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
async function verify() {
  const index = await json(path.join(destination, 'manifest.json'));
  assert.equal(index.revision, run('git', ['rev-parse', 'HEAD']));
  assert.deepEqual(index.inputs, await kitInputs());
  const packages = [await packaging('0.0.0'), await packaging('0.0.1')];
  for (let i = 0; i < packages.length; i++)
    assert.equal(
      index.packagingManifests[i],
      sha(await readFile(path.join(packages[i].directory, 'manifest.json'))),
    );
  for (const target of targets) {
    const item = index.targets[target];
    const archive = path.join(destination, item.archive);
    assert.equal(sha(await readFile(archive)), item.sha256);
    const extracted = await mkdtemp(path.join(destination, 'verify-'));
    try {
      extractZip(archive, extracted);
      const manifest = await json(path.join(extracted, 'kit-manifest.json'));
      assert.equal(manifest.target, target);
      assert.equal(manifest.revision, index.revision);
      assert.equal(manifest.buildId, index.buildId);
      assert.equal(
        sha(await readFile(path.join(extracted, manifest.portable.n))),
        packages[0].manifest.targets[target].sha256,
      );
      assert.equal(
        sha(await readFile(path.join(extracted, manifest.portable.next))),
        packages[1].manifest.targets[target].sha256,
      );
      await verifyKit(extracted, manifest);
      for (const [file, hash] of Object.entries(manifest.productionInputs))
        assert.equal(packages[0].manifest.inputs[file], hash, file);
      for (const [file, hash] of Object.entries(
        packages[0].manifest.inputs,
      ).filter(([file]) => file.startsWith('apps/desktop/dist/')))
        assert.equal(
          sha(await readFile(path.join(extracted, 'project', file))),
          hash,
          file,
        );
      const tree = await inventory(extracted);
      for (const relative of Object.keys(tree))
        assert(
          !/(?:^|\/)node_modules\/(?:esbuild|typescript|vite|@esbuild)(?:\/|$)|(?:^|\/)private[^/]*\.pem$/.test(
            relative,
          ),
          `Запрещённый compiler/key: ${relative}`,
        );
      for (const file of [
        manifest.nodeExecutable,
        manifest.electronExecutable,
        'shipping-n/' + manifest.shippingExecutable,
      ])
        assert.equal(
          binaryTarget(await readFile(path.join(extracted, file))),
          target,
          file,
        );
      for (const relative of Object.keys(tree).filter((file) =>
        file.endsWith('.node'),
      ))
        assert.equal(
          binaryTarget(await readFile(path.join(extracted, relative))),
          target,
          relative,
        );
      assert.equal(
        verifySignature(
          null,
          Buffer.from(manifest.updateFixture.descriptor, 'base64'),
          manifest.updateFixture.publicKey,
          Buffer.from(manifest.updateFixture.signature, 'base64'),
        ),
        true,
      );
      assert(
        (
          await readFile(
            path.join(extracted, 'project/apps/desktop/dist/prebuilt-host.js'),
          )
        ).length > 1000,
      );
      assert.deepEqual(
        await inventory(path.join(extracted, 'shipping-n-plus-1')),
        manifest.nextShippingFiles,
      );
      console.log(
        `PASS ${target}: ZIP hashes, current inputs, runtime/native architectures, prebuilt host, no compiler/private key; native PENDING`,
      );
    } finally {
      await rm(extracted, { recursive: true, force: true });
    }
  }
}
async function buildKits() {
  // Изменение final-kit входит в packaging inputs: сначала завершаем tooling, затем пересобираем stale версии.
  const packages = [];
  for (const version of ['0.0.0', '0.0.1']) {
    try {
      packages.push(await packaging(version));
    } catch (error) {
      console.log(`Пересборка ${version}: ${error.message}`);
      const result = spawnSync(
        process.execPath,
        [
          'apps/desktop/scripts/package.mjs',
          ...(version === '0.0.0' ? ['--local'] : ['--local-version', version]),
        ],
        { cwd: root, stdio: 'inherit' },
      );
      if (result.status !== 0 || result.error)
        throw (
          result.error ??
          new Error(`Packaging ${version}: exit ${result.status}`)
        );
      packages.push(await packaging(version));
    }
  }
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  const revision = run('git', ['rev-parse', 'HEAD']);
  const buildId =
    new Date().toISOString().replace(/[-:.]/g, '') + '-' + revision.slice(0, 8);
  const index = {
    schema: 1,
    revision,
    buildId,
    builtOn: { platform: process.platform, arch: process.arch },
    guestBuildAllowed: false,
    nativeAcceptance: 'PENDING',
    inputs: await kitInputs(),
    packagingManifests: await Promise.all(
      packages.map((item) =>
        readFile(path.join(item.directory, 'manifest.json')).then(sha),
      ),
    ),
    targets: {},
  };
  const electronVersion = (
    await json(path.join(root, 'node_modules/electron/package.json'))
  ).version;
  const electronChecksums = await json(
    path.join(root, 'node_modules/electron/checksums.json'),
  );
  const nodeVersion = '24.21.0';
  const checksumFile = ['desktop-platform-check', 'platform-check']
    .map((name) => path.join(root, '.cache', name, 'downloads/SHASUMS256.txt'))
    .find(existsSync);
  assert(checksumFile, 'Нет official Node SHASUMS256.txt');
  const nodeChecksums = await readFile(checksumFile, 'utf8');
  for (const target of targets) {
    const directory = path.join(destination, target);
    const project = path.join(directory, 'project');
    const desktop = path.join(project, 'apps/desktop');
    await mkdir(desktop, { recursive: true });
    const staged = await stage(target, path.join(directory, 'stage'), '0.0.0');
    for (const [file, hash] of Object.entries(staged.inputs))
      assert.equal(
        packages[0].manifest.inputs[file],
        hash,
        `Production closure расходится с portable N: ${file}`,
      );
    await cp(path.join(directory, 'stage/dist'), path.join(desktop, 'dist'), {
      recursive: true,
    });
    await cp(
      path.join(directory, 'stage/node_modules'),
      path.join(project, 'node_modules'),
      { recursive: true },
    );
    await save(path.join(project, 'package.json'), {
      private: true,
      type: 'module',
    });
    await rm(path.join(directory, 'stage'), { recursive: true, force: true });
    for (const name of ['@playwright/test', 'playwright', 'playwright-core'])
      await cp(
        path.join(root, 'apps/desktop/e2e/node_modules', name),
        path.join(project, 'node_modules', name),
        { recursive: true, dereference: true },
      );
    await cp(path.join(root, 'apps/desktop/e2e'), path.join(desktop, 'e2e'), {
      recursive: true,
      filter: (source) =>
        !source.includes('/evidence') && !source.includes('/e2e/node_modules'),
    });
    const host = path.join(root, 'apps/desktop/src/host/index.ts');
    await build({
      entryPoints: [host],
      outfile: path.join(desktop, 'dist/prebuilt-host.js'),
      bundle: true,
      platform: 'node',
      format: 'esm',
      packages: 'external',
      target: 'node24',
      plugins: [
        {
          name: 'final-kit-offline-application',
          setup(builder) {
            builder.onResolve(
              { filter: /^@music-downloader\/application$/ },
              (args) =>
                args.importer === host
                  ? {
                      path: path.join(root, 'apps/desktop/e2e/application.mjs'),
                    }
                  : undefined,
            );
          },
        },
      ],
    });
    const electronName = `electron-v${electronVersion}-${target}.zip`;
    const electronArchive = path.join(
      root,
      '.cache/desktop-platform-check/downloads',
      electronName,
    );
    assert.equal(
      sha(await readFile(electronArchive)),
      electronChecksums[electronName],
    );
    await mkdir(path.join(project, 'node_modules/electron'), {
      recursive: true,
    });
    extractZip(
      electronArchive,
      path.join(project, 'node_modules/electron/dist'),
    );
    const [platform] = target.split('-');
    const electronRelative =
      platform === 'win32'
        ? 'electron.exe'
        : 'Electron.app/Contents/MacOS/Electron';
    // Минимальный runtime adapter не содержит install.js и никогда не скачивает Electron на госте.
    await save(path.join(project, 'node_modules/electron/package.json'), {
      name: 'electron',
      version: electronVersion,
      main: 'index.cjs',
    });
    await writeFile(
      path.join(project, 'node_modules/electron/index.cjs'),
      `module.exports = require('node:path').join(__dirname, 'dist', ${JSON.stringify(electronRelative)});\n`,
    );
    const nodeTarget = platform === 'win32' ? 'win-x64' : target;
    const nodeName = `node-v${nodeVersion}-${nodeTarget}.${platform === 'win32' ? 'zip' : 'tar.gz'}`;
    const nodeArchive = ['desktop-platform-check', 'platform-check']
      .map((name) => path.join(root, '.cache', name, 'downloads', nodeName))
      .find(existsSync);
    assert(nodeArchive, `Нет Node runtime ${nodeName}`);
    const expected = nodeChecksums
      .split('\n')
      .find((line) => line.trim().endsWith(' ' + nodeName))
      ?.split(/\s+/)[0];
    assert(expected, `Нет official checksum ${nodeName}`);
    assert.equal(sha(await readFile(nodeArchive)), expected);
    await mkdir(path.join(directory, 'runtime'));
    const nodeExecutable = `runtime/${platform === 'win32' ? 'node.exe' : 'node'}`;
    python(
      `import sys,zipfile,tarfile
archive,name,out=sys.argv[1:]
if archive.endswith('.zip'):
 with zipfile.ZipFile(archive) as z: data=z.read(name)
else:
 with tarfile.open(archive) as t: data=t.extractfile(name).read()
open(out,'wb').write(data)
`,
      nodeArchive,
      `node-v${nodeVersion}-${nodeTarget}/${platform === 'win32' ? 'node.exe' : 'bin/node'}`,
      path.join(directory, nodeExecutable),
    );
    await chmod(path.join(directory, nodeExecutable), 0o755);
    await mkdir(path.join(directory, 'portable'));
    const portable = {};
    for (const [i, name] of ['n', 'n-plus-1'].entries()) {
      const artifact = path.join(
        packages[i].directory,
        packages[i].manifest.targets[target].artifact,
      );
      const relative = `portable/${name}${path.extname(artifact)}`;
      portable[i ? 'next' : 'n'] = relative;
      await cp(artifact, path.join(directory, relative));
      extractPortable(artifact, path.join(directory, 'shipping-' + name));
    }
    const shippingExecutable =
      platform === 'win32'
        ? 'Yandex Music Downloader.exe'
        : 'Yandex Music Downloader.app/Contents/MacOS/Yandex Music Downloader';
    const pair = generateKeyPairSync('ed25519');
    const updateFixture = fixture(
      target,
      await readFile(path.join(directory, portable.next)),
      pair,
    );
    const runner = 'project/apps/desktop/e2e/final-check.mjs';
    if (platform === 'win32') {
      await writeFile(
        path.join(directory, 'run-before.cmd'),
        `@echo off\r\ncd /d "%~dp0"\r\nruntime\\node.exe ${runner.replaceAll('/', '\\')}\r\npause\r\n`,
      );
      await writeFile(
        path.join(directory, 'run-after.cmd'),
        `@echo off\r\ncd /d "%~dp0"\r\nruntime\\node.exe ${runner.replaceAll('/', '\\')} --after --confirmed-manual-replacement\r\npause\r\n`,
      );
    } else {
      for (const phase of ['before', 'after']) {
        const launcher = path.join(directory, `run-${phase}.command`);
        await writeFile(
          launcher,
          `#!/bin/sh\nset -eu\ncd "$(dirname "$0")"\nexec ./runtime/node ${runner}${phase === 'after' ? ' --after --confirmed-manual-replacement' : ''}\n`,
        );
        await chmod(launcher, 0o755);
      }
    }
    await writeFile(
      path.join(directory, 'README.txt'),
      'Платформенная приёмка: распакуйте на локальный диск. Node.js/FFmpeg/сеть/компилятор не требуются.\n1. Запустите run-before. До AWAITING_MANUAL_REPLACEMENT проверка не закончена.\n2. Закройте приложение. Вручную удалите current и распакуйте в новую current проверенный reports/download/valid/*.zip; на Windows вместо распаковки exe скопируйте в новую current папку shipping-n-plus-1 — это содержимое того же проверенного пакета. Не трогайте isolated-home/reports и временный E2E output.\n3. Запустите run-after только после ручной замены. Он подтверждает N+1, общий stateDir, сохранённый job/history и аудиофайл. Не запускайте старую версию после миграции.\n4. Верните весь reports с JSON, stderr, журналами, screenshot, включая FAIL.\nmacOS: при блокировке неизвестного издателя разрешите запуск явно в настройках безопасности. Для x64 на Apple Silicon нужна Rosetta; запуск runtime может отказать раньше отчёта — сохраните терминал. Системная подпись/notarization отсутствуют.\nПовтор: распакуйте набор заново в другую папку; не затирайте отчёты. Приватный ключ отсутствует, production feed не настроен.\n',
    );
    const manifest = {
      schema: 1,
      ...index,
      inputs: undefined,
      packagingManifests: undefined,
      targets: undefined,
      target,
      appArtifactHash: packages[0].manifest.targets[target].sha256,
      nextArtifactHash: packages[1].manifest.targets[target].sha256,
      nodeExecutable,
      electronExecutable:
        'project/node_modules/electron/dist/' + electronRelative,
      shippingExecutable,
      portable,
      runtimeArchives: {
        electron: {
          file: electronName,
          sha256: electronChecksums[electronName],
        },
        node: { file: nodeName, sha256: expected },
      },
      packagingGitHeads: packages.map((item) => item.manifest.gitHead),
      productionInputs: staged.inputs,
      productionClosure: staged.closure,
      updateFixture,
      nextShippingFiles: await inventory(
        path.join(directory, 'shipping-n-plus-1'),
      ),
      files: await inventory(directory),
    };
    await save(path.join(directory, 'kit-manifest.json'), manifest);
    const archive = `music-downloader-final-${target}-${buildId}.zip`;
    zip(directory, path.join(destination, archive));
    index.targets[target] = {
      archive,
      sha256: sha(await readFile(path.join(destination, archive))),
      appArtifactHash: manifest.appArtifactHash,
      nextArtifactHash: manifest.nextArtifactHash,
    };
    console.log(`ГОТОВО ${target}: ${archive}`);
    await rm(directory, { recursive: true, force: true });
  }
  await save(path.join(destination, 'manifest.json'), index);
  console.log(
    `Manifest: ${path.join(destination, 'manifest.json')}; native PENDING`,
  );
}
const mode = process.argv[2];
if (mode === '--check') await selfCheck();
else if (mode === '--verify') await verify();
else if (mode === undefined) await buildKits();
else throw new Error('Используйте без аргументов, --check либо --verify');
