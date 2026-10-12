#!/usr/bin/env node
/** Публичная метка сохраняется для bootstrap-проверки пакета. */
export const cliPackage = '@music-downloader/cli';

import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { runCli } from './runner.js';

/** pathToFileURL/realpath сохраняют запуск bin на Windows, с пробелами и через symlink. */
function isEntrypoint(): boolean {
  if (process.argv[1] === undefined) return false;
  try {
    return (
      import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href
    );
  } catch {
    return false;
  }
}

if (isEntrypoint()) {
  void runCli().then((code) => {
    process.exitCode = code;
  });
}
