import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ESLint } from 'eslint';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '..');
const configFile = path.join(root, 'eslint.boundaries.config.mjs');

/** Boundary-проход через Node API с отключёнными inline-директивами. */
const eslint = new ESLint({
  cwd: root,
  overrideConfigFile: configFile,
  allowInlineConfig: false,
});

async function lint(code: string, filePath: string) {
  const [result] = await eslint.lintText(code, { filePath });
  if (result === undefined) throw new Error('ESLint не вернул результат');
  expect(
    result.fatalErrorCount,
    `fatal: ${JSON.stringify(result.messages)}`,
  ).toBe(0);
  return result;
}

const ruleIds = (result: ESLint.LintResult) =>
  result.messages.map((message) => message.ruleId);

/** Файл чист: ни ошибок, ни предупреждений. */
async function expectClean(code: string, filePath: string) {
  const result = await lint(code, filePath);
  expect(result.messages, `${filePath}: ${code}`).toEqual([]);
}

async function expectRule(code: string, filePath: string, ruleId: string) {
  const result = await lint(code, filePath);
  expect(ruleIds(result), `${filePath}: ${code}`).toContain(ruleId);
  expect(result.warningCount).toBe(0);
}

// --- Независимый oracle по ADR-001 п.1-6: не использует таблицу из eslint/boundaries.config.mjs ---

type Kind =
  | 'app'
  | 'application'
  | 'shared'
  | 'core'
  | 'provider'
  | 'metadata'
  | 'persistence'
  | 'logging'
  | 'testing';

interface Actor {
  id: string;
  kind: Kind;
  dir: string;
  specifier: string | null;
  core?: string;
}

const core = (name: string): Actor => ({
  id: `core-${name}`,
  kind: 'core',
  dir: `packages/core/${name}`,
  specifier: `@music-downloader/core-${name}`,
  core: name,
});

const actors: Actor[] = [
  {
    id: 'cli',
    kind: 'app',
    dir: 'apps/cli',
    specifier: '@music-downloader/cli',
  },
  {
    id: 'application',
    kind: 'application',
    dir: 'packages/application',
    specifier: '@music-downloader/application',
  },
  {
    id: 'shared',
    kind: 'shared',
    dir: 'packages/shared',
    specifier: '@music-downloader/shared',
  },
  ...[
    'downloader',
    'planner',
    'queue',
    'retry',
    'manifest',
    'filesystem',
    'validation',
  ].map(core),
  {
    id: 'yandex',
    kind: 'provider',
    dir: 'packages/providers/yandex-music',
    specifier: '@music-downloader/provider-yandex-music',
  },
  {
    id: 'metadata',
    kind: 'metadata',
    dir: 'packages/metadata',
    specifier: '@music-downloader/metadata',
  },
  {
    id: 'persistence',
    kind: 'persistence',
    dir: 'packages/persistence',
    specifier: '@music-downloader/persistence',
  },
  {
    id: 'logging',
    kind: 'logging',
    dir: 'packages/logging',
    specifier: '@music-downloader/logging',
  },
  {
    id: 'testing',
    kind: 'testing',
    dir: 'packages/testing',
    specifier: '@music-downloader/testing',
  },
];

/** Будущие (виртуальные) пакеты: только источники импортов. */
const virtualSources: Actor[] = [
  { id: 'desktop', kind: 'app', dir: 'apps/desktop', specifier: null },
  {
    id: 'other-provider',
    kind: 'provider',
    dir: 'packages/providers/other',
    specifier: null,
  },
];

const restrictedCoreSources = new Set([
  'filesystem',
  'retry',
  'manifest',
  'validation',
  'planner',
]);
const restrictedCoreTargets = new Set(['downloader', 'queue']);

