import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { generateKeyPairSync, sign } from 'node:crypto';
import asar from '@electron/asar';
import { sha, targets } from './lib.mjs';
import {
  releaseBase,
  descriptorName,
  releaseDescriptor,
  validateAssets,
  validateShippingTrust,
  validatePublicReceipt,
  readCandidate,
} from './release-contract.mjs';

const pair = generateKeyPairSync('ed25519');
const trust = {
  feedBaseUrl: releaseBase + 'latest/download/',
  channel: 'stable',
  publicKey: pair.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  origins: [
    'https://github.com',
    'https://release-assets.githubusercontent.com',
  ],
};

/** временный ключ доказывает contract без обращения к production keyring. */
async function fixture(action) {
  const temporary = await mkdtemp(path.join(tmpdir(), 'ymd-release-'));
  const directory = path.join(temporary, 'v1.2.3');
  await mkdir(directory);
  const manifest = {
    tag: 'v1.2.3',
    version: '1.2.3',
    gitHead: 'a'.repeat(40),
    local: false,
    published: false,
    targets: {},
  };
  for (const target of targets) {
    const artifact = `${target}.${{ 'linux-x64': 'AppImage', 'win32-x64': 'exe' }[target] ?? 'zip'}`;
    const bytes = Buffer.from('окончательный пакет ' + target);
    await writeFile(path.join(directory, artifact), bytes);
    manifest.targets[target] = {
      artifact,
      bytes: bytes.length,
      sha256: sha(bytes),
    };
    const descriptor = Buffer.from(
      JSON.stringify(releaseDescriptor(manifest, target)),
    );
    await writeFile(path.join(directory, descriptorName(target)), descriptor);
    await writeFile(
      path.join(directory, descriptorName(target) + '.sig'),
      sign(null, descriptor, pair.privateKey),
    );
    const staged = path.join(temporary, target);
    await mkdir(path.join(staged, 'dist'), { recursive: true });
    await writeFile(
      path.join(staged, 'dist/update-trust.json'),
      JSON.stringify(trust),
    );
    await writeFile(
      path.join(staged, 'package.json'),
      JSON.stringify({ version: manifest.version }),
    );
    const resources = path.join(directory, 'verify', target, 'resources');
    await mkdir(resources, { recursive: true });
    await asar.createPackage(staged, path.join(resources, 'app.asar'));
  }
  const manifestBytes = Buffer.from(JSON.stringify(manifest));
  await writeFile(path.join(directory, 'manifest.json'), manifestBytes);
  try {
    await action({
      directory,
      manifest,
      candidate: {
        tag: manifest.tag,
        revision: manifest.gitHead,
        manifestSha256: sha(manifestBytes),
      },
    });
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

test('полный комплект содержит 12 assets, immutable URL и shipping trust; квитанция не меняет manifest', async () => {
  await fixture(async ({ directory, manifest, candidate }) => {
    assert.deepEqual(await readCandidate(directory, candidate), manifest);
    const assets = await validateAssets(directory, manifest, trust);
    assert.equal(assets.length, 12);
    await validateShippingTrust(directory, manifest, trust);
    validatePublicReceipt(
      { schema: 1, tag: manifest.tag, revision: manifest.gitHead, assets },
      manifest,
      assets,
    );
    assert.equal(
      JSON.parse(await readFile(path.join(directory, 'manifest.json')))
        .published,
      false,
    );
  });
});
for (const scenario of [
  'missing',
  'hash',
  'key',
  'target',
  'version',
  'tag',
  'candidate',
  'trust',
  'receipt',
]) {
  test(`release contract отклоняет несоответствие: ${scenario}`, async () => {
    await fixture(async ({ directory, manifest, candidate }) => {
      const target = targets[0];
      if (scenario === 'missing')
        await rm(path.join(directory, descriptorName(target) + '.sig'));
      if (scenario === 'hash')
        await writeFile(
          path.join(directory, manifest.targets[target].artifact),
          'подмена',
        );
      if (scenario === 'target') delete manifest.targets[target];
      if (scenario === 'version') manifest.version = '1.2.4';
      if (scenario === 'tag') manifest.tag = 'v1.2.3-beta.1';
      if (scenario === 'candidate') {
        await assert.rejects(
          readCandidate(directory, {
            ...candidate,
            manifestSha256: '0'.repeat(64),
          }),
        );
      } else if (scenario === 'trust') {
        await assert.rejects(
          validateShippingTrust(directory, manifest, {
            ...trust,
            channel: 'other',
          }),
        );
      } else if (scenario === 'receipt') {
        const assets = await validateAssets(directory, manifest, trust);
        assert.throws(() =>
          validatePublicReceipt(
            { schema: 1, tag: 'v1.2.4', revision: manifest.gitHead, assets },
            manifest,
            assets,
          ),
        );
      } else {
        const otherTrust =
          scenario === 'key'
            ? {
                ...trust,
                publicKey: generateKeyPairSync('ed25519')
                  .publicKey.export({ type: 'spki', format: 'pem' })
                  .toString(),
              }
            : trust;
        await assert.rejects(validateAssets(directory, manifest, otherTrust));
      }
    });
  });
}

/** Регрессия: N и N+1 имеют разные source/dist/native inputs, а не только версии. */
test('исторический N проверяется по своим bytes; текущий N+1 по source, подмена snapshot отклоняется', async () => {
  const { captureBuildInputs, validateBuildInputs } =
    await import('./build-inputs.mjs');
  const temporary = await mkdtemp(path.join(tmpdir(), 'ymd-release-inputs-'));
  const source = path.join(temporary, 'source');
  const inputNames = [
    'apps/desktop/scripts/release-update.mjs',
    'apps/desktop/dist/main/index.js',
    'node_modules/native/binding.node',
  ];
  const candidates = [];
  try {
    for (const [position, tag] of ['v1.0.0', 'v1.0.1'].entries()) {
      const inputs = {};
      for (const relative of inputNames) {
        const content = Buffer.from(
          `реальные bytes revision ${position}: ${relative}`,
        );
        const file = path.join(source, relative);
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(file, content);
        inputs[relative] = sha(content);
      }
      const directory = path.join(temporary, tag);
      await mkdir(directory);
      const manifestFile = path.join(directory, 'manifest.json');
      await writeFile(
        manifestFile,
        JSON.stringify({ tag, gitHead: String(position).repeat(40), inputs }),
      );
      const snapshot = path.join(directory, 'build-inputs');
      await captureBuildInputs(manifestFile, source, snapshot);
      candidates.push({ manifestFile, snapshot });
    }
    const [previous, current] = candidates;
    await assert.rejects(
      validateBuildInputs(previous.manifestFile, source),
      /Устаревший input/,
    );
    await validateBuildInputs(previous.manifestFile, source, previous.snapshot);
    await validateBuildInputs(current.manifestFile, source);
    await assert.rejects(
      validateBuildInputs(previous.manifestFile, source, current.snapshot),
    );
    await writeFile(path.join(previous.snapshot, inputNames[1]), 'подмена');
    await assert.rejects(
      validateBuildInputs(previous.manifestFile, source, previous.snapshot),
      /Устаревший input/,
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
