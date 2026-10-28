import { spawn } from 'node:child_process';
import electron from 'electron';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const child = spawn(electron, [root], { stdio: 'inherit', env: process.env });
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
