import path from 'node:path';
import { createHash } from 'node:crypto';
import {
  cp,
  mkdir,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { existsSync } from 'node:fs';

export const root = path.resolve(import.meta.dirname, '../../..');
export const output = path.join(root, '.cache/desktop-packaging/local-0.0.0');
export const targets = ['linux-x64', 'win32-x64', 'darwin-arm64', 'darwin-x64'];
export const appId = 'io.github.yarkovaleksei.yandexmusicdownloader';
export const productName = 'Yandex Music Downloader';
export const sha = (value) => createHash('sha256').update(value).digest('hex');
export const json = async (file) => JSON.parse(await readFile(file, 'utf8'));
export const save = async (file, value) => {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(value, null, 2) + '\n');
};

/** @link docs/adr/ADR-018-linux-packaging-and-updates.md Локальная версия не выдаётся за Git-тег. */
export function versionFromTag(tag) {
  if (
    !/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/.test(
      tag,
    )
  )
    throw new Error('Ожидается тег вида v1.2.3 без путей и команд');
  return tag.slice(1);
}
export function supports(metadata, platform, arch) {
  const matches = (list, value) =>
    !list ||
    (!list.includes(`!${value}`) &&
      (!list.some((entry) => !entry.startsWith('!')) || list.includes(value)));
  return matches(metadata.os, platform) && matches(metadata.cpu, arch);
}

export async function files(directory) {
  const result = [];
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort(
    (a, b) => a.name.localeCompare(b.name),
  )) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await files(file)));
    else if (entry.isFile()) result.push(file);
  }
  return result;
}

/** Бинарный заголовок проверяется без исполнения чужой ОС; одинаковое имя файла не доказывает архитектуру. */
export function binaryTarget(bytes) {
  if (bytes.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))) {
    const cpu = bytes.readUInt16LE(18);
    return `linux-${cpu === 62 ? 'x64' : cpu === 183 ? 'arm64' : 'unknown'}`;
  }
  if (bytes.readUInt32LE(0) === 0xfeedfacf) {
    const cpu = bytes.readUInt32LE(4);
    return `darwin-${cpu === 0x1000007 ? 'x64' : cpu === 0x100000c ? 'arm64' : 'unknown'}`;
  }
  if (bytes.subarray(0, 2).toString() === 'MZ') {
    const offset = bytes.readUInt32LE(0x3c);
    if (bytes.subarray(offset, offset + 4).toString() !== 'PE\0\0')
      throw new Error('Повреждённый PE');
    return `win32-${bytes.readUInt16LE(offset + 4) === 0x8664 ? 'x64' : 'unknown'}`;
  }
  throw new Error('Неизвестный формат native binary');
}

async function resolvePackage(name, from) {
  if (!/^(?:@[\w.-]+\/)?[\w.-]+$/.test(name))
    throw new Error(`Недопустимое имя package: ${name}`);
  for (let directory = from; ; directory = path.dirname(directory)) {
    const candidate = path.join(directory, 'node_modules', name);
    if (existsSync(path.join(candidate, 'package.json')))
      return realpath(candidate);
    if (path.dirname(directory) === directory) break;
  }
  throw new Error(`Не найдена обязательная production dependency: ${name}`);
}

