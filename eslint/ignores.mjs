/** Общие ignores обоих ESLint-проходов: артефакты, кеши Yarn и каталоги Harness. */
export const sharedIgnores = [
  '**/dist/**',
  '**/coverage/**',
  '**/node_modules/**',
  '.cache/**',
  '.yarn/**',
  '.harness/**',
  '.agents/**',
  '.claude/**',
  '.codex/**',
  'planning/**',
  'docs/**',
];
