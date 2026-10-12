import { appendFileSync } from 'node:fs';
import {
  normalizeDomainError,
  ValidationError,
} from '@music-downloader/shared';

/**
 * Явный файл host-а получает ту же отредактированную строку, что и stderr.
 * Descriptor не удерживается: это упрощает shutdown и не задаёт политику ротации.
 */
export function createFileSink(filePath: string): (record: string) => void {
  if (filePath.trim().length === 0) throw new ValidationError();
  try {
    // Проверка готовности намеренно не создаёт родительские каталоги host-а.
    appendFileSync(filePath, '', { encoding: 'utf8', flag: 'a' });
  } catch (error) {
    throw normalizeDomainError(error);
  }

  return (record) => {
    const line = `${record}\n`;
    try {
      process.stderr.write(line);
      appendFileSync(filePath, line, { encoding: 'utf8', flag: 'a' });
    } catch (error) {
      // Причина и путь остаются вне DTO; классификация следует общей таблице ошибок.
      throw normalizeDomainError(error);
    }
  };
}