/** Ожидаемое поведение: ADR-001 п.1-6 плюс STEP-ужесточение planner и правило testing. */
function oracleAllows(
  from: Actor,
  to: Actor,
  typeOnly: boolean,
  isTest: boolean,
): boolean {
  if (to.kind === 'testing') {
    return isTest && from.kind !== 'shared' && from.kind !== 'app';
  }
  switch (from.kind) {
    case 'app':
      return to.kind === 'application' || (to.kind === 'shared' && typeOnly);
    case 'application':
      return to.kind !== 'app';
    case 'shared':
      return false;
    case 'core':
      if (to.kind === 'shared') return true;
      if (to.kind !== 'core') return false;
      return !(
        restrictedCoreSources.has(from.core ?? '') &&
        restrictedCoreTargets.has(to.core ?? '')
      );
    default:
      return to.kind === 'shared';
  }
}

describe('матрица границ ADR-001: group x group', () => {
  const sources = [...actors, ...virtualSources];
  for (const from of sources) {
    for (const isTest of [false, true]) {
      it(
        `${from.dir} (${isTest ? 'test' : 'src'}): все цели, value и type-only`,
        async () => {
          const filePath = `${from.dir}/src/probe${isTest ? '.test' : ''}.ts`;
          for (const to of actors) {
            if (to.id === from.id || to.specifier === null) continue;
            for (const typeOnly of [false, true]) {
              const code = `${typeOnly ? 'import type' : 'import'} { X } from '${to.specifier}';`;
              const allowed = oracleAllows(from, to, typeOnly, isTest);
              if (allowed) {
                await expectClean(code, filePath);
              } else {
                await expectRule(code, filePath, 'boundaries/dependency');
              }
            }
          }
        },
        from.dir === 'apps/cli' && !isTest ? 30_000 : 5_000,
      );
    }
  }
});

/** Формы импорта проверяют одну политику публичной точки входа (@link planning/tasks/STEP-047.md). */
function applicationImports(specifier: string) {
  return [
    { code: `import { X } from '${specifier}';`, typeOnly: false },
    { code: `import type { X } from '${specifier}';`, typeOnly: true },
    { code: `export { X } from '${specifier}';`, typeOnly: false },
    { code: `export type { X } from '${specifier}';`, typeOnly: true },
    { code: `export * from '${specifier}';`, typeOnly: false },
    { code: `export type * from '${specifier}';`, typeOnly: true },
    { code: `const m = import('${specifier}');`, typeOnly: false },
    { code: `const m = import(\`${specifier}\`);`, typeOnly: false },
    { code: `const m = require('${specifier}');`, typeOnly: false },
    { code: `type T = import('${specifier}').X;`, typeOnly: true },
    { code: `import m = require('${specifier}');`, typeOnly: false },
    { code: `import type m = require('${specifier}');`, typeOnly: true },
  ];
}

describe('публичный application/contracts (STEP-047)', () => {
  const application = actors.find((actor) => actor.kind === 'application');
  if (application === undefined) throw new Error('Нет application в oracle');

  for (const from of [...actors, ...virtualSources]) {
    if (from.kind === 'application') continue;
    for (const isTest of [false, true]) {
      it(`${from.dir} (${isTest ? 'test' : 'src'}): root и contracts во всех формах`, async () => {
        const filePath = `${from.dir}/src/probe${isTest ? '.test' : ''}.cts`;
        for (const specifier of [
          '@music-downloader/application',
          '@music-downloader/application/contracts',
        ]) {
          for (const { code, typeOnly } of applicationImports(specifier)) {
            if (oracleAllows(from, application, typeOnly, isTest)) {
              await expectClean(code, filePath);
            } else {
              const result = await lint(code, filePath);
              // Проверяем именно ребро: публичный export не открывает доступ нижним слоям.
              expect(
                result.messages.map((message) => message.messageId),
              ).toContain('forbiddenEdge');
              expect(ruleIds(result)).toContain('boundaries/dependency');
            }
          }
        }
      });
    }
  }

  for (const dir of ['apps/cli', 'apps/desktop']) {
    for (const suffix of ['', '.test']) {
      it(`${dir} (${suffix ? 'test' : 'src'}): внутренние и относительные пути закрыты`, async () => {
        const filePath = `${dir}/src/probe${suffix}.cts`;
        const rejected = [
          ['@music-downloader/application/src/contracts.js', 'deepImport'],
          ['@music-downloader/application/dist/contracts.js', 'deepImport'],
          ['@music-downloader/application/contracts/internal', 'deepImport'],
          ['@music-downloader/application/unknown', 'deepImport'],
          ['../../../packages/application/src/contracts.js', 'crossRelative'],
          [
            '../../../node_modules/@music-downloader/application/contracts',
            'crossRelative',
          ],
        ] as const;
        for (const [specifier, messageId] of rejected) {
          for (const { code } of applicationImports(specifier)) {
            const result = await lint(code, filePath);
            expect(ruleIds(result)).toContain('boundaries/dependency');
            expect(
              result.messages.map((message) => message.messageId),
            ).toContain(messageId);
          }
        }
      });
    }
  }
});

