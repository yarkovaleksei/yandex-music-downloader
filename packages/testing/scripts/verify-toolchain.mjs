#!/usr/bin/env node
/**
 * Проверяет фиксированный toolchain без зависимостей: диапазон Node.js,
 * packageManager с sha512, политику .yarnrc.yml, отсутствие npm-артефактов и
 * фактическую версию Yarn через Corepack.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertNodeSupported, repositoryRoot, runYarn } from './run-yarn.mjs';

const failures = [];
const expect = (condition, message) => {
  if (!condition) failures.push(message);
};

/** Разбирает `yarn@X.Y.Z+sha512.<128 hex>`; возвращает версию или null. */
export function parsePackageManager(value) {
  const match = /^yarn@(\d+\.\d+\.\d+)\+sha512\.[0-9a-f]{128}$/.exec(
    value ?? '',
  );
  return match ? match[1] : null;
}

export function verifyToolchain(root = repositoryRoot) {
  failures.length = 0;
  try {
    assertNodeSupported();
  } catch (error) {
    failures.push(error.message);
    return failures.slice();
  }
  const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
  const manifest = JSON.parse(read('package.json'));
  const yarnVersion = parsePackageManager(manifest.packageManager);
  expect(
    yarnVersion !== null,
    'packageManager должен иметь вид yarn@X.Y.Z+sha512.<hex>',
  );
  expect(
    yarnVersion === '4.18.1',
    `Ожидается Yarn 4.18.1, а не ${String(yarnVersion)}`,
  );
  expect(
    manifest.private === true,
    'Корневой package.json должен быть private',
  );
  expect(
    manifest.type === 'module',
    'Корневой package.json должен иметь type: module',
  );
  expect(
    manifest.engines?.node === '>=24.0.0 <25',
    'engines.node должен быть >=24.0.0 <25',
  );
  for (const script of ['lint', 'typecheck', 'format:check', 'test', 'build']) {
    expect(
      typeof manifest.scripts?.[script] === 'string',
      `Нет скрипта ${script}`,
    );
  }
  const yarnrc = read('.yarnrc.yml');
  for (const [pattern, description] of [
    [/^nodeLinker: node-modules$/m, 'nodeLinker: node-modules'],
    [/^enableGlobalCache: false$/m, 'enableGlobalCache: false'],
    [/^enableMirror: false$/m, 'enableMirror: false'],
    [/^enableTelemetry: false$/m, 'enableTelemetry: false'],
    [/^cacheFolder: \.yarn\/cache$/m, 'cacheFolder: .yarn/cache'],
    [
      /^globalFolder: \.cache\/yarn\/global$/m,
      'globalFolder: .cache/yarn/global',
    ],
    [
      /^ {2}music-downloader:\n {4}npmRegistryServer: "https:\/\/registry\.invalid\/"$/m,
      'scope music-downloader -> https://registry.invalid/',
    ],
  ]) {
    expect(pattern.test(yarnrc), `.yarnrc.yml: нет ${description}`);
  }
  for (const stale of ['.npmrc', 'package-lock.json', 'npm-shrinkwrap.json']) {
    expect(
      !fs.existsSync(path.join(root, stale)),
      `Остался npm-артефакт ${stale}`,
    );
  }
  expect(fs.existsSync(path.join(root, 'yarn.lock')), 'Нет yarn.lock');
  try {
    const result = runYarn(['--version'], { cwd: root, capture: true });
    const actual = (result.stdout ?? '').trim();
    expect(
      result.status === 0,
      `corepack yarn --version завершился с кодом ${result.status}: ${result.stderr}`,
    );
    expect(
      actual === yarnVersion,
      `Фактический Yarn ${actual} не совпадает с packageManager ${yarnVersion}`,
    );
  } catch (error) {
    failures.push(error.message);
  }
  return failures.slice();
}

if (
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const problems = verifyToolchain();
  if (problems.length > 0) {
    for (const problem of problems) process.stderr.write(`FAIL: ${problem}\n`);
    process.exit(1);
  }
  process.stdout.write(
    `TOOLCHAIN OK: node ${process.versions.node}, yarn через Corepack\n`,
  );
}
