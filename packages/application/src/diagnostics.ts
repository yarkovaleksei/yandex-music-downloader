import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  CommandRefusalError,
  normalizeDomainError,
  type DiagnosticsDto,
  type ManifestStore,
  type MusicProvider,
} from '@music-downloader/shared';

type CheckStatus = 'ok' | 'failed' | 'api-changed' | 'skipped' | 'optional';
type Check = {
  readonly status: CheckStatus;
  readonly code?: string;
  readonly optional?: boolean;
};
type Outcome<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly code: string };

export interface DiagnosticRuntimeOptions {
  readonly outputDirectory: string;
  readonly nodeVersion?: string;
  readonly ffmpegPath?: string;
  readonly runFfmpeg?: (executable?: string) => Promise<void>;
  readonly filesystemProbe?: (directory: string) => Promise<void>;
}

/** Формирует безопасный снимок doctor: причины и секреты provider-а за DTO не выходят.
 * @link docs/requirements/REQ-034-diag-doctor.md */
export async function collectDiagnostics(input: {
  readonly desktop?: boolean;
  readonly provider: MusicProvider;
  readonly manifestStore: ManifestStore;
  /** Read-only проверка default SQLite store; иначе проверяется list() переданного store. */
  readonly manifestStoreProbe?: () => Promise<void>;
  readonly storeBackend?: 'sqlite' | 'injected';
  readonly providerHealth?: () => Promise<
    | 'available'
    | 'absent'
    | 'corrupt'
    | 'access_denied'
    | 'unavailable'
    | 'expired'
  >;
  readonly providerSchemaVersion: string;
  readonly canaryTrackId: string;
  readonly runtime: DiagnosticRuntimeOptions;
}): Promise<DiagnosticsDto> {
  const checks: Record<string, Check> = {};
  const node = input.runtime.nodeVersion ?? process.versions.node;
  checks.runtime = {
    status: supportedNode(node) ? 'ok' : 'failed',
    ...(supportedNode(node) ? {} : { code: 'UNSUPPORTED_RUNTIME' }),
  };
  const credential = input.providerHealth;
  let credentialsAvailable = true;
  if (credential === undefined)
    checks.credentialStore = { status: 'skipped', code: 'NOT_APPLICABLE' };
  else {
    const outcome = await isolated(credential);
    const status = outcome.ok ? outcome.value : 'unavailable';
    credentialsAvailable = status === 'available';
    checks.credentialStore =
      status === 'available'
        ? { status: 'ok' }
        : {
            status: 'failed',
            code:
              status === 'access_denied'
                ? 'PERMISSION_DENIED'
                : status.toUpperCase(),
          };
  }
  // Повреждённая локальная запись не является schema drift API.
  // Зависимые запросы не выполняются, пока credentials/account не прошли проверку.
  const skipped: Check = { status: 'skipped', code: 'DEPENDENCY_FAILED' };
  if (!credentialsAvailable) {
    checks.provider = skipped;
    checks.auth = {
      status: 'failed',
      code: checks.credentialStore!.code ?? 'AUTH_ERROR',
    };
    checks.account = skipped;
    checks.metadata = skipped;
    checks.audioVariants = skipped;
  } else {
    const provider = await isolated(() => input.provider.getAccount());
    checks.provider = checkOutcome(provider);
    checks.auth =
      !provider.ok || provider.value === null
        ? { status: 'failed', code: provider.ok ? 'AUTH_ERROR' : provider.code }
        : { status: 'ok' };
    checks.account = !provider.ok
      ? skipped
      : provider.value === null
        ? { status: 'failed', code: 'AUTH_ERROR' }
        : { status: 'ok' };
    if (!provider.ok || provider.value === null) {
      checks.metadata = skipped;
      checks.audioVariants = skipped;
    } else {
      const metadata = await isolated(() =>
        input.provider.getTrack(input.canaryTrackId),
      );
      checks.metadata = checkOutcome(metadata);
      const variants = !metadata.ok
        ? undefined
        : await isolated(() =>
            input.provider.getAudioVariants(input.canaryTrackId),
          );
      checks.audioVariants =
        variants === undefined
          ? skipped
          : !variants.ok
            ? checkOutcome(variants)
            : variants.value.length === 0
              ? { status: 'failed', code: 'QUALITY_UNAVAILABLE' }
              : { status: 'ok' };
    }
  }
  checks.manifestStore = checkOutcome(
    await isolated<unknown>(
      input.manifestStoreProbe ?? (() => input.manifestStore.list()),
    ),
  );
  checks.filesystem = checkOutcome(
    await isolated(() => filesystem(input.runtime)),
  );
  if (!input.desktop) checks.ffmpeg = await ffmpegCheck(input.runtime);
  // Native keyring не задаёт права token-файла; configurationConfirmed не выводится из read.
  if (!input.desktop)
    checks.tokenPermissions = { status: 'skipped', code: 'NOT_APPLICABLE' };
  const available = Object.values(checks).every(
    (check) =>
      check.optional === true ||
      check.status === 'ok' ||
      (check.status === 'skipped' && check.code === 'NOT_APPLICABLE'),
  );
  return {
    available,
    backend: input.storeBackend ?? 'injected',
    configuration: {
      schemaVersion: input.providerSchemaVersion,
      credentialBackend:
        credential === undefined ? 'injected-provider' : 'native-keyring',
      configurationConfirmed: false,
      checks,
    },
  };
}

function supportedNode(version: string): boolean {
  const [major, minor] = version.split('.').map(Number);
  return major !== undefined && minor !== undefined && major === 24;
}
async function isolated<T>(operation: () => Promise<T>): Promise<Outcome<T>> {
  try {
    return { ok: true, value: await operation() };
  } catch (error) {
    return { ok: false, code: errorCode(error) };
  }
}
function checkOutcome(value: Outcome<unknown>): Check {
  return value.ok
    ? { status: 'ok' }
    : {
        status:
          value.code === 'API_CHANGED' ||
          value.code === 'PROVIDER_RESPONSE_INVALID'
            ? 'api-changed'
            : 'failed',
        code: value.code,
      };
}
function errorCode(error: unknown): string {
  // Несовместимая схема базы показывается закрытой причиной, без путей.
  if (
    error instanceof CommandRefusalError &&
    error.reason === 'STATE_SCHEMA_UNSUPPORTED'
  )
    return error.reason;
  return normalizeDomainError(error).code;
}
async function filesystem(runtime: DiagnosticRuntimeOptions): Promise<void> {
  if (runtime.filesystemProbe !== undefined)
    return runtime.filesystemProbe(runtime.outputDirectory);
  await mkdir(runtime.outputDirectory, { recursive: true });
  const root = await mkdtemp(
    path.join(runtime.outputDirectory, '.music-downloader-doctor-'),
  );
  try {
    await writeFile(path.join(root, 'probe'), '');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
export async function ffmpegCheck(
  runtime: DiagnosticRuntimeOptions,
): Promise<Check> {
  try {
    if (runtime.runFfmpeg !== undefined)
      await runtime.runFfmpeg(runtime.ffmpegPath ?? 'ffmpeg');
    else
      await promisify(execFile)(runtime.ffmpegPath ?? 'ffmpeg', ['-version'], {
        timeout: 5_000,
        windowsHide: true,
      });
    return { status: 'ok', optional: true };
  } catch {
    return { status: 'optional', code: 'NOT_INSTALLED', optional: true };
  }
}
