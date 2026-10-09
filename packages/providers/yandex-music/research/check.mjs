/** Минимальные проверки исследовательского кода; @link ../../../../planning/tasks/STEP-005.md. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  projectEvidence,
  failureEvidence,
  probePermission,
  identifyContainer,
} from './spike.mjs';

const root = resolve(import.meta.dirname, '../../../..');

function selfCheck() {
  const secret = ['synthetic', 'credential'].join('-').repeat(3);
  const url = `https://example.invalid/get-mp3/${secret}?sign=${secret}`;
  const projected = projectEvidence({
    phase: 'auth',
    status: 'confirmed',
    accountConfirmed: true,
    token: secret,
    cookies: secret,
    Authorization: secret,
    key: secret,
    url,
    codec: secret,
    reason: secret,
    trackId: secret,
    contentRange: secret,
  });
  assert.deepEqual(projected, {
    phase: 'auth',
    status: 'confirmed',
    accountConfirmed: true,
  });
  const failure = failureEvidence(
    Object.assign(new Error(url), { name: secret, cause: { token: secret } }),
    'auth',
  );
  assert.equal(JSON.stringify(failure).includes(secret), false);
  assert.equal(probePermission({ available: true }, { preview: false }), null);
  assert.equal(
    probePermission({ available: true }, { preview: true }),
    'preview',
  );
  assert.equal(
    probePermission({ available: false }, { preview: false }),
    'unavailable',
  );
  assert.equal(probePermission({ available: true }, {}), 'ambiguous');
  assert.equal(identifyContainer(Buffer.from('fLaC')), 'flac');
  assert.equal(identifyContainer(Buffer.from('ID3')), 'mp3');
  assert.equal(identifyContainer(Buffer.from('not audio')), 'unknown');
  console.log(
    'SELF-CHECK: PASS (редакция ошибок/вывода, доступ/preview, сигнатуры)',
  );
}

async function checkArtifacts() {
  const files = execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    { cwd: root, encoding: 'utf8' },
  )
    .split('\0')
    .filter(Boolean);
  // Печатаются только имена файлов: совпадение может содержать настоящий секрет.
  const patterns = [
    /(?:Bearer|OAuth)\s+[A-Za-z0-9_-]{24,}/,
    /\by0_[A-Za-z0-9_-]{24,}/,
    /https?:\/\/[^\s"'<>]+\/get-mp3\/[a-f0-9]{32}\//i,
    /https?:\/\/[^\s"'<>]+[?&](?:sign|signature|token|secret|hmac)=[A-Za-z0-9%_-]{12,}/i,
    /(?:access[_-]?token|refresh[_-]?token|client[_-]?secret|device[_-]?code|"key")\s*[=:]\s*["'][A-Za-z0-9_-]{24,}["']/i,
  ];
  const failures = [];
  for (const file of files) {
    const content = await readFile(resolve(root, file)).catch(() => null);
    if (!content || content.includes(0)) continue;
    const text = content.toString('utf8');
    if (patterns.some((pattern) => pattern.test(text))) failures.push(file);
  }
  if (failures.length) {
    console.error(`ARTIFACTS: FAIL (${failures.join(', ')})`);
    process.exitCode = 1;
    return;
  }
  const report = await readFile(
    resolve(root, 'docs/research/yandex-api-spike.md'),
    'utf8',
  );
  for (const heading of [
    '## Воспроизводимость',
    '## Авторизация',
    '## Варианты аудио',
    '## Range',
    '## Signed URL',
    '## Rate limits',
    '## Ограничения',
  ])
    assert.ok(
      report.includes(heading),
      'Отсутствует обязательный раздел отчёта',
    );
  const provider = JSON.parse(
    await readFile(
      resolve(root, 'packages/providers/yandex-music/package.json'),
      'utf8',
    ),
  );
  assert.equal(provider.dependencies['@dvxch/yandex-music'], '0.3.0');
  assert.equal(JSON.stringify(provider.exports).includes('research'), false);
  const config = JSON.parse(
    await readFile(
      resolve(root, 'packages/providers/yandex-music/tsconfig.json'),
      'utf8',
    ),
  );
  assert.deepEqual(config.include, ['src/**/*.ts']);
  for (const file of files.filter(
    (f) =>
      f.endsWith('package.json') &&
      (f.startsWith('apps/') || f.startsWith('packages/')) &&
      f !== 'packages/providers/yandex-music/package.json',
  )) {
    assert.equal(
      (await readFile(resolve(root, file), 'utf8')).includes(
        '"@dvxch/yandex-music"',
      ),
      false,
      'Dependency вне provider',
    );
  }
  console.log(
    `ARTIFACTS: PASS (${files.length} файлов; шаблоны секретов, отчёт, dependency/exports/build)`,
  );
}

try {
  if (process.argv.length === 3 && process.argv[2] === '--self-check')
    selfCheck();
  else if (process.argv.length === 3 && process.argv[2] === '--check-artifacts')
    await checkArtifacts();
  else {
    console.error(
      'Использование: node research/check.mjs --self-check|--check-artifacts',
    );
    process.exitCode = 1;
  }
} catch {
  console.error('CHECK: FAIL (значения ошибки скрыты)');
  process.exitCode = 1;
}
