// Fixture запускает built persistence: межпроцессная проверка не подменяет SQLite store.
const { stateDir, jobId, SQLITE_TEST_MODE: mode } = process.env;
const forceForeignLease = process.env.forceForeignLease === 'true';
const expectedGeneration =
  process.env.expectedGeneration === undefined
    ? undefined
    : Number(process.env.expectedGeneration);

function report(message) {
  return new Promise((resolve) => process.send?.(message, resolve));
}

function waitFor(expected) {
  return new Promise((resolve) => {
    const listener = (message) => {
      if (message !== expected) return;
      process.off('message', listener);
      resolve();
    };
    process.on('message', listener);
  });
}

function safe(error) {
  return {
    code: typeof error?.code === 'string' ? error.code : 'unknown',
    reason: typeof error?.reason === 'string' ? error.reason : undefined,
  };
}

const { SqliteManifestStore, sqliteMigrations } =
  await import('../../dist/index.js');
// Тестовая аддитивная v2: та же, что в unit-тестах миграций.
const additiveV2 = [
  sqliteMigrations[0],
  { version: 2, up: (db) => db.exec('ALTER TABLE jobs ADD COLUMN note TEXT') },
];
const store = new SqliteManifestStore({
  stateDir,
  ...(mode === 'migrate'
    ? { migrations: additiveV2 }
    : mode === 'stale-writer'
      ? { migrations: sqliteMigrations.slice(0, 1) }
      : {}),
  ...(mode === 'barrier'
    ? {
        beforeLeaseCas: async () => {
          const go = waitFor('go');
          await report({ status: 'barrier' });
          await go;
        },
      }
    : {}),
});

try {
  if (mode === 'migrate') {
    await store.open();
    await report({ status: 'migrated' });
  } else if (mode === 'stale-writer') {
    await store.list();
    const write = waitFor('write');
    await report({ status: 'opened' });
    await write;
    try {
      await store.sendControl(jobId, { command: 'pause' });
      await report({ status: 'written' });
    } catch (error) {
      await report({ status: 'refused', ...safe(error) });
    }
  } else {
    const session = await store.acquire(jobId, {
      forceForeignLease,
      expectedGeneration,
      recover: async (manifest) => manifest,
    });
    if (mode === 'hold') {
      const release = waitFor('release');
      await report({ status: 'acquired', pid: process.pid });
      await release;
      await session.release();
      await report({ status: 'released' });
    } else {
      await session.release();
      await report({ status: 'acquired', pid: process.pid });
    }
  }
} catch (error) {
  await report({ status: 'rejected', ...safe(error) });
  process.exitCode = 2;
} finally {
  await store.close();
  process.disconnect?.();
}
