#!/usr/bin/env node
/** Проверяет изолированный несекретный canary в новом процессе; @link ../../../docs/adr/ADR-010-cli-auth-and-secure-storage.md */
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { Entry } from '@napi-rs/keyring';
const service = 'music-downloader.step008.canary';
const account = process.env.STEP008_CANARY_ACCOUNT ?? `canary-${randomUUID()}`;
const value =
  process.env.STEP008_CANARY_VALUE ?? `step008-canary-${randomUUID()}`;
const backend =
  {
    linux: 'Secret Service/current-user',
    win32: 'Credential Manager Enterprise/current-user',
    darwin: 'Login Keychain/current-user',
  }[process.platform] ?? 'unsupported';
function createEntry() {
  return new Entry(service, account, { linux: { store: 'secret-service' } });
}
if (process.argv[2] === '--child-read') {
  let entry;
  try {
    entry = createEntry();
    if (entry.getPassword() !== value) throw new Error();
    process.stdout.write('NATIVE_STORE_CHILD: PASS (persistence)\n');
  } catch {
    process.stderr.write('NATIVE_STORE_CHILD: FAIL (native read)\n');
    process.exitCode = 1;
  }
} else {
  let passed = false;
  let cleanupPassed = false;
  let entry;
  try {
    entry = createEntry();
    entry.setPassword(value);
    if (entry.getPassword() !== value) throw new Error();
    const child = spawnSync(
      process.execPath,
      [process.argv[1], '--child-read'],
      {
        env: {
          ...process.env,
          STEP008_CANARY_ACCOUNT: account,
          STEP008_CANARY_VALUE: value,
        },
        encoding: 'utf8',
      },
    );
    if (child.status !== 0) throw new Error();
    passed = true;
  } catch {
    process.stderr.write(
      `NATIVE_STORE_CANARY: FAIL (${backend}, current-user)\n`,
    );
    process.exitCode = 1;
  } finally {
    if (entry) {
      try {
        entry.deleteCredential();
        if (entry.getPassword() === null) cleanupPassed = true;
        else {
          process.stderr.write('NATIVE_STORE_CLEANUP: FAIL\n');
          process.exitCode = 1;
        }
      } catch {
        process.stderr.write('NATIVE_STORE_CLEANUP: FAIL\n');
        process.exitCode = 1;
      }
    }
  }
  if (passed)
    process.stdout.write(
      `NATIVE_STORE_CANARY: PASS (${backend}, current-user, persistence)\n`,
    );
  if (cleanupPassed) process.stdout.write('NATIVE_STORE_CLEANUP: PASS\n');
}
