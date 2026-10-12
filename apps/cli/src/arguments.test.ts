import { describe, expect, it } from 'vitest';
import { parseArguments, UsageError } from './arguments.js';

describe('аргументы CLI', () => {
  it.each([
    ['auth', ['auth']],
    ['account', ['account']],
    ['logout', ['logout']],
    ['jobs', ['jobs']],
    ['download', ['download', 'https://music.yandex.ru/track/1']],
    ['track', ['track', 'https://music.yandex.ru/track/1']],
    ['album', ['album', 'https://music.yandex.ru/album/1']],
    ['playlist', ['playlist', 'https://music.yandex.ru/users/u/playlists/1']],
    ['resume', ['resume', 'job']],
    ['retry', ['retry', 'job']],
    ['cancel', ['cancel', 'job']],
  ])('принимает команду %s', (_name, argv) =>
    expect(parseArguments(argv)).toMatchObject({ command: argv[0] }),
  );

  it.each([
    { argv: [] },
    { argv: ['doctor'] },
    { argv: ['download'] },
    { argv: ['auth', 'лишнее'] },
    { argv: ['resume'] },
    { argv: ['jobs', '--output', '/tmp'] },
    { argv: ['auth', '--quality', 'best'] },
    { argv: ['jobs', '--concurrency', '2'] },
    { argv: ['download', 'u', '--quality', 'bad'] },
    { argv: ['download', 'u', '--concurrency', '0'] },
    { argv: ['download', 'u', '--concurrency', '9'] },
    { argv: ['download', 'u', '--concurrency', '1.5'] },
    { argv: ['download', 'u', '--overwrite', '--skip-existing'] },
    { argv: ['download', 'u', '--unknown'] },
  ])('отклоняет некорректный вызов $argv', ({ argv }) =>
    expect(() => parseArguments(argv)).toThrow(UsageError),
  );

  it('сохраняет разрешённые флаги', () => {
    expect(
      parseArguments([
        'download',
        'u',
        '--output',
        '/music',
        '--quality',
        'lossless',
        '--concurrency',
        '8',
        '--overwrite',
        '--json',
        '--log-level',
        'debug',
        '--log-file',
        '/tmp/log',
        '--debug',
      ]),
    ).toMatchObject({
      command: 'download',
      output: '/music',
      quality: 'lossless',
      concurrency: 8,
      overwrite: true,
      json: true,
      logLevel: 'debug',
      logFile: '/tmp/log',
      debug: true,
    });
  });
});
