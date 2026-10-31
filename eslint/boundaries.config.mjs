/**
 * Единый источник правил границ ADR-001 и локальных ограничений проекта.
 *
 * Каждая запись помечена origin: `ADR-001`/`REQ-005` — обязательство архитектуры или требований,
 * `правило проекта` — локальное ограничение, которое не является требованием ADR.
 */

/** Диапазон Node.js по ADR-008; поддерживается только Node.js 24 по ADR-020. */
export const nodeRange = { min: '24.0.0', maxExclusive: '25.0.0' };

/** Расширения исходников, к которым применяются boundary rules. */
export const sourceExtensions = ['ts', 'tsx', 'mts', 'cts', 'js', 'mjs', 'cjs'];

/** Единый источник определения тестовых файлов (ESLint, tsconfig, Vitest). */
export const testFileSuffixes = ['test', 'spec'];
export const testDirectories = [
  'test',
  'tests',
  '__tests__',
  'e2e',
  'fixtures',
];

/**
 * Разворачивает тестовые glob-ы без brace-синтаксиса (подходит для tsconfig).
 * @param {string} prefix каталог, например `src` или `packages/**`
 * @param {string[]} extensions расширения файлов
 */
export function expandTestGlobs(prefix = '**', extensions = sourceExtensions) {
  const base = prefix === '' ? '**' : `${prefix}/**`;
  const files = testFileSuffixes.flatMap((suffix) =>
    extensions.map((extension) => `${base}/*.${suffix}.${extension}`),
  );
  const directories = testDirectories.map(
    (directory) => `${base}/${directory}/**`,
  );
  return [...files, ...directories];
}

/**
 * Те же globs в форме для tsconfig `include`: TypeScript запрещает `include`,
 * оканчивающийся на `**`, поэтому каталоги заканчиваются на `/**\/*`.
 */
export function expandTestIncludeGlobs(
  prefix = '**',
  extensions = sourceExtensions,
) {
  return expandTestGlobs(prefix, extensions).map((glob) =>
    glob.endsWith('/**') ? `${glob}/*` : glob,
  );
}

/** Определяет тестовый файл по POSIX-пути относительно корня репозитория. */
export function isTestFile(relativePath) {
  const segments = relativePath.split('/');
  const fileName = segments[segments.length - 1] ?? '';
  const directories = segments.slice(0, -1);
  if (directories.some((segment) => testDirectories.includes(segment))) {
    return true;
  }
  return testFileSuffixes.some((suffix) =>
    sourceExtensions.some((extension) =>
      fileName.endsWith(`.${suffix}.${extension}`),
    ),
  );
}

const coreNames = [
  'downloader',
  'planner',
  'queue',
  'retry',
  'manifest',
  'filesystem',
  'validation',
];

/** 16 workspace-пакетов: имя, каталог и группа границ. */
export const workspacePackages = [
  { name: '@music-downloader/shared', dir: 'packages/shared', group: 'shared' },
  ...coreNames.map((name) => ({
    name: `@music-downloader/core-${name}`,
    dir: `packages/core/${name}`,
    group: `core/${name}`,
  })),
  {
    name: '@music-downloader/provider-yandex-music',
    dir: 'packages/providers/yandex-music',
    group: 'provider',
  },
  {
    name: '@music-downloader/metadata',
    dir: 'packages/metadata',
    group: 'metadata',
  },
  {
    name: '@music-downloader/persistence',
    dir: 'packages/persistence',
    group: 'persistence',
  },
  {
    name: '@music-downloader/application',
    dir: 'packages/application',
    group: 'application',
  },
  {
    name: '@music-downloader/logging',
    dir: 'packages/logging',
    group: 'logging',
  },
  {
    name: '@music-downloader/testing',
    dir: 'packages/testing',
    group: 'testing',
  },
  { name: '@music-downloader/cli', dir: 'apps/cli', group: 'app' },
  { name: '@music-downloader/desktop', dir: 'apps/desktop', group: 'app' },
];

/** Префикс имён внутренних пакетов; неизвестное имя с этим префиксом закрыто по умолчанию. */
export const workspaceScope = '@music-downloader/';

