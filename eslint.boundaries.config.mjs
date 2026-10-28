/**
 * Архитектурный проход ESLint: границы ADR-001. Запускается с --no-inline-config
 * и без type-information, поэтому директива в коде не может снять запрет.
 */
import tseslint from 'typescript-eslint';
import { sourceExtensions } from './eslint/boundaries.config.mjs';
import boundaries from './eslint/boundaries-plugin.mjs';
import desktopIpc from './eslint/desktop-ipc-rule.mjs';
import { sharedIgnores } from './eslint/ignores.mjs';

export default [
  { ignores: sharedIgnores },
  {
    files: ['apps/desktop/src/**/*.{ts,tsx,mjs}'],
    plugins: { desktop: { rules: { ipc: desktopIpc } } },
    rules: { 'desktop/ipc': 'error' },
  },
  {
    files: [`**/*.{${sourceExtensions.join(',')}}`],
    plugins: { boundaries },
    rules: {
      'boundaries/dependency': 'error',
      'boundaries/external': 'error',
      'boundaries/bypass': 'error',
    },
  },
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    languageOptions: { parser: tseslint.parser },
  },
];
