import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { workspacePackages } from './boundaries.config.mjs';

const root = path.resolve(import.meta.dirname, '..');

const strictFamily = [
  'strict',
  'noImplicitAny',
  'strictNullChecks',
  'strictFunctionTypes',
  'strictBindCallApply',
  'strictPropertyInitialization',
  'noImplicitThis',
  'useUnknownInCatchVariables',
  'alwaysStrict',
  'strictBuiltinIteratorReturn',
] as const;

function parse(configPath: string) {
  const read = ts.readConfigFile(configPath, ts.sys.readFile);
  expect(read.error, configPath).toBeUndefined();
  const parsed = ts.parseJsonConfigFileContent(
    read.config,
    ts.sys,
    path.dirname(configPath),
  );
  expect(
    parsed.errors.map((e) =>
      ts.flattenDiagnosticMessageText(e.messageText, '\n'),
    ),
  ).toEqual([]);
  return parsed;
}

const configs = [
  'tsconfig.base.json',
  'tsconfig.tests.json',
  ...workspacePackages.flatMap(({ dir }) => [
    `${dir}/tsconfig.json`,
    `${dir}/tsconfig.test.json`,
  ]),
];

describe('strict-контракт всех tsconfig', () => {
  for (const config of configs) {
    it(`${config}: эффективный strict и всё семейство strict-флагов`, () => {
      const { options } = parse(path.join(root, config));
      expect(options.strict).toBe(true);
      expect(options.noImplicitAny).not.toBe(false);
      for (const flag of strictFamily) {
        expect(
          options[flag as keyof ts.CompilerOptions],
          `${config}: ${flag}`,
        ).not.toBe(false);
      }
      expect(options.verbatimModuleSyntax).toBe(true);
      expect(options.isolatedModules).toBe(true);
      expect(options.noUncheckedIndexedAccess).toBe(true);
      expect(options.module).toBe(ts.ModuleKind.NodeNext);
      expect(options.target).toBe(ts.ScriptTarget.ES2023);
      expect(options.customConditions).toContain('@music-downloader/source');
    });
  }

  it('production-конфиги composite с declaration и dist, тестовые — noEmit без composite', () => {
    for (const { dir } of workspacePackages) {
      const production = parse(path.join(root, dir, 'tsconfig.json')).options;
      expect(production.composite, dir).toBe(true);
      expect(production.declaration, dir).toBe(true);
      expect(production.outDir, dir).toBe(path.join(root, dir, 'dist'));
      const tests = parse(path.join(root, dir, 'tsconfig.test.json')).options;
      expect(tests.noEmit, dir).toBe(true);
      expect(tests.composite, dir).toBe(false);
    }
  });
});

describe('root solution и тестовая программа', () => {
  it('tsconfig.json ссылается ровно на 15 workspace-пакетов', () => {
    const solution = JSON.parse(
      fs.readFileSync(path.join(root, 'tsconfig.json'), 'utf8'),
    ) as {
      files: string[];
      references: { path: string }[];
    };
    expect(solution.files).toEqual([]);
    expect(solution.references.map((r) => r.path).sort()).toEqual(
      workspacePackages.map((p) => p.dir).sort(),
    );
  });

  it('tsconfig.tests.json включает все тестовые, конфигурационные и tooling-файлы TypeScript', () => {
    const { fileNames, options } = parse(
      path.join(root, 'tsconfig.tests.json'),
    );
    expect(options.noEmit).toBe(true);
    expect(options.composite).toBe(false);
    const program = ts.createProgram({ rootNames: fileNames, options });
    const listed = new Set(
      program.getRootFileNames().map((f) => path.relative(root, f)),
    );
    const expected: string[] = ['vitest.config.ts'];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(path.join(root, dir), {
        withFileTypes: true,
      })) {
        if (['node_modules', 'dist', '.cache', '.yarn'].includes(entry.name))
          continue;
        const relative = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(relative);
        else if (
          /\.(test|spec)\.ts$/.test(entry.name) ||
          (dir.startsWith('eslint') && entry.name.endsWith('.ts'))
        ) {
          expected.push(relative);
        }
      }
    };
    for (const dir of ['packages', 'apps', 'eslint']) walk(dir);
    expect(expected.length).toBeGreaterThanOrEqual(
      workspacePackages.length + 4,
    );
    for (const file of expected) expect(listed.has(file), file).toBe(true);
  });

  it('typecheck действительно ловит ошибку типа в тесте (инъекция в памяти)', () => {
    const { fileNames, options } = parse(
      path.join(root, 'tsconfig.tests.json'),
    );
    const virtual = path.join(root, 'packages/shared/src/__injected.test.ts');
    const host = ts.createCompilerHost(options);
    const original = host.getSourceFile.bind(host);
    host.getSourceFile = (name, ...rest) =>
      name === virtual
        ? ts.createSourceFile(
            name,
            "export const n: number = 'x';\n",
            options.target ?? ts.ScriptTarget.ES2023,
          )
        : original(name, ...rest);
    const program = ts.createProgram({
      rootNames: [...fileNames, virtual],
      options,
      host,
    });
    const messages = ts
      .getPreEmitDiagnostics(program, program.getSourceFile(virtual))
      .map((d) => d.code);
    expect(messages).toContain(2322);
  });
});

describe('packages/shared: изолированная production-программа', () => {
  const sharedConfig = path.join(root, 'packages/shared/tsconfig.json');

  function diagnosticsFor(code: string): string[] {
    const { fileNames, options } = parse(sharedConfig);
    const virtual = path.join(root, 'packages/shared/src/__probe.ts');
    const host = ts.createCompilerHost(options);
    const original = host.getSourceFile.bind(host);
    host.getSourceFile = (name, ...rest) =>
      name === virtual
        ? ts.createSourceFile(name, code, ts.ScriptTarget.ES2023)
        : original(name, ...rest);
    const program = ts.createProgram({
      rootNames: [...fileNames, virtual],
      options,
      host,
    });
    return ts
      .getPreEmitDiagnostics(program, program.getSourceFile(virtual))
      .map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
  }

  it('использует lib ES2023 без DOM и types: []', () => {
    const { options } = parse(sharedConfig);
    expect(options.types).toEqual([]);
    expect(options.lib?.map((lib) => lib.toLowerCase())).toEqual([
      'lib.es2023.d.ts',
    ]);
  });

  it('не видит Node/DOM I/O globals', () => {
    for (const name of [
      'process',
      'Buffer',
      'fetch',
      'window',
      'indexedDB',
      'XMLHttpRequest',
    ]) {
      const messages = diagnosticsFor(`export const probe = ${name};\n`);
      expect(messages.join('\n'), name).toMatch(
        new RegExp(`Cannot find name '${name}'`),
      );
    }
  });

  it('точечные ambient-типы чистых web API доступны', () => {
    const messages = diagnosticsFor(
      "export const parts = [new URL('https://example.invalid/'), new URLSearchParams(), new AbortController().signal, new TextEncoder(), new TextDecoder()];\n",
    );
    expect(messages).toEqual([]);
  });
});
