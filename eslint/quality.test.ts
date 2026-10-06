import fs from 'node:fs';
import path from 'node:path';
import { ESLint } from 'eslint';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createQualityConfig } from '../eslint.config.mjs';

const root = path.resolve(import.meta.dirname, '..');
const fixturesParent = path.join(root, '.cache', 'quality-fixtures');
let fixtureRoot = '';
let qualityEslint: ESLint;
let boundariesEslint: ESLint;

beforeAll(() => {
  fs.mkdirSync(fixturesParent, { recursive: true });
  fixtureRoot = fs.mkdtempSync(path.join(fixturesParent, 'run-'));
  fs.writeFileSync(
    path.join(fixtureRoot, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        target: 'ES2023',
        lib: ['ES2023'],
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        noEmit: true,
        types: [],
      },
      include: ['packages/**/*.ts', 'apps/**/*.ts'],
    }),
  );
  qualityEslint = new ESLint({
    cwd: fixtureRoot,
    overrideConfigFile: true,
    overrideConfig: createQualityConfig(fixtureRoot),
  });
  boundariesEslint = new ESLint({
    cwd: fixtureRoot,
    overrideConfigFile: path.join(root, 'eslint.boundaries.config.mjs'),
    allowInlineConfig: false,
  });
});

afterAll(() => {
  // Удаляется только собственный временный каталог с защитой точного пути.
  if (fixtureRoot.startsWith(`${fixturesParent}${path.sep}run-`)) {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

let counter = 0;
/** Пишет реальный временный файл (нужен type-aware правилам) и линтует его. */
async function lintFile(engine: ESLint, relativePath: string, code: string) {
  counter += 1;
  const withIndex = relativePath.replace(/(\.[a-z.]+)$/, `-${counter}$1`);
  const absolute = path.join(fixtureRoot, withIndex);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, code);
  const [result] = await engine.lintFiles([absolute]);
  if (result === undefined) throw new Error('ESLint не вернул результат');
  expect(result.fatalErrorCount, JSON.stringify(result.messages)).toBe(0);
  return result;
}

const ids = (result: ESLint.LintResult) =>
  result.messages.map((message) => message.ruleId);
const production = 'packages/application/src/fixture.ts';
const productionTest = 'packages/application/src/fixture.test.ts';

describe('необоснованный и обоснованный explicit any', () => {
  it('необоснованный any падает в основном проходе', async () => {
    const result = await lintFile(
      qualityEslint,
      production,
      'export const a: any = 1;\n',
    );
    expect(ids(result)).toContain('@typescript-eslint/no-explicit-any');
  });

  const justified =
    '// eslint-disable-next-line @typescript-eslint/no-explicit-any -- внешний контракт без типов\nexport const a: any = 1;\n';

  it('обоснованный any проходит основной проход без warning', async () => {
    const result = await lintFile(qualityEslint, production, justified);
    expect(result.messages).toEqual([]);
  });

  it('тот же файл проходит boundary-проход без warning и директив', async () => {
    const result = await lintFile(boundariesEslint, production, justified);
    expect(result.messages).toEqual([]);
  });

  it('директива без описания, лишняя и файловая отклоняются', async () => {
    const noDescription = await lintFile(
      qualityEslint,
      production,
      '// eslint-disable-next-line @typescript-eslint/no-explicit-any\nexport const a: any = 1;\n',
    );
    expect(ids(noDescription)).toContain('eslint-comments/require-description');

    const unused = await lintFile(
      qualityEslint,
      production,
      '// eslint-disable-next-line no-console -- ничего не подавляет\nexport const a = 1;\n',
    );
    expect(
      unused.messages.some((m) =>
        /Unused eslint-disable directive/.test(m.message),
      ),
    ).toBe(true);

    const wholeFile = await lintFile(
      qualityEslint,
      production,
      '/* eslint-disable no-console -- файловое отключение */\nexport const a = 1;\n',
    );
    expect(ids(wholeFile)).toContain('eslint-comments/no-use');
  });

  it('@ts-ignore запрещён, @ts-expect-error требует описание', async () => {
    const ignore = await lintFile(
      qualityEslint,
      production,
      '// @ts-ignore\nexport const a: number = 1;\n',
    );
    expect(ids(ignore)).toContain('@typescript-eslint/ban-ts-comment');
    const bare = await lintFile(
      qualityEslint,
      production,
      '// @ts-expect-error\nexport const a: number = 1;\n',
    );
    expect(ids(bare)).toContain('@typescript-eslint/ban-ts-comment');
  });

  it('import {type X} отклоняется из-за побочной эмиссии', async () => {
    const result = await lintFile(
      qualityEslint,
      production,
      "import { type Foo } from './other.js';\nexport type Bar = Foo;\n",
    );
    expect(ids(result)).toContain(
      '@typescript-eslint/no-import-type-side-effects',
    );
  });
});

describe('type-aware no-unsafe-* только для production', () => {
  it('unsafe any из library return ловится в production', async () => {
    const assignment = await lintFile(
      qualityEslint,
      production,
      "const parsed = JSON.parse('1');\nexport const n: number = parsed;\n",
    );
    expect(ids(assignment)).toContain(
      '@typescript-eslint/no-unsafe-assignment',
    );

    const returned = await lintFile(
      qualityEslint,
      production,
      "export function f(): number {\n  return JSON.parse('1');\n}\n",
    );
    expect(ids(returned)).toContain('@typescript-eslint/no-unsafe-return');

    const member = await lintFile(
      qualityEslint,
      production,
      "const parsed = JSON.parse('{}');\nexport const n = parsed.value;\n",
    );
    expect(ids(member)).toContain('@typescript-eslint/no-unsafe-member-access');
  });

  it('те же конструкции в тестовых файлах не получают production-правил', async () => {
    const result = await lintFile(
      qualityEslint,
      productionTest,
      "const parsed = JSON.parse('1');\nexport const n: number = parsed;\n",
    );
    expect(ids(result)).not.toContain(
      '@typescript-eslint/no-unsafe-assignment',
    );
  });

  it('корректный типизированный код проходит без сообщений', async () => {
    const result = await lintFile(
      qualityEslint,
      production,
      "const parsed: unknown = JSON.parse('1');\nexport const n = typeof parsed === 'number' ? parsed : 0;\n",
    );
    expect(result.messages).toEqual([]);
  });
});
