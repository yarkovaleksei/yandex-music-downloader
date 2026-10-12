import { execFile, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { beforeAll, describe, expect, it } from 'vitest';

const execute = promisify(execFile);
describe('собранный bin', () => {
  beforeAll(async () => {
    // Vitest подменяет import.meta, поэтому разрешаем TypeScript в обычном Node-процессе.
    // Это сохраняет сборку bin без запрещённого createRequire (@link planning/tasks/STEP-047.md).
    const compiler = await execute(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        "process.stdout.write(import.meta.resolve('typescript/bin/tsc'));",
      ],
      {
        cwd: fileURLToPath(new URL('../../../', import.meta.url)),
        timeout: 30_000,
      },
    );
    const compilerPath = fileURLToPath(compiler.stdout);
    await execute(
      process.execPath,
      [compilerPath, '-b', 'apps/cli/tsconfig.json'],
      {
        cwd: fileURLToPath(new URL('../../../', import.meta.url)),
        timeout: 30_000,
      },
    );
  }, 35_000);
  it('показывает help и usage без application bootstrap', async () => {
    const bin = new URL('../dist/index.js', import.meta.url);
    const binPath = fileURLToPath(bin);
    const result = await execute(process.execPath, [binPath, '--help']);
    expect(result.stdout).toContain('music-downloader');
    await expect(
      execute(process.execPath, [binPath, 'doctor']),
    ).rejects.toMatchObject({ code: 2 });
  });
  it('не пишет human help в stdout при --help --json', async () => {
    const binPath = fileURLToPath(new URL('../dist/index.js', import.meta.url));
    const result = await execute(process.execPath, [binPath, '--help', '--json']);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('music-downloader');
  });
  it('прерывает ожидающий auth сигналом без успешного результата', async () => {
    const runner = new URL('../dist/runner.js', import.meta.url).href;
    const child = spawn(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        `import { runCli } from ${JSON.stringify(runner)};
const api = {
  authenticate: async () => {
    process.stdout.write('AUTH_WAIT\\n');
    setTimeout(() => undefined, 10_000);
    await new Promise(() => undefined);
  },
  shutdown: async () => ({ schemaVersion: 1, kind: 'result', command: 'shutdown', data: null }),
};
void runCli({
  argv: ['auth', '--json'], env: {}, homedir: () => '/tmp',
  stdout: (line) => process.stdout.write(line + '\\n'),
  stderr: (line) => process.stderr.write(line + '\\n'),
  signals: process, createApplication: () => api,
}).then((code) => {
  process.stdout.write('AUTH_RESULT:' + code + '\\n');
  process.exitCode = code;
});`,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    const output = await waitForOutput(child, 'AUTH_WAIT');
    const signal = process.platform === 'win32' ? 'SIGTERM' : 'SIGINT';
    const exited = waitForExit(child);
    child.kill(signal);
    const result = await exited;

    expect(output).toContain('AUTH_WAIT');
    expect(result.code).not.toBe(0);
    expect(result.signal).toBe(signal);
  }, 10_000);
});

function waitForOutput(
  child: ReturnType<typeof spawn>,
  expected: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    let output = '';
    const stdout = child.stdout;
    if (stdout === null) {
      reject(new Error('Не удалось получить stdout дочернего auth.'));
      return;
    }
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`Не дождались ${expected} от auth.`));
    }, 3_000);
    stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString();
      if (output.includes(expected)) {
        clearTimeout(timeout);
        resolve(output);
      }
    });
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once('exit', (code, signal) => {
      if (!output.includes(expected)) {
        clearTimeout(timeout);
        reject(new Error(`auth завершился до готовности: ${code}/${signal}`));
      }
    });
  });
}

function waitForExit(
  child: ReturnType<typeof spawn>,
): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('auth не завершился после сигнала.'));
    }, 3_000);
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once('exit', (code, signal) => {
      clearTimeout(timeout);
      resolve({ code, signal });
    });
  });
}
