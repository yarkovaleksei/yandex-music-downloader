import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Пути зависят от расположения скрипта, поэтому генерация работает из любого каталога.
export const root = fileURLToPath(new URL('../../', import.meta.url));

function scalar(value) {
  const text = value.trim();
  if (text.startsWith('"') && text.endsWith('"')) return JSON.parse(text);
  if (text.startsWith("'") && text.endsWith("'"))
    return text.slice(1, -1).replaceAll("''", "'");
  return text;
}

// Читаются только используемые поля существующего frontmatter: строки и списки ID.
// Остальные метаданные остаются в исходных документах и не влияют на оглавление.
function field(metadata, key, required = true) {
  const match = metadata.match(new RegExp(`^${key}:[ \t]*(.*)$`, 'm'));
  if (!match || !match[1].trim()) {
    if (required) throw new Error(`Не заполнено поле ${key}`);
    return null;
  }
  return scalar(match[1]);
}

function references(metadata, key) {
  const match = metadata.match(
    new RegExp(`^${key}:[ \t]*([^\n]*)(?:\n((?:[ \t]+-[^\n]*(?:\n|$))*))?`, 'm'),
  );
  if (!match) return [];
  const inline = match[1].trim();
  let values;
  if (inline.startsWith('[') && inline.endsWith(']')) {
    const content = inline.slice(1, -1).trim();
    values = content ? content.split(',').map(scalar) : [];
  } else if (inline) {
    throw new Error(`Поле ${key} должно быть списком ID`);
  } else {
    values = [...(match[2] ?? '').matchAll(/^[ \t]+-[ \t]+(.+)$/gm)]
      .map((entry) => scalar(entry[1]));
  }
  if (values.some((id) => !/^ADR-\d{3}$/.test(id)))
    throw new Error(`Поле ${key} содержит некорректный ID ADR`);
  return [...new Set(values)].sort();
}

export async function readDocuments(folder, prefix) {
  const directory = path.join(root, 'docs', folder);
  const names = (await readdir(directory))
    .filter((name) => new RegExp(`^${prefix}-\\d{3}-.+\\.md$`).test(name))
    .sort();
  if (!names.length) throw new Error(`Документы ${prefix} не найдены`);
  const documents = [];
  const ids = new Set();
  for (const name of names) {
    try {
      const content = (await readFile(path.join(directory, name), 'utf8'))
        .replaceAll('\r\n', '\n');
      const header = content.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
      if (!header) throw new Error('Не найден frontmatter');
      const metadata = header[1];
      const id = field(metadata, 'id');
      if (id !== name.slice(0, prefix.length + 4)) throw new Error('ID не совпадает с именем файла');
      if (ids.has(id)) throw new Error(`Повторный ID ${id}`);
      const heading = content.slice(header[0].length)
        .match(new RegExp(`^# ${id} — (.+)$`, 'm'));
      if (!heading) throw new Error('Не найден заголовок с ID и названием');
      const document = { id, name, title: heading[1].trim() };
      if (prefix === 'REQ') document.priority = field(metadata, 'priority');
      else {
        document.status = field(metadata, 'status');
        if (prefix === 'ADR') {
          document.supersedes = references(metadata, 'supersedes');
          document.supersededBy = references(metadata, 'superseded_by');
        }
      }
      ids.add(id);
      documents.push(document);
    } catch (error) {
      throw new Error(`${name}: ${error.message}`);
    }
  }
  return documents;
}

// Запись выполняется после чтения всего набора: ошибка метаданных не обрезает проекцию.
export async function saveProjection(relativePath, content, count) {
  const destination = path.join(root, relativePath);
  let previous;
  try {
    previous = await readFile(destination, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (previous !== content) await writeFile(destination, content);
  console.info(`${relativePath}: собрано документов — ${count}`);
}

export function tableCell(value) {
  return value.replaceAll('|', '\\|');
}
