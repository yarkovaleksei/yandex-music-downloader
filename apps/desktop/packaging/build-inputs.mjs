import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { sha } from './lib.mjs';

/** прошлый N проверяется по сохранённым bytes, включая dist и native dependencies. */
export async function captureBuildInputs(manifestFile, source, snapshot) {
  const bytes = await readFile(manifestFile);
  const manifest = JSON.parse(bytes);
  for (const [relative, expected] of Object.entries(manifest.inputs)) {
    const content = await readFile(path.join(source, relative));
    assert.equal(sha(content), expected, `Устаревший input: ${relative}`);
    const destination = path.join(snapshot, relative);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, content, { flag: 'wx' });
  }
  await writeFile(
    path.join(snapshot, '.input-snapshot.json'),
    JSON.stringify({ schema: 1, manifestSha256: sha(bytes) }) + '\n',
    { flag: 'wx' },
  );
}

/** Снимок связан с точным manifest; изменение snapshot не отключает проверку каждого input hash. */
export async function validateBuildInputs(manifestFile, source, snapshot) {
  const bytes = await readFile(manifestFile);
  const manifest = JSON.parse(bytes);
  if (snapshot) {
    const metadata = JSON.parse(
      await readFile(path.join(snapshot, '.input-snapshot.json')),
    );
    assert.equal(metadata.schema, 1);
    assert.equal(metadata.manifestSha256, sha(bytes));
  }
  for (const [relative, expected] of Object.entries(manifest.inputs))
    assert.equal(
      sha(await readFile(path.join(snapshot ?? source, relative))),
      expected,
      `Устаревший input: ${relative}`,
    );
}
