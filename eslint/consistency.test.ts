import fs from 'node:fs';
import path from 'node:path';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';
import vitestConfig from '../vitest.config.js';
import {
  allowedEdges,
  expandTestGlobs,
  expandTestIncludeGlobs,
  isTestFile,
  nodeRange,
  testFileSuffixes,
  workspacePackages,
} from './boundaries.config.mjs';

const root = path.resolve(import.meta.dirname, '..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- произвольные package.json/tsconfig читаются как данные
const json = (file: string) => JSON.parse(read(file)) as Record<string, any>;

interface Manifest {
  name: string;
  private?: boolean;
  type?: string;
  exports?: Record<string, Record<string, string>>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}
const manifest = (dir: string) => json(`${dir}/package.json`) as Manifest;

function discoverPackageDirs(): string[] {
  const found: string[] = [];
  for (const base of [
    'apps',
    'packages',
    'packages/core',
    'packages/providers',
  ]) {
    for (const entry of fs.readdirSync(path.join(root, base), {
      withFileTypes: true,
    })) {
      const dir = `${base}/${entry.name}`;
      if (
        entry.isDirectory() &&
        fs.existsSync(path.join(root, dir, 'package.json'))
      )
        found.push(dir);
    }
  }
  return found.sort();
}

describe('workspace', () => {
  it('обнаружены ровно 16 пакетов, совпадающих с таблицей по имени и каталогу', () => {
    const discovered = discoverPackageDirs();
    expect(discovered).toEqual(workspacePackages.map((p) => p.dir).sort());
    expect(discovered).toHaveLength(16);
    for (const pkg of workspacePackages)
      expect(manifest(pkg.dir).name).toBe(pkg.name);
  });

  it('все пакеты private ESM с exports source/default', () => {
    for (const pkg of workspacePackages) {
      const m = manifest(pkg.dir);
      expect(m.private, pkg.dir).toBe(true);
      expect(m.type, pkg.dir).toBe('module');
      expect(m.exports?.['.'], pkg.dir).toEqual({
        '@music-downloader/source': './src/index.ts',
        default: './dist/index.js',
      });
    }
  });

  it('зависимости: workspace:*, подмножество разрешённых рёбер, testing не в dependencies', () => {
    const byName = new Map(workspacePackages.map((p) => [p.name, p]));
    for (const pkg of workspacePackages) {
      const m = manifest(pkg.dir);
      const allowed = allowedEdges(pkg.group);
      for (const [name, range] of Object.entries(m.dependencies ?? {})) {
        if (!name.startsWith('@music-downloader/')) continue;
        expect(range, `${pkg.dir}: ${name}`).toBe('workspace:*');
        const target = byName.get(name);
        expect(target, `${pkg.dir}: неизвестная ${name}`).toBeDefined();
        expect(allowed.value, `${pkg.dir} -> ${name}`).toContain(target?.group);
        expect(target?.group).not.toBe('testing');
      }
      for (const [name, range] of Object.entries(m.devDependencies ?? {})) {
        if (name.startsWith('@music-downloader/')) {
          expect(range).toBe('workspace:*');
          // apps не получают testing (локальное правило границ).
          if (pkg.group === 'app' || pkg.group === 'shared') {
            expect(name).not.toBe('@music-downloader/testing');
          }
        }
      }
    }
  });

  it('project references совпадают с workspace-зависимостями', () => {
    const byName = new Map(workspacePackages.map((p) => [p.name, p]));
    for (const pkg of workspacePackages) {
      // TypeScript references связывают только внутренние пакеты workspace.
      // Внешние зависимости не являются project references и не входят в ожидаемый список.
      const expected = Object.keys(manifest(pkg.dir).dependencies ?? {})
        .filter((name) => name.startsWith('@music-downloader/'))
        .map((name) =>
          path.posix.relative(pkg.dir, byName.get(name)?.dir ?? ''),
        )
        .sort();
      const actual = (
        (json(`${pkg.dir}/tsconfig.json`).references ?? []) as {
          path: string;
        }[]
      )
        .map((r) => r.path)
        .sort();
      expect(actual, pkg.dir).toEqual(expected);
    }
  });

  it('корневые workspaces покрывают все пакеты', () => {
    expect(json('package.json').workspaces).toEqual([
      'apps/*',
      'packages/*',
      'packages/core/*',
      'packages/providers/*',
    ]);
  });
});

describe('Yarn и политика окружения', () => {
  it('Node, packageManager с sha512 и отсутствие npm-артефактов', () => {
    const root_ = json('package.json');
    expect(nodeRange.min).toBe('24.0.0');
    expect(root_.engines.node).toBe(`>=${nodeRange.min} <25`);
    expect(root_.packageManager).toMatch(
      /^yarn@4\.18\.1\+sha512\.[0-9a-f]{128}$/,
    );
    expect(root_.private).toBe(true);
    for (const stale of [
      '.npmrc',
      'package-lock.json',
      'npm-shrinkwrap.json',
      '.npm-cache',
    ]) {
      expect(fs.existsSync(path.join(root, stale)), stale).toBe(false);
    }
    expect(read('.nvmrc').trim()).toBe('24');
  });

  it('.yarnrc.yml: node-modules, локальные кеши, scoped registry и архитектуры', () => {
    const yarnrc = read('.yarnrc.yml');
    for (const line of [
      'nodeLinker: node-modules',
      'enableGlobalCache: false',
      'enableMirror: false',
      'enableTelemetry: false',
      'cacheFolder: .yarn/cache',
      'globalFolder: .cache/yarn/global',
      '    npmRegistryServer: "https://registry.invalid/"',
    ]) {
      expect(yarnrc.split('\n')).toContain(line);
    }
    expect(yarnrc).toMatch(/^ {2}music-downloader:$/m);
    for (const value of [
      'linux',
      'darwin',
      'win32',
      'x64',
      'arm64',
      'glibc',
      'musl',
    ]) {
      expect(yarnrc).toContain(value);
    }
    expect(yarnrc).not.toMatch(/http:\/\//);
  });

  it('yarn.lock содержит workspace-локаторы, а не npm link:true или registry-записи внутренних пакетов', () => {
    const lock = read('yarn.lock');
    for (const pkg of workspacePackages) {
      expect(lock, pkg.name).toContain(`${pkg.name}@workspace:${pkg.dir}`);
    }
    expect(lock).not.toMatch(/link:\s*true/);
    expect(lock).not.toMatch(/"?@music-downloader\/[a-z-]+@npm:/);
    expect(lock).not.toContain('registry.invalid');
  });

  it('.gitignore исключает генерируемое и не содержит дублей или .npm-cache', () => {
    const lines = read('.gitignore')
      .split('\n')
      .filter((line) => line.trim() !== '' && !line.startsWith('#'));
    expect(new Set(lines).size).toBe(lines.length);
    expect(lines).not.toContain('.npm-cache/');
    for (const required of [
      'node_modules/',
      'dist/',
      'coverage/',
      '*.tsbuildinfo',
      '.cache/',
      '.yarn/',
    ]) {
      expect(lines).toContain(required);
    }
  });
});

describe('ignores кеша Yarn и backup в ESLint и Prettier', () => {
  const probes = [
    '.cache/corepack/v1/yarn/4.18.1/yarn.js',
    '.cache/backup-workspace-npm/packages/shared/src/index.ts',
    '.yarn/cache/anything.mjs',
    'node_modules/pkg/index.js',
    'packages/shared/dist/index.js',
  ];

  it('основной проход игнорирует каталоги', async () => {
    const eslint = new ESLint({
      cwd: root,
      overrideConfigFile: path.join(root, 'eslint.config.mjs'),
    });
    for (const probe of probes)
      expect(await eslint.isPathIgnored(path.join(root, probe)), probe).toBe(
        true,
      );
    expect(
      await eslint.isPathIgnored(
        path.join(root, 'packages/shared/src/index.ts'),
      ),
    ).toBe(false);
  }, 30_000);

  it('boundary-проход игнорирует каталоги', async () => {
    const eslint = new ESLint({
      cwd: root,
      overrideConfigFile: path.join(root, 'eslint.boundaries.config.mjs'),
    });
    for (const probe of probes)
      expect(await eslint.isPathIgnored(path.join(root, probe)), probe).toBe(
        true,
      );
    expect(
      await eslint.isPathIgnored(
        path.join(root, 'packages/shared/src/index.ts'),
      ),
    ).toBe(false);
  }, 30_000);

  it('Prettier исключает кеши, build и yarn.lock', () => {
    const lines = read('.prettierignore').split('\n');
    for (const entry of [
      '.cache/',
      '.yarn/',
      'node_modules/',
      'dist/',
      'coverage/',
      'yarn.lock',
    ]) {
      expect(lines).toContain(entry);
    }
  });
});

describe('тестовые globs: единый источник', () => {
  const expanded = expandTestGlobs('src', ['ts']);

  it('tsconfig exclude/include пакетов совпадают с развёрнутыми globs', () => {
    for (const pkg of workspacePackages) {
      const extensions = pkg.dir === 'apps/desktop' ? ['ts', 'tsx'] : ['ts'];
      expect(json(`${pkg.dir}/tsconfig.json`).exclude, pkg.dir).toEqual(
        pkg.dir === 'apps/desktop'
          ? expandTestGlobs('src', extensions)
          : expanded,
      );
      expect(json(`${pkg.dir}/tsconfig.json`).include, pkg.dir).toEqual(
        extensions.map((extension) => `src/**/*.${extension}`),
      );
      expect(json(`${pkg.dir}/tsconfig.test.json`).include, pkg.dir).toEqual(
        expandTestIncludeGlobs('src', extensions),
      );
    }
  });

  it('tsconfig.tests.json включает развёрнутые globs для packages и apps', () => {
    const include = json('tsconfig.tests.json').include as string[];
    for (const prefix of ['packages/**/src', 'apps/**/src']) {
      for (const glob of expandTestIncludeGlobs(prefix, ['ts']))
        expect(include).toContain(glob);
    }
  });

  it('isTestFile распознаёт тесты и не принимает production по имени', () => {
    for (const file of [
      'packages/a/src/x.test.ts',
      'packages/a/src/x.spec.mts',
      'packages/a/src/test/helper.ts',
      'packages/a/src/__tests__/x.ts',
      'packages/a/src/e2e/x.ts',
      'packages/a/src/fixtures/x.ts',
    ]) {
      expect(isTestFile(file), file).toBe(true);
    }
    for (const file of [
      'packages/testing/src/index.ts',
      'packages/a/src/contest.ts',
      'packages/a/src/latest.ts',
      'packages/a/src/testing-utils.ts',
    ]) {
      expect(isTestFile(file), file).toBe(false);
    }
  });

  it('Vitest project есть для каждого workspace и для tooling', () => {
    const projects = (
      vitestConfig as {
        test?: { projects?: { test: { name: string; include: string[] } }[] };
      }
    ).test?.projects;
    expect(projects?.map((p) => p.test.name).sort()).toEqual(
      [...workspacePackages.map((p) => p.name), 'tooling'].sort(),
    );
    for (const project of projects ?? []) {
      if (project.test.name !== 'tooling') {
        expect(project.test.include).toEqual(
          testFileSuffixes.flatMap((s) =>
            project.test.name === '@music-downloader/desktop'
              ? [`src/**/*.${s}.ts`, `src/**/*.${s}.tsx`]
              : [`src/**/*.${s}.ts`],
          ),
        );
      }
    }
  });

  it('у каждого workspace есть smoke-тест', () => {
    for (const pkg of workspacePackages) {
      expect(
        fs.existsSync(path.join(root, pkg.dir, 'src/index.test.ts')),
        pkg.dir,
      ).toBe(true);
    }
  });
});

describe('docs/development.md', () => {
  const docs = read('docs/development.md');
  const scripts = Object.keys(
    json('package.json').scripts as Record<string, string>,
  );
  const yarnBuiltins = [
    'install',
    'add',
    'up',
    'workspaces',
    'exec',
    '--version',
  ];

  it('каждая yarn-команда из документации существует в scripts или является встроенной', () => {
    const commands = [
      ...docs.matchAll(/^\s*(?:corepack )?yarn (?:run )?(\S+)/gm),
    ].map((m) => m[1] ?? '');
    expect(commands.length).toBeGreaterThan(0);
    for (const command of commands) {
      expect([...scripts, ...yarnBuiltins], command).toContain(command);
    }
    for (const script of [
      'lint',
      'typecheck',
      'format:check',
      'test',
      'build',
    ]) {
      expect(docs).toContain(`yarn run ${script}`.replace('run test', 'test'));
    }
  });

  it('содержит фактические версии, пакеты и честные ограничения', () => {
    expect(docs).toContain('yarn@4.18.1');
    expect(docs).toContain(`>=${nodeRange.min} <25`);
    for (const pkg of workspacePackages) expect(docs).toContain(pkg.name);
    expect(docs).toMatch(/не проверя\S* подпис/);
    expect(docs).not.toMatch(/Node\.js 20/);
    expect(docs).not.toMatch(/\bnpm (install|ci|run|test)\b/);
    expect(docs).toContain('run-yarn.mjs');
    expect(docs).toContain('ADR-001');
  });
});

// @link docs/architecture-decisions/ADR-020-node-24-only.md Только Node.js 24
// закреплён во всех местах; прежние границы Node.js 22 нигде не остаются.
describe('Диапазон Node.js по ADR-020', () => {
  const range = `>=${nodeRange.min} <25`;
  const places: ReadonlyArray<readonly [string, string]> = [
    ['docs/development.md', range],
    ['docs/architecture.md', range],
    ['docs/requirements/REQ-040-tool-ts-quality.md', range],
    ['packages/testing/scripts/run-yarn.mjs', range],
    ['packages/testing/scripts/verify-toolchain.mjs', range],
    ['packages/testing/scripts/verify-workspace.mjs', "['24']"],
    ['packages/testing/scripts/verify-workspace-manual.sh', 'Node.js 24'],
    ['.github/workflows/ci.yml', '- "24"'],
  ];

  it.each(places)(
    '%s содержит Node.js 24 и не содержит границ Node.js 22',
    (file, value) => {
      const text = read(file);
      expect(text).toContain(value);
      expect(text).not.toMatch(/22\.1[34]/);
    },
  );

  it('run-yarn отклоняет версии вне диапазона и принимает его границы', async () => {
    // Вычисляемый specifier: у .mjs-скрипта нет деклараций типов (TS7016).
    const specifier = new URL(
      '../packages/testing/scripts/run-yarn.mjs',
      import.meta.url,
    ).href;
    const runYarn = (await import(specifier)) as {
      assertNodeSupported(version: string): void;
    };
    for (const version of ['24.0.0', '24.21.0'])
      expect(() => runYarn.assertNodeSupported(version)).not.toThrow();
    for (const version of ['22.14.0', '25.0.0'])
      expect(() => runYarn.assertNodeSupported(version)).toThrow(
        />=24\.0\.0 <25/,
      );
  });
});
