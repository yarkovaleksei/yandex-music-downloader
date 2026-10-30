import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { versionFromTag, supports, stage, binaryTarget } from './lib.mjs';

//  Эти отказы защищают контракт target/version, а не повторяют список настроек builder.
test('Тег версии не принимает пути, shell text и некорректную версию', () => {
  assert.equal(versionFromTag('v1.2.3'), '1.2.3');
  for (const tag of ['v01.2.3', '../v1.2.3', 'v1.2.3;id', '1.2.3', 'v1.2'])
    assert.throws(() => versionFromTag(tag));
});
test('Optional package другой ОС исключается, отрицательные ограничения сохраняются', () => {
  assert.equal(
    supports({ os: ['darwin'], cpu: ['arm64'] }, 'linux', 'x64'),
    false,
  );
  assert.equal(supports({ os: ['!win32'] }, 'darwin', 'x64'), true);
  assert.equal(supports({ os: ['!win32'] }, 'win32', 'x64'), false);
});
test('Архитектура native читается из заголовка, а не имени файла', () => {
  const wrong = Buffer.alloc(64);
  wrong.writeUInt32LE(0xfeedfacf, 0);
  wrong.writeUInt32LE(0x100000c, 4);
  assert.equal(binaryTarget(wrong), 'darwin-arm64');
  assert.notEqual(binaryTarget(wrong), 'darwin-x64');
  assert.throws(() => binaryTarget(Buffer.alloc(64)));
});
test('Неполная production closure не получает успешный staging', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'packaging-contract-'));
  try {
    const source = path.join(directory, 'repository');
    await mkdir(path.join(source, 'apps/desktop/dist'), { recursive: true });
    await writeFile(
      path.join(source, 'apps/desktop/package.json'),
      JSON.stringify({
        dependencies: { 'missing-package-for-packaging-proof': '1.0.0' },
      }),
    );
    await assert.rejects(
      stage('linux-x64', path.join(directory, 'stage'), '0.0.0', source),
      /Не найдена обязательная production dependency/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('Разные версии dependency сохраняют Node resolution, прямой импорт не подменяется транзитивным', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'packaging-versions-'));
  try {
    const source = path.join(directory, 'repository');
    const write = async (relative, value) => {
      const file = path.join(source, relative, 'package.json');
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, JSON.stringify(value));
    };
    await mkdir(path.join(source, 'apps/desktop/dist'), { recursive: true });
    await write('apps/desktop', {
      dependencies: { left: '1.0.0', zod: '4.0.0' },
    });
    await write('node_modules/left', {
      name: 'left',
      version: '1.0.0',
      dependencies: { zod: '3.0.0' },
    });
    await write('node_modules/left/node_modules/zod', {
      name: 'zod',
      version: '3.0.0',
    });
    await write('node_modules/zod', { name: 'zod', version: '4.0.0' });
    const destination = path.join(directory, 'stage');
    await stage('linux-x64', destination, '0.0.0', source);
    const version = async (relative) =>
      JSON.parse(
        await readFile(
          path.join(destination, relative, 'package.json'),
          'utf8',
        ),
      ).version;
    assert.equal(await version('node_modules/zod'), '4.0.0');
    assert.equal(await version('node_modules/left/node_modules/zod'), '3.0.0');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
