import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile, readdir } from 'node:fs/promises';
import { createPublicKey, verify } from 'node:crypto';
import asar from '@electron/asar';
import { files, sha, targets, versionFromTag } from './lib.mjs';

export const releaseBase =
  'https://github.com/yarkovaleksei/yandex-music-downloader/releases/';
export const descriptorName = (target) => `update-stable-${target}.json`;

/** окончательные bytes пакета связаны с неизменным тегом, а не с latest. */
export function releaseDescriptor(manifest, target) {
  const version = versionFromTag(manifest.tag);
  assert(!version.includes('-'), 'Для stable требуется тег без prerelease');
  const item = manifest.targets[target];
  return {
    schemaVersion: 1,
    version,
    channel: 'stable',
    target,
    url: `${releaseBase}download/${manifest.tag}/${encodeURIComponent(path.basename(item.artifact))}`,
    size: item.bytes,
    sha256: item.sha256,
  };
}

export function validateTrust(trust) {
  assert.equal(trust.feedBaseUrl, releaseBase + 'latest/download/');
  assert.equal(trust.channel, 'stable');
  assert.equal(createPublicKey(trust.publicKey).asymmetricKeyType, 'ed25519');
  assert(trust.origins.includes('https://github.com'));
  for (const origin of trust.origins) {
    const url = new URL(origin);
    assert.equal(url.protocol, 'https:');
    assert.equal(url.origin, origin);
  }
}

/** Схема проверяется тем же main-кодом, который принимает описание в приложении. */
export async function validateAssets(directory, manifest, trust) {
  validateTrust(trust);
  assert.equal(manifest.local, false);
  assert.equal(manifest.published, false);
  assert.equal(manifest.version, versionFromTag(manifest.tag));
  assert.match(manifest.gitHead, /^[a-f0-9]{40}$/);
  assert.deepEqual(Object.keys(manifest.targets).sort(), [...targets].sort());
  const { descriptorSchema } = await import('../dist/main/update/service.js');
  const assets = [];
  for (const target of targets) {
    const entry = manifest.targets[target];
    const packageBytes = await readFile(path.join(directory, entry.artifact));
    assert.equal(packageBytes.length, entry.bytes);
    assert.equal(sha(packageBytes), entry.sha256);
    const name = descriptorName(target);
    const bytes = await readFile(path.join(directory, name));
    const signature = await readFile(path.join(directory, name + '.sig'));
    assert.equal(signature.length, 64);
    assert(
      verify(null, bytes, trust.publicKey, signature),
      'Подпись не соответствует production publicKey',
    );
    const descriptor = descriptorSchema.parse(
      JSON.parse(bytes.toString('utf8')),
    );
    assert.deepEqual(descriptor, releaseDescriptor(manifest, target));
    for (const [assetName, content] of [
      [path.basename(entry.artifact), packageBytes],
      [name, bytes],
      [name + '.sig', signature],
    ])
      assets.push({
        name: assetName,
        url: `${releaseBase}download/${manifest.tag}/${encodeURIComponent(assetName)}`,
        size: content.length,
        sha256: sha(content),
      });
  }
  assert.equal(new Set(assets.map((item) => item.name)).size, 12);
  return assets;
}

/** verify-package сначала извлекает реальные дистрибутивы; staging не заменяет shipping trust. */
export async function validateShippingTrust(directory, manifest, trust) {
  for (const target of targets) {
    const archives = (
      await files(path.join(directory, 'verify', target))
    ).filter((file) => /\/resources\/app\.asar$/i.test(file));
    assert.equal(archives.length, 1);
    const archive = archives[0];
    assert.deepEqual(
      JSON.parse(asar.extractFile(archive, 'dist/update-trust.json')),
      trust,
    );
    assert.equal(
      JSON.parse(asar.extractFile(archive, 'package.json')).version,
      manifest.version,
    );
  }
}

/** Квитанция публичной загрузки отделена от неизменного сборочного manifest. */
export function validatePublicReceipt(receipt, manifest, assets) {
  assert.equal(receipt.schema, 1);
  assert.equal(receipt.tag, manifest.tag);
  assert.equal(receipt.revision, manifest.gitHead);
  assert.deepEqual(
    [...receipt.assets].sort((a, b) => a.name.localeCompare(b.name)),
    [...assets].sort((a, b) => a.name.localeCompare(b.name)),
  );
}

export async function readCandidate(directory, candidate) {
  assert.equal(path.basename(directory), candidate.tag);
  const bytes = await readFile(path.join(directory, 'manifest.json'));
  assert.equal(sha(bytes), candidate.manifestSha256);
  const manifest = JSON.parse(bytes);
  assert.equal(manifest.tag, candidate.tag);
  assert.equal(manifest.gitHead, candidate.revision);
  return manifest;
}

/** Каждый завершённый комплект хранит свой индекс; число выпусков не ограничено парой N/N+1. */
export async function readReleaseCandidates(cache, tag) {
  const names = tag
    ? [tag]
    : (await readdir(cache, { withFileTypes: true }))
        .filter(
          (entry) => entry.isDirectory() && /^v\d+\.\d+\.\d+$/.test(entry.name),
        )
        .map((entry) => entry.name);
  const candidates = [];
  for (const name of names) {
    const file = path.join(cache, name, 'release-candidate.json');
    let candidate;
    try {
      candidate = JSON.parse(await readFile(file, 'utf8'));
    } catch (error) {
      if (!tag && error.code === 'ENOENT') continue;
      throw error;
    }
    assert.equal(candidate.schema, 1);
    assert.equal(candidate.tag, name);
    assert(!versionFromTag(name).includes('-'));
    candidates.push(candidate);
  }
  assert(candidates.length, 'Нет завершённых комплектов релиза');
  return candidates;
}