describe('Yandex SDK (PRN-001)', () => {
  const sdkImports = [
    "import '@dvxch/yandex-music';",
    "import type { Api } from '@dvxch/yandex-music';",
    "export * from '@dvxch/yandex-music';",
    "export type { Api } from '@dvxch/yandex-music';",
    "import api from '@dvxch/yandex-music/lib/api';",
    "const lazy = import('@dvxch/yandex-music');",
    "const sdk = require('@dvxch/yandex-music');",
  ];

  it('запрещён во всех группах src/test, включая будущие пакеты', async () => {
    for (const source of [...actors, ...virtualSources]) {
      if (source.dir === 'packages/providers/yandex-music') continue;
      for (const suffix of ['', '.test']) {
        for (const code of sdkImports) {
          await expectRule(
            code,
            `${source.dir}/src/probe${suffix}.ts`,
            'boundaries/external',
          );
        }
      }
    }
    await expectRule(
      sdkImports[0] ?? '',
      'eslint/probe.ts',
      'boundaries/external',
    );
    await expectRule(
      sdkImports[0] ?? '',
      'packages/new-layer/src/probe.ts',
      'boundaries/external',
    );
  });

  it('разрешён только в providers/yandex-music', async () => {
    for (const suffix of ['', '.test']) {
      for (const code of sdkImports.slice(0, 4)) {
        await expectClean(
          code,
          `packages/providers/yandex-music/src/probe${suffix}.ts`,
        );
      }
    }
  });
});

