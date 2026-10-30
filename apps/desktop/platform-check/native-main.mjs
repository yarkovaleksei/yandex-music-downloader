import { app, utilityProcess } from 'electron';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const here = import.meta.dirname;
app.setPath(
  'userData',
  path.join(path.dirname(process.env.MD_PROBE_REPORT), 'native-user-data'),
);
const stateDir = await mkdtemp(
  path.join(os.tmpdir(), 'music-downloader-electron-probe-'),
);
const nonce = randomUUID();
const namespace = `music-downloader.desktop.probe.${nonce}`;
const marker = `electron-probe-secret-${nonce}`;
const report = {
  status: 'FAIL',
  platform: process.platform,
  arch: process.arch,
  stages: {},
  secretScan: false,
};
async function stage(name) {
  return new Promise((resolve) => {
    const child = utilityProcess.fork(path.join(here, 'probe-host.mjs'), [], {
      env: {
        ...process.env,
        MD_PROBE_STATE: stateDir,
        MD_PROBE_NAMESPACE: namespace,
        MD_PROBE_MARKER: marker,
        MD_PROBE_STAGE: name,
      },
      stdio: 'ignore',
    });
    const timer = setTimeout(() => {
      child.kill();
      resolve({ ok: false, code: 'TIMEOUT' });
    }, 30_000);
    child.once('message', (message) => {
      clearTimeout(timer);
      child.kill();
      resolve(message);
    });
    child.once('exit', () => {
      clearTimeout(timer);
      resolve({ ok: false, code: 'HOST_EXIT' });
    });
  });
}
async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!(await scan(file))) return false;
    } else if ((await readFile(file)).includes(marker)) return false;
  }
  return true;
}
void app.whenReady().then(async () => {
  try {
    report.stages.write = await stage('write');
    report.stages.read = await stage('read');
    report.stages.delete = await stage('delete');
    report.secretScan = await scan(stateDir);
    report.status =
      Object.values(report.stages).every((item) => item.ok) && report.secretScan
        ? 'PASS'
        : 'FAIL';
    await writeFile(
      process.env.MD_PROBE_REPORT,
      JSON.stringify(report, null, 2) + '\n',
    );
  } finally {
    await rm(stateDir, { recursive: true, force: true });
    app.exit(report.status === 'PASS' ? 0 : 1);
  }
});
