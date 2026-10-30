import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { readDocuments, root, saveProjection } from './projection.mjs';

try {
  const documents = await readDocuments('architecture-decisions', 'ADR');
  const byId = new Map(documents.map((document) => [document.id, document]));
  const link = (id) => {
    const target = byId.get(id);
    if (!target) throw new Error(`Не найден документ замещения ${id}`);
    return `[${id}](${target.name})`;
  };
  const rows = documents.map((document) => {
    const details = [document.status];
    if (document.supersedes.length)
      details.push(`заменяет ${document.supersedes.map(link).join(', ')}`);
    if (document.supersededBy.length)
      details.push(`заменён ${document.supersededBy.map(link).join(', ')}`);
    return `- [${document.id}](${document.name}) — ${document.title} (${details.join('; ')})`;
  });
  const relativePath = 'docs/architecture-decisions/README.md';
  const original = await readFile(path.join(root, relativePath), 'utf8');
  const heading = /^## (?:Index|Оглавление)[ \t]*\r?$/m.exec(original);
  if (!heading) throw new Error('В README ADR не найден раздел оглавления');
  // Заменяется только раздел оглавления; правила и следующие разделы сохраняются.
  const start = heading.index;
  const following = original.slice(start + heading[0].length);
  const nextHeading = /\r?\n## /.exec(following);
  const suffix = nextHeading ? following.slice(nextHeading.index).trimStart() : '';
  const section = [
    '## Оглавление',
    '',
    '> Раздел собран автоматически командой `node scripts/docs/generate-adr.mjs`. Названия, статусы и связи замещения изменяются в документах ADR.',
    '',
    ...rows,
    '',
  ].join('\n');
  const content = original.slice(0, start) + section + (suffix ? `\n${suffix}` : '');
  await saveProjection(relativePath, content, documents.length);
} catch (error) {
  console.error(`Не удалось собрать оглавление ADR: ${error.message}`);
  process.exitCode = 1;
}