describe('обходы и разные формы импорта', () => {
  it('relative и deep import в другой пакет запрещены', async () => {
    await expectRule(
      "import { x } from '../../shared/src/index.js';",
      'packages/application/src/probe.ts',
      'boundaries/dependency',
    );
    await expectRule(
      "import { x } from '@music-downloader/shared/src/index.js';",
      'packages/core/retry/src/probe.ts',
      'boundaries/dependency',
    );
    await expectRule(
      "import { x } from '../../../packages/core/downloader/src/index.js';",
      'apps/cli/src/probe.ts',
      'boundaries/dependency',
    );
    await expectClean(
      "import { x } from './local.js';",
      'packages/core/retry/src/probe.ts',
    );
  });

  it('закрыты неизвестные внутренние пакеты', async () => {
    await expectRule(
      "import { x } from '@music-downloader/future';",
      'packages/application/src/probe.ts',
      'boundaries/dependency',
    );
    await expectRule(
      "import { x } from '@music-downloader/shared';",
      'packages/future-layer/src/probe.ts',
      'boundaries/dependency',
    );
  });

  it('динамический import, require и import type() проверяются по тем же правилам', async () => {
    const retry = 'packages/core/retry/src/probe.ts';
    await expectRule(
      "const m = import('@music-downloader/core-downloader');",
      retry,
      'boundaries/dependency',
    );
    await expectRule(
      "const m = require('@music-downloader/core-queue');",
      retry,
      'boundaries/dependency',
    );
    await expectRule(
      "type T = import('@music-downloader/core-downloader').X;",
      retry,
      'boundaries/dependency',
    );
    await expectClean("const m = import('@music-downloader/shared');", retry);
    await expectClean("type T = import('@music-downloader/shared').X;", retry);
    await expectClean(
      "type T = import('@music-downloader/shared').X;",
      'apps/cli/src/probe.ts',
    );
    await expectRule(
      "const m = import('@music-downloader/shared');",
      'apps/cli/src/probe.ts',
      'boundaries/dependency',
    );
  });

  it('import x = require() в .cts проверяется (TSImportEqualsDeclaration)', async () => {
    const retry = 'packages/core/retry/src/probe.cts';
    await expectRule(
      "import x = require('@music-downloader/core-downloader');",
      retry,
      'boundaries/dependency',
    );
    await expectRule(
      "import x = require('@dvxch/yandex-music');",
      retry,
      'boundaries/external',
    );
    await expectClean("import x = require('@music-downloader/shared');", retry);
    await expectRule(
      "import x = require('@music-downloader/shared');",
      'apps/cli/src/probe.cts',
      'boundaries/dependency',
    );
    await expectClean(
      "import type x = require('@music-downloader/shared');",
      'apps/cli/src/probe.cts',
    );
  });

  it('вычисляемые specifier-ы и createRequire закрыты (fail-closed)', async () => {
    const file = 'packages/application/src/probe.ts';
    await expectRule('const m = import(name);', file, 'boundaries/bypass');
    await expectRule(
      'const m = import(`./${name}`);',
      file,
      'boundaries/bypass',
    );
    await expectRule('const m = require(name);', file, 'boundaries/bypass');
    await expectRule(
      "import { createRequire } from 'node:module';",
      file,
      'boundaries/bypass',
    );
    await expectRule(
      "import * as m from 'node:module'; m.createRequire(import.meta.url);",
      file,
      'boundaries/bypass',
    );
    await expectClean("const m = import('./static.js');", file);
  });

  it('relative-путь через node_modules отображается на пакет и проверяется', async () => {
    await expectRule(
      "import '../../../node_modules/@dvxch/yandex-music/index.js';",
      'apps/cli/src/p.ts',
      'boundaries/external',
    );
    await expectRule(
      "import '../../../node_modules/@music-downloader/core-downloader/dist/index.js';",
      'apps/cli/src/p.ts',
      'boundaries/dependency',
    );
    await expectRule(
      "import '../../../../node_modules/@music-downloader/core-downloader/dist/index.js';",
      'packages/core/retry/src/p.ts',
      'boundaries/dependency',
    );
    await expectRule(
      "import '../../../../node_modules/electron/index.js';",
      'packages/core/downloader/src/p.ts',
      'boundaries/external',
    );
    await expectRule(
      "import '../../../node_modules/lodash/index.js';",
      'packages/shared/src/p.ts',
      'boundaries/external',
    );
    await expectRule(
      "import '../../../node_modules/fs/index.js';",
      'packages/shared/src/p.ts',
      'boundaries/external',
    );
  });

  it('абсолютные пути, URL-схемы, #-imports и выход за workspace закрыты (fail-closed)', async () => {
    const files = [
      'apps/cli/src/p.ts',
      'packages/core/retry/src/p.ts',
      'packages/core/downloader/src/p.ts',
      'packages/shared/src/p.ts',
    ];
    for (const file of files) {
      for (const specifier of [
        '/x/node_modules/@dvxch/yandex-music/index.js',
        'C:/x/node_modules/electron/index.js',
        'file:///x/node_modules/@dvxch/yandex-music/index.js',
        'data:text/javascript,export default 1',
        'http://example.invalid/x.js',
        'https://example.invalid/x.js',
        '#sdk',
        '#downloader',
        '../../../../../outside/x.js',
        '../../../../eslint/boundaries.config.mjs',
        'lodash/../../../x.js',
        '..\\..\\x.js',
        '../../../node_modules/@dvxch/yandex-music/index.js?/../../../../apps/cli/src/index.js',
        '../../../node_modules/@dvxch/yandex-music/index.js#/../../../../apps/cli/src/index.js',
        './%2e%2e/%2e%2e/%2e%2e/packages/core/downloader/dist/index.js',
        './.%2e/%2E%2E/node%5fmodules/@dvxch/yandex-music/index.js',
      ]) {
        await expectRule(
          `import ${JSON.stringify(specifier)};`,
          file,
          'boundaries/bypass',
        );
      }
      await expectRule(
        "const m = import('file:///x.js');",
        file,
        'boundaries/bypass',
      );
      await expectRule("require('#sdk');", file, 'boundaries/bypass');
    }
  });

  it('локальные и разрешённые specifier-ы остаются чистыми', async () => {
    await expectClean(
      "import { x } from './x.js'; import { y } from '../y.js';",
      'packages/core/retry/src/nested/p.ts',
    );
    await expectClean(
      "import fs from 'node:fs'; import path from 'path';",
      'packages/application/src/p.ts',
    );
    await expectClean(
      "import { x } from '../node_modules/lodash/index.js';",
      'packages/application/src/p.ts',
    );
  });

  it('require-алиасы, module.require и деструктурированный createRequire закрыты', async () => {
    const file = 'packages/application/src/probe.ts';
    for (const code of [
      "const r = require; r('@dvxch/yandex-music');",
      "module.require('@dvxch/yandex-music');",
      "const { createRequire } = require('node:module');",
      'const { createRequire: c } = m; c(import.meta.url);',
      'const f = m.createRequire; f(import.meta.url);',
      "m['createRequire'](import.meta.url);",
    ]) {
      await expectRule(code, file, 'boundaries/bypass');
    }
  });

  it('inline-директивы не снимают ни одно правило', async () => {
    await expectRule(
      "// eslint-disable-next-line boundaries/external\nimport '@dvxch/yandex-music';",
      'apps/cli/src/probe.ts',
      'boundaries/external',
    );
    await expectRule(
      "/* eslint-disable */\nimport '@music-downloader/core-downloader';",
      'packages/core/retry/src/probe.ts',
      'boundaries/dependency',
    );
  });
});

