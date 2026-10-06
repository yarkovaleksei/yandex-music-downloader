import type { ESLint } from 'eslint';

export function classify(relativePath: string): {
  group: string | null;
  dir: string | null;
};

declare const plugin: ESLint.Plugin;
export default plugin;
