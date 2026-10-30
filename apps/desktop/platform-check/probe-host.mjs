import { runNativeProbe } from '../dist/native-probe.mjs';
// Только launcher передаёт эти значения test host; production DesktopApi не имеет probe.
try {
  const result = await runNativeProbe({
    stateDir: process.env.MD_PROBE_STATE,
    namespace: process.env.MD_PROBE_NAMESPACE,
    marker: process.env.MD_PROBE_MARKER,
    stage: process.env.MD_PROBE_STAGE,
  });
  process.parentPort.postMessage({
    ok:
      result.sqlite &&
      result.keyring &&
      (process.env.MD_PROBE_STAGE !== 'delete' || result.deleted),
    ...result,
    versions: {
      electron: process.versions.electron,
      node: process.versions.node,
      napi: process.versions.napi,
    },
  });
} catch (error) {
  process.parentPort.postMessage({
    ok: false,
    code:
      typeof error?.code === 'string' && /^[A-Z_]+$/.test(error.code)
        ? error.code
        : 'NATIVE_PROBE_FAILED',
  });
}
