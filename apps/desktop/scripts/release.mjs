import { parseArgs } from 'node:util';
import {
  createReleaseOperations,
  ReleaseError,
} from '../packaging/release-operations.mjs';

/** @link docs/development.md Подготовка локальна; только publish отправляет тег и изменяет GitHub Releases. */
try {
  const { values, positionals } = parseArgs({
    options: { version: { type: 'string' }, notes: { type: 'string' } },
    allowPositionals: true,
  });
  const [command] = positionals;
  if (
    positionals.length !== 1 ||
    !['plan', 'prepare', 'publish'].includes(command) ||
    (command !== 'prepare' && values.notes)
  )
    throw new ReleaseError(
      'Команды: release plan [--version 0.2.0], release prepare --version 0.2.0 --notes <файл>, release publish --version 0.2.0.',
    );
  const release = createReleaseOperations();
  const result =
    command === 'prepare'
      ? await release.prepare(values.version, values.notes)
      : await release[command](values.version);
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(
    error instanceof ReleaseError
      ? error.message
      : 'Выпуск остановлен. Проверьте параметры, GitHub CLI, локальный комплект и доступ к системному хранилищу.',
  );
  process.exitCode = 1;
}
