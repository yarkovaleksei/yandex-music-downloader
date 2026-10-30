import { readDocuments, saveProjection, tableCell } from './projection.mjs';

try {
  const documents = await readDocuments('open-questions', 'OQ');
  // Вопросы и статусы берутся из отдельных OQ; пути локальны к каталогу README.
  const lines = [
    '# Открытые вопросы',
    '',
    '> Оглавление собрано автоматически командой `node scripts/docs/generate-oq.mjs`. Названия и статусы изменяются в документах OQ; условия и решения приведены там же.',
    '',
    '| OQ | Статус | Вопрос |',
    '| --- | --- | --- |',
    ...documents.map((document) =>
      `| [${document.id}](${document.name}) | ${tableCell(document.status)} | ${tableCell(document.title)} |`,
    ),
    '',
    '## Статусы',
    '',
    '`open` — вопрос остаётся открытым; `resolved` — решение записано; `deferred` — исследование отложено.',
    '',
  ];
  await saveProjection('docs/open-questions/README.md', lines.join('\n'), documents.length);
} catch (error) {
  console.error(`Не удалось собрать оглавление OQ: ${error.message}`);
  process.exitCode = 1;
}
