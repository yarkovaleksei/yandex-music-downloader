import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);

const unitModules = {
  'URL parser': [
    'packages/providers/yandex-music/src/url/resolve-yandex-music-url.test.ts',
  ],
  sanitizer: ['packages/core/filesystem/src/sanitize.test.ts'],
  'path generator': [
    'packages/core/filesystem/src/layout.test.ts',
    'packages/core/filesystem/src/part-path.test.ts',
  ],
  'quality resolver': ['packages/core/planner/src/quality.test.ts'],
  planner: ['packages/core/planner/src/plan.test.ts'],
  'state machine': ['packages/core/downloader/src/state/transitions.test.ts'],
  'retry policy': [
    'packages/core/retry/src/classify.test.ts',
    'packages/core/retry/src/decide.test.ts',
    'packages/core/retry/src/backoff.test.ts',
  ],
  manifest: [
    'packages/core/manifest/src/recovery.test.ts',
    'packages/persistence/src/file-manifest-store.test.ts',
  ],
  'provider mapping': [
    'packages/providers/yandex-music/src/metadata/metadata.test.ts',
    'packages/providers/yandex-music/src/audio/audio.test.ts',
  ],
};

const scenarios = [
  ['single track', 'packages/application/src/headless.integration.test.ts'],
  ['album', 'packages/application/src/headless.integration.test.ts'],
  ['playlist', 'packages/application/src/headless.integration.test.ts'],
  [
    'network interruption',
    'packages/application/src/headless.integration.test.ts',
  ],
  ['resume', 'packages/application/src/headless.integration.test.ts'],
  ['retry', 'packages/application/src/headless.integration.test.ts'],
  ['partial failure', 'packages/application/src/headless.integration.test.ts'],
  ['cancel', 'packages/application/src/headless.integration.test.ts'],
];
const cliProof = [
  'CLI crash resume',
  'apps/cli/src/headless.integration.test.ts',
];

async function requireNonEmpty(relative) {
  const target = path.join(root, relative);
  await access(target);
  const text = await readFile(target, 'utf8');
  if (!/\bit\s*\(/u.test(text) && !/\bit\.each\s*\(/u.test(text))
    throw new Error(`${relative} не содержит test case.`);
  return text;
}

const failures = [];
for (const [module, files] of Object.entries(unitModules)) {
  try {
    await Promise.all(files.map(requireNonEmpty));
  } catch (error) {
    failures.push(
      `${module}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
/** Inventory проверяет реальные декларации cases и значения it.each.
 * Это проверка полноты списка; её результат не заменяет запуск suites через Vitest. */
function hasScenario(text, scenario) {
  const directTitles = [
    ...text.matchAll(/\bit\s*\(\s*(['"])([^'"\r\n]*)\1\s*,/gu),
  ].map((match) => match[2]);
  if (directTitles.some((title) => title.startsWith(scenario))) return true;
  const kind = scenario === 'single track' ? 'track' : scenario;
  return [
    ...text.matchAll(
      /\bit\.each\s*\(\s*\[([^\]]+)\]\s*(?:as const)?\s*\)\s*\(\s*(['"])([^'"\r\n]*)\2\s*,/gu,
    ),
  ].some(
    (match) =>
      match[3].includes(scenario) &&
      [...match[1].matchAll(/['"]([^'"]+)['"]/gu)].some(
        (value) => value[1] === kind,
      ),
  );
}

for (const [scenario, file] of [...scenarios, cliProof]) {
  try {
    const text = await requireNonEmpty(file);
    if (!hasScenario(text, scenario))
      throw new Error(`${file} не содержит case «${scenario}».`);
  } catch (error) {
    failures.push(
      `${scenario}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

if (failures.length > 0) {
  console.error('STEP-026 coverage не подтвержден:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    'STEP-026 coverage: 9 unit-модулей, 8 сценариев и CLI process proof подтверждены.',
  );
}
