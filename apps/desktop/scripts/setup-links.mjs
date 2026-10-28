import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  symlinkSync,
} from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '../../..');
const target = path.join(root, 'node_modules/@music-downloader');
mkdirSync(target, { recursive: true });
for (const folder of [
  'apps',
  'packages',
  'packages/core',
  'packages/providers',
]) {
  for (const entry of readdirSync(path.join(root, folder), {
    withFileTypes: true,
  })) {
    const location = path.join(root, folder, entry.name);
    if (
      !entry.isDirectory() ||
      !existsSync(path.join(location, 'package.json'))
    )
      continue;
    const data = JSON.parse(
      readFileSync(path.join(location, 'package.json'), 'utf8'),
    );
    if (!data.name?.startsWith('@music-downloader/')) continue;
    const link = path.join(target, data.name.split('/')[1]);
    if (!existsSync(link))
      symlinkSync(
        location,
        link,
        process.platform === 'win32' ? 'junction' : 'dir',
      );
  }
}
