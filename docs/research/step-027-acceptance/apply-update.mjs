#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, '../../..');

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function validSourceFiles(sourceFiles) {
  return (
    Array.isArray(sourceFiles) &&
    sourceFiles.length > 0 &&
    new Set(sourceFiles).size === sourceFiles.length &&
    sourceFiles.every(
      (name) =>
        typeof name === 'string' &&
        !name.includes('\\') &&
        !path.isAbsolute(name) &&
        !name.split('/').includes('..'),
    )
  );
}

function validMetadata(subject) {
  return (
    subject &&
    typeof subject.gitHead === 'string' &&
    /^sha256:[a-f0-9]{64}$/.test(subject.expectedSourceDigest) &&
    validSourceFiles(subject.sourceFiles)
  );
}

async function digestFiles(names, baseRoot) {
  const hash = crypto.createHash('sha256');
  for (const name of [...names].sort()) {
    hash.update(`${name}\0`);
    hash.update(
      crypto
        .createHash('sha256')
        .update(await fs.readFile(path.join(baseRoot, name)))
        .digest(),
    );
  }
  return `sha256:${hash.digest('hex')}`;
}

export async function applyUpdate({
  baseRoot = root,
  baseDirectory = directory,
} = {}) {
  let subject;
  let config;
  try {
    subject = JSON.parse(
      await fs.readFile(path.join(baseDirectory, 'subject.json'), 'utf8'),
    );
    config = JSON.parse(
      await fs.readFile(path.join(baseDirectory, 'config.json'), 'utf8'),
    );
  } catch {
    fail('UPDATE_METADATA_INVALID');
  }
  if (
    !validMetadata(subject) ||
    !config ||
    typeof config !== 'object' ||
    !validSourceFiles(config.sourceFiles) ||
    subject.sourceFiles.length !== config.sourceFiles.length ||
    subject.sourceFiles.some(
      (name, index) => name !== config.sourceFiles[index],
    )
  )
    fail('UPDATE_METADATA_INVALID');
  let actual;
  try {
    actual = await digestFiles(subject.sourceFiles, baseRoot);
  } catch {
    fail('UPDATE_SOURCE_MISMATCH');
  }
  if (actual !== subject.expectedSourceDigest) fail('UPDATE_SOURCE_MISMATCH');
  const updated = {
    ...config,
    gitHead: subject.gitHead,
    sourceFiles: subject.sourceFiles,
    expectedSourceDigest: subject.expectedSourceDigest,
  };
  const configPath = path.join(baseDirectory, 'config.json');
  const temporary = `${configPath}.${crypto.randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, `${JSON.stringify(updated, null, 2)}\n`);
    await fs.rename(temporary, configPath);
  } catch {
    await fs.unlink(temporary).catch(() => undefined);
    fail('UPDATE_WRITE_FAILED');
  }
  return { code: 'UPDATE_APPLIED' };
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  applyUpdate()
    .then(({ code }) => console.log(code))
    .catch((error) => {
      console.error(
        typeof error?.code === 'string' ? error.code : 'UPDATE_FAILED',
      );
      process.exitCode = 1;
    });
