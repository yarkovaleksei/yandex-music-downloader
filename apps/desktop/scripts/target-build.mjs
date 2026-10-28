import { spawnSync } from 'node:child_process';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '../../..');
// Те же две команды, что canonical build, но без установленного Yarn в evidence-наборе.
for (const file of [
  'node_modules/typescript/bin/tsc',
  'apps/desktop/scripts/build.mjs',
]) {
  const result = spawnSync(
    process.execPath,
    [path.join(root, file), ...(file.endsWith('/tsc') ? ['-b'] : [])],
    { cwd: root, stdio: 'inherit' },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}
