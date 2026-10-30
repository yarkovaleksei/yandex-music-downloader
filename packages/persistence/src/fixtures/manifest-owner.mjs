// Fixture запускает built persistence export: integration proof не подменяет native lock.
const { stateDir, jobId, MANIFEST_TEST_MODE: mode } = process.env;
const forceForeignLease = process.env.forceForeignLease === 'true';

function report(message) {
  process.send?.(message, () => {
    if (mode === 'once' || message.status === 'rejected') process.disconnect();
  });
}

function waitForRelease() {
  return new Promise((resolve) => {
    process.once('message', (message) => {
      if (message === 'release') resolve();
    });
  });
}

try {
  const { FileManifestStore } = await import('../../dist/index.js');
  const store = new FileManifestStore({ stateDir });
  const session = await store.acquire(jobId, {
    forceForeignLease,
    recover: async (manifest) => manifest,
  });
  report({ status: 'acquired', pid: process.pid });
  if (mode === 'hold') await waitForRelease();
  await session.release();
  if (mode === 'hold') report({ status: 'released' });
} catch (error) {
  report({
    status: 'rejected',
    message: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 2;
}
