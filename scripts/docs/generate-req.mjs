import { readDocuments, saveProjection, tableCell } from './projection.mjs';

try {
  const documents = await readDocuments('requirements', 'REQ');
  // Название и приоритет берутся из REQ; отдельного ручного списка требований нет.
  const lines = [
    '# Требования проекта',
    '',
    '> Оглавление собрано автоматически командой `node scripts/docs/generate-req.mjs`. Названия и приоритеты изменяются в документах REQ.',
    '',
    '| REQ | Название | Приоритет |',
    '| --- | --- | --- |',
    ...documents.map((document) =>
      `| [${document.id}](${document.name}) | ${tableCell(document.title)} | ${tableCell(document.priority)} |`,
    ),
    '',
  ];
  await saveProjection('docs/requirements/README.md', lines.join('\n'), documents.length);
} catch (error) {
  console.error(`Не удалось собрать оглавление REQ: ${error.message}`);
  process.exitCode = 1;
}
