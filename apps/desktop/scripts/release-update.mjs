import { readFile, writeFile } from 'node:fs/promises';
import { initializeKey, signDescriptor } from '../packaging/release-key.mjs';

/** Собственная подпись бесплатна; команда не принимает приватный ключ файлом или аргументом. */
try {
  if (process.platform !== 'linux') throw new Error('Требуется Linux');
  const args = process.argv.slice(2);
  if (
    !(args.length === 1 && args[0] === 'init-key') &&
    !(args.length === 2 && args[0] === 'sign')
  )
    throw new Error('Неверная команда');
  // Сборочный адаптер использует системный keyring напрямую, без импорта доменного persistence.
  const { Entry } = await import('@napi-rs/keyring');
  const entry = new Entry(
    'music-downloader.release.update-signing',
    'current-user',
    { linux: { store: 'secret-service' } },
  );
  if (args[0] === 'init-key') console.log(initializeKey(entry));
  else {
    const bytes = await readFile(args[1]);
    const { descriptorSchema } = await import('../dist/main/update/service.js');
    descriptorSchema.parse(JSON.parse(bytes.toString('utf8')));
    await writeFile(args[1] + '.sig', signDescriptor(entry, bytes));
    console.log(
      'Описание релиза подписано. Приватный ключ остался в системном хранилище.',
    );
  }
} catch {
  // Native exception может содержать детали хранилища: не выводим её или ключ в журнал.
  console.error(
    'Подпись недоступна. Проверьте команду, описание релиза и доступ к системному хранилищу Linux.',
  );
  process.exitCode = 1;
}
