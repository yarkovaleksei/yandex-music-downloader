import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import {
  readFile,
  writeFile,
  mkdir,
  mkdtemp,
  rm,
  chmod,
} from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '../../..');
export const signingTool = {
  version: '0.29.0',
  archive: 'apple-codesign-0.29.0-x86_64-unknown-linux-musl.tar.gz',
  sha256: 'dbe85cedd8ee4217b64e9a0e4c2aef92ab8bcaaa41f20bde99781ff02e600002',
};
const digest = (b) => createHash('sha256').update(b).digest('hex');
const sentinel = Buffer.from('dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX');
const frameworkPath = (app) =>
  path.join(
    app,
    'Contents/Frameworks/Electron Framework.framework/Versions/A/Electron Framework',
  );

/** @link planning/tasks/STEP-054.md Проверяем реальные code pages, а не наличие LC_CODE_SIGNATURE.
 * Изменение fuses сохраняет старый CodeDirectory и приводит к отказу arm64 ещё до main.
 */
export function inspectSignature(bytes) {
  assert.equal(bytes.readUInt32LE(0), 0xfeedfacf, 'Ожидается Mach-O 64');
  const cpu = bytes.readUInt32LE(4);
  const result = {
    cpu,
    sha256: digest(bytes),
    directories: [],
    entitlements: null,
  };
  let cursor = 32;
  for (let i = 0; i < bytes.readUInt32LE(16); i++) {
    const command = bytes.readUInt32LE(cursor);
    const size = bytes.readUInt32LE(cursor + 4);
    assert(
      size >= 8 && cursor + size <= bytes.length,
      'Повреждён load command',
    );
    if (command === 0x1d) {
      const start = bytes.readUInt32LE(cursor + 8);
      assert.equal(bytes.readUInt32BE(start), 0xfade0cc0);
      const count = bytes.readUInt32BE(start + 8);
      for (let j = 0; j < count; j++) {
        const slot = bytes.readUInt32BE(start + 12 + j * 8);
        const pos = start + bytes.readUInt32BE(start + 16 + j * 8);
        const magic = bytes.readUInt32BE(pos);
        const length = bytes.readUInt32BE(pos + 4);
        assert(pos + length <= bytes.length, 'Повреждён signature blob');
        if (slot === 5 && magic === 0xfade7171)
          result.entitlements = bytes
            .subarray(pos + 8, pos + length)
            .toString();
        if (magic !== 0xfade0c02) continue;
        const hashOffset = bytes.readUInt32BE(pos + 16);
        const identifierOffset = bytes.readUInt32BE(pos + 20);
        const specialSlotCount = bytes.readUInt32BE(pos + 24);
        const pages = bytes.readUInt32BE(pos + 28);
        const limit = bytes.readUInt32BE(pos + 32);
        const hashSize = bytes[pos + 36];
        const hashType = bytes[pos + 37];
        const pageSize = 2 ** bytes[pos + 39];
        assert(
          [1, 2, 3].includes(hashType),
          'Неподдерживаемый CodeDirectory digest',
        );
        const mismatchedPages = [];
        for (let page = 0; page < pages; page++) {
          const actual = createHash(hashType === 1 ? 'sha1' : 'sha256')
            .update(
              bytes.subarray(
                page * pageSize,
                Math.min((page + 1) * pageSize, limit),
              ),
            )
            .digest()
            .subarray(0, hashSize);
          if (
            !actual.equals(
              bytes.subarray(
                pos + hashOffset + page * hashSize,
                pos + hashOffset + (page + 1) * hashSize,
              ),
            )
          )
            mismatchedPages.push(page);
        }
        result.directories.push({
          identifier: bytes
            .subarray(
              pos + identifierOffset,
              bytes.indexOf(0, pos + identifierOffset),
            )
            .toString(),
          flags: bytes.readUInt32BE(pos + 12),
          // Slot 3 связывает Mach-O с CodeResources; его отсутствие не означает повреждение code pages.
          resourceSealHash:
            specialSlotCount >= 3
              ? bytes
                  .subarray(
                    pos + hashOffset - 3 * hashSize,
                    pos + hashOffset - 2 * hashSize,
                  )
                  .toString('hex')
              : null,
          hashType,
          pageSize,
          pages,
          mismatchedPages,
        });
      }
    }
    cursor += size;
  }
  const fuseOffset = bytes.indexOf(sentinel);
  result.fuses =
    fuseOffset < 0
      ? null
      : bytes
          .subarray(fuseOffset, fuseOffset + sentinel.length + 16)
          .toString('hex');
  result.fusePage = fuseOffset < 0 ? null : Math.floor(fuseOffset / 4096);
  result.valid =
    result.directories.length > 0 &&
    result.directories.every((d) => d.mismatchedPages.length === 0);
  return result;
}