describe('apps: type-only доступ к shared', () => {
  const file = 'apps/cli/src/probe.ts';
  it('разрешает import type и export type', async () => {
    await expectClean(
      "import type { X } from '@music-downloader/shared';",
      file,
    );
    await expectClean(
      "export type { X } from '@music-downloader/shared';",
      file,
    );
    await expectClean("export type * from '@music-downloader/shared';", file);
  });
  it('запрещает value, import {type X} и export {type X}', async () => {
    await expectRule(
      "import { x } from '@music-downloader/shared';",
      file,
      'boundaries/dependency',
    );
    await expectRule(
      "import { type X } from '@music-downloader/shared';",
      file,
      'boundaries/dependency',
    );
    await expectRule(
      "export { type X } from '@music-downloader/shared';",
      file,
      'boundaries/dependency',
    );
    await expectRule(
      "export * from '@music-downloader/shared';",
      file,
      'boundaries/dependency',
    );
    await expectRule(
      "import '@music-downloader/shared';",
      file,
      'boundaries/dependency',
    );
  });

  it('эмиссия TypeScript подтверждает риск inline type-only форм', () => {
    const emit = (code: string) =>
      ts.transpileModule(code, {
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2023,
          verbatimModuleSyntax: true,
        },
      }).outputText;
    expect(
      emit("import type { X } from '@music-downloader/shared';"),
    ).not.toContain('@music-downloader/shared');
    expect(
      emit("import { type X } from '@music-downloader/shared';"),
    ).toContain('@music-downloader/shared');
    expect(
      emit("export { type X } from '@music-downloader/shared';"),
    ).toContain('@music-downloader/shared');
  });
});

