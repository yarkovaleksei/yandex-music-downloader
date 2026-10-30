/** Общие ignores обоих ESLint-проходов: артефакты, кеши Yarn и локальные настройки агентов. */
export const sharedIgnores = [
  '**/dist/**',
  '**/coverage/**',
  '**/node_modules/**',
  '.cache/**',
  '.yarn/**',
  '.agents/**',
  '.claude/**',
  '.codex/**',
  'docs/**',
];