function run(command, args) {
  const p = spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });
  if (p.error || p.status !== 0)
    throw p.error ?? new Error(p.stderr || p.stdout);
  return p.stdout;
}
async function tool() {
  assert.equal(process.platform, 'linux');
  assert.equal(process.arch, 'x64');
  const directory = path.join(
    root,
    '.cache/desktop-packaging/tools/apple-codesign',
    signingTool.version,
  );
  const archive = path.join(directory, signingTool.archive);
  await mkdir(directory, { recursive: true });
  let bytes;
  try {
    bytes = await readFile(archive);
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
    const response = await fetch(
      `https://github.com/indygreg/apple-platform-rs/releases/download/apple-codesign/${signingTool.version}/${signingTool.archive}`,
    );
    assert(response.ok, `rcodesign HTTP ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(digest(bytes), signingTool.sha256);
    await writeFile(archive, bytes);
  }
  assert.equal(
    digest(bytes),
    signingTool.sha256,
    'Неверный SHA-256 build tool',
  );
  // Из закреплённого архива извлекается только executable; install scripts не выполняются.
  const member = signingTool.archive.replace('.tar.gz', '') + '/rcodesign';
  const extracted = spawnSync('tar', ['-xOf', archive, member], {
    maxBuffer: 100 * 1024 * 1024,
  });
  assert.equal(extracted.status, 0);
  const executable = path.join(directory, 'rcodesign');
  await writeFile(executable, extracted.stdout);
  await chmod(executable, 0o755);
  return executable;
}

/** Исправляется только framework с изменёнными fuses; main, ASAR и native payload не пересобираются.
 * Ad-hoc подпись не является Developer ID и не обещает доверия Gatekeeper.
 */
export async function repairArm64App(app) {
  assert.equal(process.platform, 'linux');
  const file = frameworkPath(app);
  const before = inspectSignature(await readFile(file));
  assert.equal(before.cpu, 0x100000c);
  assert(before.fuses, 'Нет Electron fuses');
  const asar = path.join(app, 'Contents/Resources/app.asar');
  const asarHash = digest(await readFile(asar));
  if (!before.valid) {
    assert(
      before.directories.length === 1,
      'Ожидается исходная ad-hoc подпись',
    );
    assert(
      before.directories[0].flags & 2,
      'Требуется ad-hoc, не Developer ID',
    );
    const scratch = await mkdtemp(path.join(os.tmpdir(), 'ymd-adhoc-'));
    try {
      const args = [
        'sign',
        '--config-file',
        '/dev/null',
        '--timestamp-url',
        'none',
        '--binary-identifier',
        before.directories[0].identifier,
      ];
      if (before.directories[0].flags & 0x20000)
        args.push('--code-signature-flags', 'linker-signed');
      if (before.entitlements) {
        const entitlements = path.join(scratch, 'entitlements.plist');
        await writeFile(entitlements, before.entitlements);
        args.push('--entitlements-xml-file', entitlements);
      }
      run(await tool(), [...args, file]);
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  }
  const after = inspectSignature(await readFile(file));
  assert(after.valid, 'CodeDirectory после ремонта повреждён');
  assert.equal(after.fuses, before.fuses, 'Fuses не должны измениться');
  assert.equal(
    after.entitlements,
    before.entitlements,
    'Entitlements не должны измениться',
  );
  assert.equal(
    digest(await readFile(asar)),
    asarHash,
    'ASAR payload не должен измениться',
  );
  return {
    tool: signingTool,
    before,
    after,
    asarHash,
    nativeLaunch: 'PENDING',
  };
}
export async function verifyArm64App(app) {
  const result = inspectSignature(await readFile(frameworkPath(app)));
  assert.equal(result.cpu, 0x100000c);
  assert(result.valid, 'Неверная arm64 CodeDirectory');
  assert(result.fuses, 'Нет Electron fuses');
  let resourceFilePresent = false;
  try {
    await readFile(
      path.join(
        path.dirname(frameworkPath(app)),
        '_CodeSignature/CodeResources',
      ),
    );
    resourceFilePresent = true;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return {
    ...result,
    codePages: 'PASS',
    bundleResourceSeal: resourceFilePresent ? 'PRESENT_NOT_VERIFIED' : 'ABSENT',
    verificationScope: 'CODE_PAGES_ONLY',
    fullBundleSigningRequired: false,
  };
}

async function check() {
  // Синтетическая копия CodeDirectory воспроизводит именно порчу страницы с fuses.
  const bytes = Buffer.alloc(512);
  bytes.writeUInt32LE(0xfeedfacf, 0);
  bytes.writeUInt32LE(0x100000c, 4);
  bytes.writeUInt32LE(1, 16);
  bytes.writeUInt32LE(0x1d, 32);
  bytes.writeUInt32LE(16, 36);
  bytes.writeUInt32LE(256, 40);
  bytes.writeUInt32LE(256, 44);
  bytes.writeUInt32BE(0xfade0cc0, 256);
  bytes.writeUInt32BE(256, 260);
  bytes.writeUInt32BE(1, 264);
  bytes.writeUInt32BE(20, 272);
  const pos = 276;
  bytes.writeUInt32BE(0xfade0c02, pos);
  bytes.writeUInt32BE(180, pos + 4);
  bytes.writeUInt32BE(2, pos + 12);
  bytes.writeUInt32BE(100, pos + 16);
  bytes.writeUInt32BE(80, pos + 20);
  bytes.writeUInt32BE(1, pos + 28);
  bytes.writeUInt32BE(256, pos + 32);
  bytes[pos + 36] = 32;
  bytes[pos + 37] = 2;
  bytes[pos + 39] = 12;
  sentinel.copy(bytes, 80);
  Buffer.from('test\0').copy(bytes, pos + 80);
  createHash('sha256')
    .update(bytes.subarray(0, 256))
    .digest()
    .copy(bytes, pos + 100);
  assert(inspectSignature(bytes).valid);
  bytes[115] ^= 1;
  assert.deepEqual(inspectSignature(bytes).directories[0].mismatchedPages, [0]);
  console.log(
    'PASS: CodeDirectory обнаруживает изменённую страницу; проверка не исполняет Mach-O',
  );
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  assert.equal(process.argv[2], '--check');
  await check();
}