/** Пакет, в котором единственном разрешён Yandex SDK (REQ-005). */
export const yandexProviderDir = 'packages/providers/yandex-music';
export const yandexSdkModules = ['@dvxch/yandex-music'];

/** Запрещённые рёбра внутри core/*. */
export const forbiddenCorePeerEdges = [
  ...['filesystem', 'retry', 'manifest', 'validation'].flatMap((from) =>
    ['downloader', 'queue'].map((to) => ({
      from: `core/${from}`,
      to: `core/${to}`,
      origin: 'ADR-001 п.3',
    })),
  ),
  ...['downloader', 'queue'].map((to) => ({
    from: 'core/planner',
    to: `core/${to}`,
    origin: 'правило проекта',
  })),
];

const corePeers = coreNames.map((name) => `core/${name}`);

/**
 * Разрешённые рёбра по группам. `value` — любой импорт, `typeOnly` — только
 * `import type`/`export type`/`import('x').T`.
 */
export function allowedEdges(group) {
  switch (group) {
    case 'app':
      return { value: ['application'], typeOnly: ['shared'] }; // ADR-001 п.1
    case 'application':
      return {
        value: [
          'shared',
          ...corePeers,
          'provider',
          'metadata',
          'persistence',
          'logging',
        ],
        typeOnly: [],
      }; // ADR-001 п.2
    case 'shared':
      return { value: [], typeOnly: [] }; // ADR-001 п.5
    case 'provider':
    case 'metadata':
    case 'persistence':
    case 'logging':
    case 'testing':
      return { value: ['shared'], typeOnly: [] }; // ADR-001 п.4, п.6
    default:
      if (corePeers.includes(group)) {
        const forbidden = forbiddenCorePeerEdges
          .filter((edge) => edge.from === group)
          .map((edge) => edge.to);
        return {
          value: [
            'shared',
            ...corePeers.filter(
              (peer) => peer !== group && !forbidden.includes(peer),
            ),
          ],
          typeOnly: [],
        }; // ADR-001 п.3
      }
      return { value: [], typeOnly: [] }; // будущие пакеты закрыты по умолчанию
  }
}

/** Группы, тестовым файлам которых разрешён доступ к `testing` (ADR-001 п.6 и локальные ограничения). */
export const testingConsumerGroups = [
  'application',
  ...corePeers,
  'provider',
  'metadata',
  'persistence',
  'logging',
  'testing',
];

/** Модули, запрещённые по группам. `origin` отделяет ADR/PRN от локальных ограничений. */
const nativeModules = [
  'better-sqlite3',
  'sqlite3',
  'keytar',
  '@napi-rs/keyring',
  'electron-store',
];
export const forbiddenModulesByGroup = {
  core: [
    { module: 'electron', origin: 'ADR-001 п.3' },
    { module: 'react', origin: 'ADR-001 п.3' },
    { module: 'react-dom', origin: 'правило проекта' },
    { module: '@mui/', origin: 'правило проекта', prefix: true },
    ...nativeModules.map((module) => ({ module, origin: 'правило проекта' })),
  ],
  application: [
    { module: 'electron', origin: 'ADR-001 п.2 (runtimeAdapters)' },
    ...nativeModules.map((module) => ({
      module,
      origin: 'ADR-001 п.2 (runtimeAdapters)',
    })),
    { module: 'react', origin: 'правило проекта' },
    { module: 'react-dom', origin: 'правило проекта' },
    { module: '@mui/', origin: 'правило проекта', prefix: true },
  ],
};

/** I/O-глобалы, запрещённые в packages/shared (ADR-001 п.5). */
export const sharedForbiddenGlobals = [
  'process',
  'Buffer',
  'global',
  'require',
  'module',
  'exports',
  '__dirname',
  '__filename',
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'indexedDB',
  'localStorage',
  'sessionStorage',
  'window',
  'document',
  'navigator',
];
/** Объекты-обёртки глобальной области, через которые нельзя обойти запрет. */
export const globalScopeObjects = ['globalThis', 'self', 'window', 'global'];
/** Разрешённые сторонние модули в тестовых файлах shared. */
export const sharedTestAllowedModules = ['vitest'];