describe('packages/shared: чистый контракт', () => {
  const src = 'packages/shared/src/probe.ts';
  it('запрещает Node built-ins и сторонние зависимости', async () => {
    for (const specifier of [
      'node:fs',
      'fs',
      'fs/promises',
      'node:path',
      'path',
      'child_process',
    ]) {
      await expectRule(
        `import x from '${specifier}';`,
        src,
        'boundaries/external',
      );
      await expectRule(
        `import type x from '${specifier}';`,
        src,
        'boundaries/external',
      );
    }
    await expectRule("import x from 'lodash';", src, 'boundaries/external');
    await expectRule("import x from 'vitest';", src, 'boundaries/external');
    await expectClean(
      "import x from 'vitest';",
      'packages/shared/src/probe.test.ts',
    );
    await expectRule(
      "import x from 'lodash';",
      'packages/shared/src/probe.test.ts',
      'boundaries/external',
    );
    await expectRule(
      "import x from 'node:fs';",
      'packages/shared/src/probe.test.ts',
      'boundaries/external',
    );
  });

  it('запрещает I/O-глобалы и обходы через globalThis/self/window', async () => {
    for (const code of [
      'const a = process.env;',
      "const a = typeof process === 'undefined';",
      "const a = fetch('x');",
      'const a = new XMLHttpRequest();',
      'const a = indexedDB;',
      'const a = window;',
      'const a = Buffer.from([]);',
      'const a = globalThis.fetch;',
      "const a = globalThis['process'];",
      'const a = self.fetch;',
      'const a = window.localStorage;',
      "const a = require('x');",
    ]) {
      await expectRule(code, src, 'boundaries/bypass');
    }
  });

  it('запрещает ambient-объявления запрещённых I/O-имён', async () => {
    for (const code of [
      'declare const process: { env: Record<string, string> }; export const x = process.env;',
      'declare let process: { env: Record<string, string> }; export const x = process.env;',
      'declare var process: { env: Record<string, string> }; export const x = process.env;',
      'declare function fetch(u: string): Promise<unknown>; fetch("u");',
      'export declare function fetch(u: string): Promise<unknown>;',
      'declare const window: object;',
      'declare namespace process { const env: object }',
      'declare module process { const env: object }',
      'declare class Buffer {}',
      'declare enum window { A }',
      'declare global { var process: object }',
      'declare global { function fetch(u: string): void }',
      'declare global { namespace process { const env: object } }',
      'declare const globalThis: object;',
    ]) {
      await expectRule(code, src, 'boundaries/bypass');
    }
  });

  it('запрещает global.process и global.fetch', async () => {
    for (const code of [
      'const a = global.process;',
      'const a = global.fetch;',
      "const a = global['process'];",
    ]) {
      await expectRule(code, src, 'boundaries/bypass');
    }
  });

  it('разрешает существующий web-platform.d.ts и ambient-типы без I/O-имён', async () => {
    const declarations = readFileSync(
      path.join(root, 'packages/shared/src/web-platform.d.ts'),
      'utf8',
    );
    await expectClean(declarations, 'packages/shared/src/web-platform.d.ts');
    await expectClean(
      'declare const Custom: { id: string }; declare function helper(): void; declare namespace Pure { const x: number }',
      'packages/shared/src/ambient.d.ts',
    );
  });

  it('разрешает чистые web-совместимые API', async () => {
    await expectClean(
      "const u = new URL('https://example.invalid/'); const p = new URLSearchParams(); const c = new AbortController(); const e = new TextEncoder(); const d = new TextDecoder(); export { u, p, c, e, d };",
      src,
    );
  });
});