/** Замыкаем настоящие dependencies, а не копируем node_modules разработчика. Разные версии остаются вложенными. */
export async function stage(target, directory, version, repository = root) {
  const [platform, arch] = target.split('-');
  if (!targets.includes(target)) throw new Error(`Неизвестная цель: ${target}`);
  await rm(directory, { recursive: true, force: true });
  await mkdir(directory, { recursive: true });
  const desktop = path.join(repository, 'apps/desktop');
  const metadata = await json(path.join(desktop, 'package.json'));
  const inputs = {};
  const installed = new Map();
  const preferred = new Map();
  for (const name of Object.keys(metadata.dependencies ?? {})) {
    const pkg = await json(
      path.join(await resolvePackage(name, desktop), 'package.json'),
    );
    preferred.set(name, `${name}@${pkg.version}`);
  }
  const closure = [];
  const copy = async (source, destination, workspace) => {
    await cp(source, destination, {
      recursive: true,
      dereference: true,
      filter: (file) => {
        const relative = path.relative(source, file);
        const segments = relative.split(path.sep);
        return (
          !segments.some((segment) =>
            [
              'node_modules',
              '.git',
              'evidence',
              'fixtures',
              '__tests__',
            ].includes(segment),
          ) &&
          !/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file) &&
          !file.endsWith('native-probe.mjs') &&
          (!workspace || !segments.includes('src'))
        );
      },
    });
    for (const file of await files(source)) {
      if (file.includes(`${path.sep}node_modules${path.sep}`)) continue;
      if (existsSync(path.join(destination, path.relative(source, file))))
        inputs[path.relative(repository, file)] = sha(await readFile(file));
    }
  };
  await copy(path.join(desktop, 'dist'), path.join(directory, 'dist'), true);
  const install = async (name, from, parent, optional = false) => {
    let source;
    try {
      source = await resolvePackage(name, from);
    } catch (error) {
      if (optional) return;
      throw error;
    }
    const pkg = await json(path.join(source, 'package.json'));
    if (!supports(pkg, platform, arch)) {
      if (optional) return;
      throw new Error(
        `Обязательная dependency ${name} не поддерживает ${target}`,
      );
    }
    const identity = `${name}@${pkg.version}`;
    if (installed.get(name) === identity) return;
    const useRoot =
      !installed.has(name) &&
      (!preferred.has(name) || preferred.get(name) === identity);
    const destination = path.join(
      useRoot ? directory : parent,
      'node_modules',
      name,
    );
    if (existsSync(path.join(destination, 'package.json'))) {
      const previous = await json(path.join(destination, 'package.json'));
      if (previous.version === pkg.version) return;
      throw new Error(`Конфликт production dependency: ${identity}`);
    }
    if (useRoot) installed.set(name, identity);
    await mkdir(destination, { recursive: true });
    const workspace = name.startsWith('@music-downloader/');
    if (workspace) {
      await copy(
        path.join(source, 'dist'),
        path.join(destination, 'dist'),
        true,
      );
      await cp(
        path.join(source, 'package.json'),
        path.join(destination, 'package.json'),
      );
      inputs[path.relative(repository, path.join(source, 'package.json'))] =
        sha(await readFile(path.join(source, 'package.json')));
      const manifest = { ...pkg };
      delete manifest.devDependencies;
      for (const [dependency, range] of Object.entries(
        manifest.dependencies ?? {},
      ))
        if (range.startsWith('workspace:'))
          manifest.dependencies[dependency] = (
            await json(
              path.join(
                await resolvePackage(dependency, source),
                'package.json',
              ),
            )
          ).version;
      if (manifest.exports?.['.']?.['@music-downloader/source'])
        delete manifest.exports['.']['@music-downloader/source'];
      await save(path.join(destination, 'package.json'), manifest);
    } else await copy(source, destination, false);
    // В пакетах с общим prebuilds оставляем только binary целевой платформы.
    const prebuilds = path.join(destination, 'prebuilds');
    if (existsSync(prebuilds)) {
      for (const entry of await readdir(prebuilds))
        if (entry !== target && entry !== `${target}.node`)
          await rm(path.join(prebuilds, entry), {
            recursive: true,
            force: true,
          });
    }
    closure.push({
      name,
      version: pkg.version,
      directory: path.relative(directory, destination),
    });
    for (const dependency of Object.keys(pkg.dependencies ?? {}))
      await install(
        dependency,
        source,
        destination,
        Object.hasOwn(pkg.optionalDependencies ?? {}, dependency),
      );
    for (const dependency of Object.keys(pkg.optionalDependencies ?? {}))
      if (!Object.hasOwn(pkg.dependencies ?? {}, dependency))
        await install(dependency, source, destination, true);
  };
  for (const name of Object.keys(metadata.dependencies ?? {}))
    await install(name, desktop, directory);
  await save(path.join(directory, 'package.json'), {
    name: 'yandex-music-downloader',
    productName,
    version,
    private: true,
    type: 'module',
    main: 'dist/main/index.js',
    description: 'Загрузка доступной музыки Яндекс Музыки',
    author: 'yarkovaleksei',
    license: 'UNLICENSED',
    dependencies: metadata.dependencies,
  });
  // Workspace protocol уже материализован; builder не должен искать зависимости в родительском репозитории.
  const staged = await json(path.join(directory, 'package.json'));
  staged.dependencies = Object.fromEntries(
    Object.keys(staged.dependencies).map((name) => [
      name,
      installed.get(name).slice(name.length + 1),
    ]),
  );
  await save(path.join(directory, 'package.json'), staged);
  await save(path.join(directory, 'production-closure.json'), closure);
  return { inputs, closure };
}
