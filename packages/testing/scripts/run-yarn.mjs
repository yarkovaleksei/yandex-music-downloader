#!/usr/bin/env node
/**
 * Запускает закреплённый Yarn через Corepack из PATH (ADR-008).
 *
 * Скрипт без зависимостей: работает до установки
 * node_modules. Он проверяет диапазон Node.js, ограничивает Corepack каталогом
 * `.cache/corepack` рабочей копии (global shims и пользовательский кеш не
 * трогаются) и передаёт код завершения Yarn. Стандартная проверка Corepack
 * `packageManager` + sha512 не отключается.
 *
 * Ограничения: нужен Corepack из состава Node.js и сеть до npm registry при
 * первом скачивании Yarn; на Windows Corepack запускается как `corepack.cmd` через
 * shell; для Windows нужна отдельная платформенная проверка.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const minNode = [22, 14, 0];
const maxNodeExclusive = [25, 0, 0];

/** Корень рабочей копии: packages/testing/scripts -> три уровня вверх. */
export const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);

function compareVersions(left, right) {
  for (let index = 0; index < 3; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

/** Проверяет Node.js в диапазоне `>=22.14.0 <25` (ADR-008, ADR-017); иначе выбрасывает Error. */
export function assertNodeSupported(version = process.versions.node) {
  const parts = version.split('.').map(Number);
  if (
    compareVersions(parts, minNode) < 0 ||
    compareVersions(parts, maxNodeExclusive) >= 0
  ) {
    throw new Error(
      `Node.js ${version} не поддерживается: требуется >=22.14.0 <25 (ADR-008, ADR-017).`,
    );
  }
}

/** Окружение Corepack, ограниченное рабочей копией. */
export function corepackEnvironment(root, baseEnv = process.env) {
  const corepackHome = path.join(root, '.cache', 'corepack');
  fs.mkdirSync(corepackHome, { recursive: true });
  // Corepack распаковывает yarn.js внутрь корня проекта; без явного CommonJS-маркера
  // он наследует "type": "module" корневого package.json и не запускается.
  fs.writeFileSync(
    path.join(corepackHome, 'package.json'),
    '{ "private": true, "type": "commonjs" }\n',
  );
  return {
    ...baseEnv,
    COREPACK_HOME: corepackHome,
    COREPACK_ENABLE_DOWNLOAD_PROMPT: '0',
  };
}

/**
 * Запускает `corepack yarn <args>`.
 * @param {string[]} args
 * @param {{ cwd?: string, capture?: boolean, env?: NodeJS.ProcessEnv }} [options]
 */
export function runYarn(args, options = {}) {
  assertNodeSupported();
  const root = options.cwd ?? repositoryRoot;
  const windows = process.platform === 'win32';
  const command = windows ? 'corepack.cmd' : 'corepack';
  if (!options.capture) {
    process.stderr.write(`+ corepack yarn ${args.join(' ')}\n`);
  }
  const result = spawnSync(command, ['yarn', ...args], {
    cwd: root,
    env: corepackEnvironment(root, options.env),
    shell: windows,
    encoding: 'utf8',
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
  if (result.error) {
    throw new Error(
      `Не удалось запустить Corepack (${command}): ${result.error.message}`,
    );
  }
  return result;
}

if (
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const result = runYarn(process.argv.slice(2));
    process.exit(result.status ?? 1);
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exit(1);
  }
}