describe('запрещённые внешние модули core и application', () => {
  const coreFile = 'packages/core/downloader/src/probe.ts';
  const applicationFile = 'packages/application/src/probe.ts';
  const native = [
    'better-sqlite3',
    'sqlite3',
    'keytar',
    '@napi-rs/keyring',
    'electron-store',
  ];

  it('core: electron, react, react-dom, @mui и native-модули, включая type-only и re-export', async () => {
    for (const specifier of [
      'electron',
      'react',
      'react-dom',
      '@mui/material',
      '@mui/icons-material/Add',
      ...native,
    ]) {
      await expectRule(
        `import x from '${specifier}';`,
        coreFile,
        'boundaries/external',
      );
      await expectRule(
        `import type x from '${specifier}';`,
        coreFile,
        'boundaries/external',
      );
      await expectRule(
        `export * from '${specifier}';`,
        coreFile,
        'boundaries/external',
      );
    }
    await expectClean(
      "import { z } from 'zod'; import { readFile } from 'node:fs/promises';",
      coreFile,
    );
  });

  it('application: electron и native-модули (runtimeAdapters), React как STEP-ужесточение', async () => {
    for (const specifier of [
      'electron',
      'react',
      'react-dom',
      '@mui/material',
      ...native,
    ]) {
      await expectRule(
        `import x from '${specifier}';`,
        applicationFile,
        'boundaries/external',
      );
      await expectRule(
        `export type { X } from '${specifier}';`,
        applicationFile,
        'boundaries/external',
      );
    }
    await expectClean(
      "import type { Schema } from 'zod'; import { z } from 'zod';",
      applicationFile,
    );
  });

  it('другие группы не получают эти ограничения произвольно', async () => {
    await expectClean(
      "import x from 'better-sqlite3';",
      'packages/persistence/src/probe.ts',
    );
    await expectClean("import x from 'react';", 'apps/cli/src/probe.ts');
  });
});

describe('позитивные allow-cases', () => {
  it('основные разрешённые рёбра', async () => {
    await expectClean(
      "import { run } from '@music-downloader/application';",
      'apps/cli/src/probe.ts',
    );
    await expectClean(
      "import type { X } from '@music-downloader/shared';",
      'apps/cli/src/probe.ts',
    );
    await expectClean(
      "import { p } from '@music-downloader/provider-yandex-music';",
      'packages/application/src/probe.ts',
    );
    await expectClean(
      "import { r } from '@music-downloader/core-retry';",
      'packages/core/downloader/src/probe.ts',
    );
    await expectClean(
      "import { l } from '@music-downloader/logging';",
      'packages/application/src/probe.ts',
    );
    await expectClean(
      "import { m } from '@music-downloader/testing';",
      'packages/application/src/probe.test.ts',
    );
    await expectClean(
      "import { s } from '@music-downloader/shared';",
      'packages/testing/src/probe.ts',
    );
  });
});

describe('конфигурация не теряет запреты после flat-config overrides', () => {
  const samples = [
    ...[...actors, ...virtualSources].flatMap((actor) => [
      `${actor.dir}/src/probe.ts`,
      `${actor.dir}/src/probe.test.ts`,
      `${actor.dir}/src/probe.cts`,
      `${actor.dir}/src/probe.mjs`,
    ]),
    'eslint/probe.ts',
    'packages/new-layer/src/probe.ts',
  ];
  it('правила boundaries/* активны как error для всех групп и расширений', async () => {
    for (const sample of samples) {
      const config = (await eslint.calculateConfigForFile(
        path.join(root, sample),
      )) as {
        rules?: Record<string, unknown>;
      };
      for (const rule of [
        'boundaries/dependency',
        'boundaries/external',
        'boundaries/bypass',
      ]) {
        const entry = config.rules?.[rule];
        expect(
          Array.isArray(entry) ? entry[0] : entry,
          `${sample}: ${rule}`,
        ).toBe(2);
      }
    }
  });
});
