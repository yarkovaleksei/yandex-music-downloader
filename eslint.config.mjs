/**
 * Основной проход ESLint: качество кода. Границы ADR-001 проверяет отдельный
 * eslint.boundaries.config.mjs (см. скрипт `lint`).
 */
import eslintComments from '@eslint-community/eslint-plugin-eslint-comments';
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { expandTestGlobs } from './eslint/boundaries.config.mjs';
import { sharedIgnores } from './eslint/ignores.mjs';

/**
 * @param {string} rootDirectory корень tsconfig для type-aware правил
 */
export function createQualityConfig(rootDirectory) {
  const testGlobs = expandTestGlobs('**');
  const productionFiles = [
    'packages/**/src/**/*.ts',
    'apps/*/src/**/*.{ts,tsx}',
  ];
  return tseslint.config(
    { ignores: sharedIgnores },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
      files: ['**/*.mjs'],
      languageOptions: { globals: globals.node },
    },
    {
      files: ['**/*.{ts,tsx,mts,cts}'],
      languageOptions: { parser: tseslint.parser },
      plugins: { 'eslint-comments': eslintComments },
      rules: {
        '@typescript-eslint/no-explicit-any': 'error',
        '@typescript-eslint/ban-ts-comment': [
          'error',
          {
            'ts-expect-error': 'allow-with-description',
            'ts-ignore': true,
            'ts-nocheck': true,
            'ts-check': false,
            minimumDescriptionLength: 10,
          },
        ],
        '@typescript-eslint/consistent-type-imports': 'error',
        '@typescript-eslint/no-import-type-side-effects': 'error',
        'eslint-comments/require-description': 'error',
        'eslint-comments/disable-enable-pair': [
          'error',
          { allowWholeFile: false },
        ],
        'eslint-comments/no-use': [
          'error',
          { allow: ['eslint-disable-next-line'] },
        ],
      },
    },
    {
      files: productionFiles,
      ignores: testGlobs,
      languageOptions: {
        parserOptions: { projectService: true, tsconfigRootDir: rootDirectory },
      },
      rules: {
        '@typescript-eslint/no-unsafe-assignment': 'error',
        '@typescript-eslint/no-unsafe-argument': 'error',
        '@typescript-eslint/no-unsafe-member-access': 'error',
        '@typescript-eslint/no-unsafe-call': 'error',
        '@typescript-eslint/no-unsafe-return': 'error',
      },
    },
    { linterOptions: { reportUnusedDisableDirectives: 'error' } },
  );
}

export default createQualityConfig(import.meta.dirname);
