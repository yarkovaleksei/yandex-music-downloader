#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { StringDecoder } from 'node:string_decoder';
import { createInterface } from 'node:readline/promises';
import {
  createPreparationDiagnostics,
  probeEndpoint,
  safeNativeError,
} from './install-diagnostics.mjs';

// Инструмент приёмки запускает только штатный CLI; manifest и медиа только читаются.
// Отчёт содержит allowlist фактов, а credentials и исходные ошибки остаются в памяти.
// @link ../../../planning/tasks/STEP-027.md
export const directory = path.dirname(fileURLToPath(import.meta.url));
export const root = path.resolve(directory, '../../..');
export const defaultReportBase = () => process.cwd();
const supportedSourceHosts = new Set([
  'music.yandex.ru',
  'music.yandex.by',
  'music.yandex.kz',
  'music.yandex.com',
  'music.yandex.uz',
]);
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const safeCode = (code) =>
  typeof code === 'string' && /^[A-Z][A-Z0-9_]{0,70}$/.test(code)
    ? code
    : 'UNCLASSIFIED';
const assert = (condition, code) => {
  if (!condition) throw new Error(code);
};

/** Проверяем фактические значения в исходном потоке до отбора полей для отчёта. */
export function privacyCheck(text, secrets = []) {
  return (
    !secrets.some((secret) => secret && text.includes(secret)) &&
    !/Bearer\s+\S+|[?&](?:sign|signature|token|ts)=/i.test(text)
  );
}
/** Повторяем только временную сеть; API/schema/auth/permissions не маскируются повтором. */
export function retryableDoctor(fact) {
  const failed = Object.values(fact.checks ?? {}).filter(
    (check) => check.status === 'failed',
  );
  return (
    fact.privacyPassed === true &&
    failed.length > 0 &&
    failed.every((check) => check.code === 'NETWORK_ERROR')
  );
}
/** Обе стадии приёмки используют домены штатного provider, без отдельного ограничения .ru. */
function assertSourceUrl(text) {
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new Error('INVALID_SOURCE_URL');
  }
  assert(
    url.protocol === 'https:' &&
      supportedSourceHosts.has(url.hostname) &&
      !url.username &&
      !url.password &&
      privacyCheck(text),
    'INVALID_SOURCE_URL',
  );
}

/** Ссылки принадлежат проверяющему аккаунту; в комплекте нет заранее выбранной коллекции. */
export async function resolveSources(sources, kinds, ask) {
  const labels = {
    track: 'Ссылка на свой трек: ',
    album: 'Ссылка на свой альбом (от двух доступных треков): ',
    playlist:
      'Ссылка на свой плейлист или «Мне нравится» (от двух доступных треков): ',
  };
  const resolved = {};
  for (const kind of kinds) {
    const value =
      (typeof sources?.[kind] === 'string' && sources[kind].trim()) ||
      (await ask(labels[kind]));
    const text = value.trim();
    assertSourceUrl(text);
    resolved[kind] = text;
  }
  return resolved;
}
export async function digestFiles(files, base = root) {
  const h = crypto.createHash('sha256');
  for (const name of [...files].sort()) {
    h.update(name + '\0');
    h.update(
      crypto
        .createHash('sha256')
        .update(await fs.readFile(path.join(base, name)))
        .digest(),
    );
  }
  return 'sha256:' + h.digest('hex');
}
export function safeEvent(dto) {
  if (dto.event)
    return {
      event:
        typeof dto.event === 'string' && /^[a-z.]+$/.test(dto.event)
          ? dto.event
          : 'unknown',
      seq: typeof dto.seq === 'number' ? dto.seq : undefined,
      jobId:
        typeof dto.jobId === 'string' && /^[a-f0-9-]{36}$/i.test(dto.jobId)
          ? dto.jobId
          : undefined,
      trackKey:
        typeof dto.trackKey === 'string' && /^\d+$/.test(dto.trackKey)
          ? dto.trackKey
          : undefined,
      payload: Object.fromEntries(
        Object.entries(dto.payload ?? {}).filter(
          ([, value]) =>
            typeof value === 'number' || typeof value === 'boolean',
        ),
      ),
    };
  if (dto.kind === 'error')
    return {
      kind: 'error',
      code: safeCode(dto.error?.code),
      retryable: dto.error?.retryable === true,
    };
  if (dto.kind === 'result')
    return {
      kind: 'result',
      status: [
        'completed',
        'paused',
        'failed',
        'completed_with_errors',
        'cancelled',
      ].includes(dto.data?.status)
        ? dto.data.status
        : undefined,
    };
  return undefined;
}

/** На Windows helper посылает CTRL_C_EVENT; POSIX использует настоящий SIGINT. */
export function startNode(args, env = process.env) {
  if (process.platform === 'win32') {
    const child = spawn(
      'powershell.exe',
      [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        path.join(directory, 'windows-cli.ps1'),
      ],
      { cwd: root, env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true },
    );
    child.stdin.on('error', () => {});
    child.stdin.write(
      JSON.stringify({ executable: process.execPath, cwd: root, args }) + '\n',
    );
    return {
      child,
      pause: () => child.stdin.write('pause\n'),
      stop: () => child.stdin.write('stop\n'),
    };
  }
  const child = spawn(process.execPath, args, {
    cwd: root,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return {
    child,
    pause: () => child.kill('SIGINT'),
    stop: () => child.kill('SIGKILL'),
  };
}
export const startCli = (args, env) =>
  startNode(['apps/cli/dist/index.js', ...args], env);

/** Строки stdout/stderr не записываются на диск даже при ошибке или timeout. */
export async function capture(
  args,
  {
    pause = false,
    kind,
    secrets = [],
    env,
    timeoutMs = 45 * 60 * 1000,
    onProgress,
    launch = startCli,
  } = {},
) {
  const startedAt = new Date().toISOString();
  const controller = launch(args, env);
  const result = {
    args,
    startedAt,
    events: [],
    eventCounts: {},
    progressByTrack: {},
    privacyPassed: true,
    stderrBytes: 0,
  };
  let completed = 0,
    dtoResult,
    buffer = '',
    stderrTail = '',
    signalAt;
  const decoder = new StringDecoder('utf8'),
    errorDecoder = new StringDecoder('utf8');
  const scan = (text) => {
    if (!privacyCheck(text, secrets)) result.privacyPassed = false;
  };
  const timeout = setTimeout(() => {
    result.timedOut = true;
    controller.pause();
  }, timeoutMs);
  const hardTimeout = setTimeout(() => {
    result.timedOut = true;
    controller.stop();
  }, timeoutMs + 30000);
  function line(text) {
    scan(text);
    let dto;
    try {
      dto = JSON.parse(text);
    } catch {
      return;
    }
    if (dto.kind === 'result') dtoResult = dto;
    if (typeof dto.jobId === 'string' && /^[a-f0-9-]{36}$/i.test(dto.jobId))
      result.jobId = dto.jobId;
    if (dto.event === 'job.progress') {
      completed = dto.payload?.completed ?? completed;
      onProgress?.(completed, dto.payload?.total);
    }
    const event = safeEvent(dto);
    if (event) {
      const name = event.event ?? event.kind;
      result.eventCounts[name] = (result.eventCounts[name] ?? 0) + 1;
      if (name === 'track.progress') {
        const sample = { seq: event.seq, bytes: event.payload.bytes };
        const progress = (result.progressByTrack[event.trackKey] ??= {
          count: 0,
          first: sample,
        });
        progress.count++;
        progress.last = sample;
        result.firstProgress ??= event;
      } else result.events.push(event);
    }
    if (
      pause &&
      !signalAt &&
      dto.event === 'track.progress' &&
      dto.payload?.bytes >= 262144 &&
      (kind === 'track' || completed >= 1)
    ) {
      signalAt = new Date().toISOString();
      result.signalAt = signalAt;
      result.signalBytes = dto.payload.bytes;
      controller.pause();
    }
  }
  controller.child.stdout.on('data', (bytes) => {
    buffer += decoder.write(bytes);
    let index;
    while ((index = buffer.indexOf('\n')) >= 0) {
      line(buffer.slice(0, index));
      buffer = buffer.slice(index + 1);
    }
    if (buffer.length > 16 * 1024 * 1024) {
      result.outputLimitExceeded = true;
      controller.stop();
      buffer = '';
    }
  });
  controller.child.stderr.on('data', (bytes) => {
    result.stderrBytes += bytes.length;
    const text = stderrTail + errorDecoder.write(bytes);
    scan(text);
    if (text.includes('CTRL_C_FAILED')) result.controllerFailure = true;
    if (text.includes('CTRL_C_SENT')) result.ctrlCSent = true;
    stderrTail = text.slice(
      -Math.max(4096, ...secrets.map((s) => s.length + 128)),
    );
  });
  try {
    const exit = await new Promise((resolve, reject) => {
      controller.child.once('error', () =>
        reject(new Error('CLI_START_FAILED')),
      );
      controller.child.once('close', (code, signal) =>
        resolve({ code, signal }),
      );
    });
    line(buffer + decoder.end());
    scan(stderrTail + errorDecoder.end());
    Object.assign(result, exit, { finishedAt: new Date().toISOString() });
    // Raw CommandResult нужен только для preflight; он никогда не возвращается в durable report.
    return { record: result, dto: dtoResult };
  } finally {
    clearTimeout(timeout);
    clearTimeout(hardTimeout);
  }
}

export async function processCheck(
  args,
  env,
  {
    command = process.execPath,
    shell = false,
    captureVersion = false,
    timeoutMs = 15 * 60 * 1000,
  } = {},
) {
  const startedAt = new Date().toISOString();
  let stdout = crypto.createHash('sha256'),
    stderr = crypto.createHash('sha256');
  const diagnostics = createPreparationDiagnostics({ captureVersion });
  const child = spawn(command, args, {
    cwd: root,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell,
  });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill();
  }, timeoutMs);
  child.stdout.on('data', (b) => {
    stdout.update(b);
    diagnostics.write(b, 'stdout');
  });
  child.stderr.on('data', (b) => {
    stderr.update(b);
    diagnostics.write(b, 'stderr');
  });
  try {
    const exit = await new Promise((resolve) => {
      child.once('error', (error) =>
        resolve({ code: null, launchErrorCode: safeNativeError(error.code) }),
      );
      child.once('close', (code, signal) => resolve({ code, signal }));
    });
    return {
      command: command === process.execPath ? 'node' : command,
      args,
      startedAt,
      finishedAt: new Date().toISOString(),
      ...exit,
      timedOut,
      stdoutSha256: stdout.digest('hex'),
      stderrSha256: stderr.digest('hex'),
      diagnostics: diagnostics.finish(),
    };
  } finally {
    clearTimeout(timer);
  }
}
async function recursiveFiles(folder) {
  const paths = [];
  for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
    const name = path.join(folder, entry.name);
    if (entry.isDirectory()) paths.push(...(await recursiveFiles(name)));
    else if (entry.isFile()) paths.push(name);
  }
  return paths;
}

export async function main(
  argv = process.argv.slice(2),
  { reportBase = defaultReportBase() } = {},
) {
  const options = {
    prepare: true,
    cycles: 3,
    kinds: ['track', 'album', 'playlist'],
  };
  if (argv.includes('--help')) {
    console.log(
      'node docs/research/step-027-acceptance/run.mjs [--config <JSON>] [--no-prepare] [--smoke] [--diagnose-install]',
    );
    console.log(
      'По умолчанию: install/build/checks/auth/doctor и 9 реальных циклов. --smoke: один track-цикл. --diagnose-install: только диагностика/установка, без ссылок, auth и загрузок.',
    );
    return;
  }
  let configPath = path.join(directory, 'config.json');
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--config') {
      assert(argv[i + 1], 'CONFIG_ARGUMENT_REQUIRED');
      configPath = path.resolve(argv[++i]);
    } else if (argv[i] === '--no-prepare') options.prepare = false;
    else if (argv[i] === '--diagnose-install') options.diagnoseInstall = true;
    else if (argv[i] === '--smoke') {
      options.cycles = 1;
      options.kinds = ['track'];
    } else throw new Error('UNKNOWN_ARGUMENT');
  }
  assert(
    !options.diagnoseInstall || (options.prepare && options.kinds.length === 3),
    'INCOMPATIBLE_ARGUMENTS',
  );
  const reportRoot = await fs.mkdtemp(
    path.join(reportBase, 'music-downloader-check-'),
  );
  const reportPath = path.join(reportRoot, 'report.json');
  const report = {
    schema: 1,
    step: 'STEP-027',
    runnerVersion: 2,
    startedAt: new Date().toISOString(),
    platform: {
      os: process.platform,
      architecture: os.arch(),
      release: os.release(),
      node: process.version,
    },
    mode: options.diagnoseInstall
      ? 'install-diagnostic'
      : options.kinds.length === 3
        ? 'full'
        : 'smoke',
    status: 'RUNNING',
    checks: [],
    cycles: [],
  };
  let secrets = [],
    persistence,
    parseBuffer,
    validator;
  const save = async () => {
    assert(
      privacyCheck(JSON.stringify(report), secrets),
      'REPORT_PRIVACY_FAILED',
    );
    const temporary = reportPath + '.tmp';
    await fs.writeFile(temporary, JSON.stringify(report, null, 2) + '\n');
    await fs.rename(temporary, reportPath);
  };
  // Чужие настройки не меняются. Предотвращаем дополнительный log-file из config/env.
  const checksDirectory = path.join(root, '.cache', 'checks');
  await fs.mkdir(checksDirectory, { recursive: true });
  const env = {
    ...process.env,
    TMP: checksDirectory,
    TEMP: checksDirectory,
    TMPDIR: checksDirectory,
  };
  for (const key of Object.keys(env))
    if (key.startsWith('MUSIC_DOWNLOADER_')) delete env[key];
  let config;
  console.log(`Отчёт: ${reportPath}`);
  try {
    report.toolDigest = await digestFiles(
      [
        'run.mjs',
        'windows-cli.ps1',
        'signal-probe.mjs',
        'install-diagnostics.mjs',
      ],
      directory,
    );
    const version = process.versions.node.split('.').map(Number);
    assert(
      (version[0] === 22 && version[1] >= 13) ||
        version[0] === 24 ||
        version[0] === 23,
      'UNSUPPORTED_NODE_VERSION',
    );
    config = JSON.parse(await fs.readFile(configPath, 'utf8'));
    assert(
      config.sourceFiles?.length &&
        config.expectedSourceDigest &&
        config.sources,
      'INVALID_CONFIG',
    );
    for (const name of config.sourceFiles)
      assert(
        !path.isAbsolute(name) && !name.split('/').includes('..'),
        'INVALID_SOURCE_PATH',
      );
    report.sourceDigest = await digestFiles(config.sourceFiles);
    report.sourceFileCount = config.sourceFiles.length;
    report.gitHead = config.gitHead;
    assert(
      report.sourceDigest === config.expectedSourceDigest,
      'SOURCE_SUBJECT_MISMATCH',
    );
    if (options.diagnoseInstall) {
      report.projectLocation = {
        kind:
          process.platform === 'win32' && root.startsWith('\\\\')
            ? 'unc'
            : 'local',
        pathLength: root.length,
      };
      report.environmentFlags = Object.fromEntries(
        [
          'HTTP_PROXY',
          'HTTPS_PROXY',
          'NO_PROXY',
          'NODE_USE_ENV_PROXY',
          'NODE_EXTRA_CA_CERTS',
          'COREPACK_NPM_REGISTRY',
          'YARN_NPM_REGISTRY_SERVER',
        ].map((key) => [key, Boolean(env[key])]),
      );
      console.log(
        'Диагностика Corepack и доступа к registry/repo.yarnpkg.com…',
      );
      report.corepack = await processCheck(['--version'], env, {
        command: process.platform === 'win32' ? 'corepack.cmd' : 'corepack',
        shell: process.platform === 'win32',
        captureVersion: true,
        timeoutMs: 30000,
      });
      report.networkProbes = await Promise.all(
        ['https://registry.npmjs.org/', 'https://repo.yarnpkg.com/'].map(
          (url) => probeEndpoint(url),
        ),
      );
      console.log(
        'Повтор установки --immutable; сборка/авторизация/загрузки не запускаются…',
      );
      const check = await processCheck(
        ['packages/testing/scripts/run-yarn.mjs', 'install', '--immutable'],
        env,
      );
      report.checks.push(check);
      await save();
      assert(check.code === 0 && !check.timedOut, 'INSTALL_FAILED');
      report.sourceDigestAfter = await digestFiles(config.sourceFiles);
      assert(
        report.sourceDigestAfter === report.sourceDigest,
        'SOURCE_CHANGED_DURING_RUN',
      );
      report.status = 'INSTALL_PASS';
      return;
    }
    let questions;
    try {
      config.sources = await resolveSources(
        config.sources,
        options.kinds,
        async (label) => {
          questions ??= createInterface({
            input: process.stdin,
            output: process.stdout,
          });
          return questions.question(label);
        },
      );
    } finally {
      questions?.close();
    }
    report.sources = config.sources;
    const settingsPath = path.join(
      process.platform === 'win32'
        ? (env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming'))
        : (env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config')),
      'music-downloader',
      'settings.json',
    );
    let settings = {};
    try {
      settings = JSON.parse(await fs.readFile(settingsPath, 'utf8'));
    } catch (e) {
      if (e.code !== 'ENOENT') throw new Error('EXISTING_SETTINGS_INVALID');
    }
    assert(!settings.logFile, 'EXISTING_LOG_FILE_CONFIGURED');
    if (options.prepare) {
      for (const args of [
        ['install', '--immutable'],
        ['run', 'lint'],
        ['run', 'typecheck'],
        ['test'],
        ['build'],
      ]) {
        console.log(`Подготовка: ${args.join(' ')}…`);
        const check = await processCheck(
          ['packages/testing/scripts/run-yarn.mjs', ...args],
          env,
          args[0] === 'test' ? { timeoutMs: 30 * 60 * 1000 } : undefined,
        );
        report.checks.push(check);
        await save();
        assert(
          check.code === 0 && !check.timedOut,
          args[0] === 'install' ? 'INSTALL_FAILED' : 'AUTOMATED_CHECK_FAILED',
        );
      }
      for (const args of [
        ['packages/testing/scripts/verify-step-026-coverage.mjs'],
        ['--test', 'packages/providers/yandex-music/test-live/runner.test.mjs'],
      ]) {
        const check = await processCheck(args, env);
        report.checks.push(check);
        await save();
        assert(check.code === 0 && !check.timedOut, 'AUTOMATED_CHECK_FAILED');
      }
    } else report.preparationSkipped = true;
    report.signalProbe = (
      await capture(['docs/research/step-027-acceptance/signal-probe.mjs'], {
        env,
        pause: true,
        kind: 'track',
        launch: startNode,
        timeoutMs: 30000,
      })
    ).record;
    assert(
      report.signalProbe.code === 4 &&
        report.signalProbe.signalAt &&
        !report.signalProbe.timedOut &&
        !report.signalProbe.controllerFailure,
      'INTERRUPTION_MECHANISM_FAILED',
    );
    if (process.platform === 'win32')
      assert(report.signalProbe.ctrlCSent, 'WINDOWS_CTRL_C_NOT_CONFIRMED');
    const require = createRequire(path.join(root, 'package.json'));
    ({ parseBuffer } = await import(
      pathToFileURL(require.resolve('music-metadata'))
    ));
    const { createAudioValidator } = await import(
      pathToFileURL(path.join(root, 'packages/core/validation/dist/index.js'))
    );
    validator = createAudioValidator();
    persistence = await import(
      pathToFileURL(path.join(root, 'packages/persistence/dist/index.js'))
    );
    for (const [key, folder] of [
      ['cliBuildDigest', 'apps/cli/dist'],
      ['providerBuildDigest', 'packages/providers/yandex-music/dist'],
    ]) {
      const files = (await recursiveFiles(path.join(root, folder)))
        .filter((p) => p.endsWith('.js'))
        .map((p) => path.relative(root, p).split(path.sep).join('/'));
      report[key] = await digestFiles(files);
    }
    let account = await capture(['account', '--json'], { env });
    if (account.record.code !== 0) {
      console.log(
        'Нужен вход в Яндекс Музыку. Подтверди авторизацию в браузере; пароль/токен скрипту не передаются.',
      );
      const child = spawn(
        process.execPath,
        ['apps/cli/dist/index.js', 'auth'],
        { cwd: root, env, stdio: 'inherit' },
      );
      const code = await new Promise((resolve, reject) => {
        child.once('error', () => reject(new Error('AUTH_START_FAILED')));
        child.once('close', resolve);
      });
      assert(code === 0, 'AUTH_FAILED');
      account = await capture(['account', '--json'], { env });
    }
    assert(account.record.code === 0, 'ACCOUNT_UNAUTHORIZED');
    const credential = await new persistence.CliCredentialStore().read();
    const record = credential ? JSON.parse(credential) : {};
    secrets = [
      record.accessToken,
      record.refreshToken,
      record.accountId,
    ].filter((v) => typeof v === 'string' && v);
    assert(secrets.length > 0, 'NATIVE_CREDENTIAL_READ_FAILED');
    report.account = { authorized: true, exitCode: account.record.code };
    const disk = await fs.statfs(reportRoot);
    report.initialFreeBytes = disk.bavail * disk.bsize;
    assert(report.initialFreeBytes >= 5 * 1024 ** 3, 'INSUFFICIENT_DISK_SPACE');
    report.doctorAttempts = [];
    for (let attempt = 1; attempt <= 3; attempt++) {
      const doctor = await capture(
        ['doctor', '--json', '--output', reportRoot],
        { env, secrets },
      );
      const diagnostics = doctor.dto?.data;
      report.doctor = {
        exitCode: doctor.record.code,
        available: diagnostics?.available === true,
        privacyPassed: doctor.record.privacyPassed,
        schemaVersion: diagnostics?.configuration?.schemaVersion,
        credentialBackend: diagnostics?.configuration?.credentialBackend,
        configurationConfirmed:
          diagnostics?.configuration?.configurationConfirmed,
        checks: Object.fromEntries(
          Object.entries(diagnostics?.configuration?.checks ?? {}).map(
            ([name, check]) => [
              name,
              {
                status: check.status,
                ...(check.code ? { code: safeCode(check.code) } : {}),
              },
            ],
          ),
        ),
      };
      report.doctorAttempts.push({
        ...report.doctor,
        attempt,
        finishedAt: doctor.record.finishedAt,
      });
      await save();
      if (
        report.doctor.exitCode === 0 ||
        !retryableDoctor(report.doctor) ||
        attempt === 3
      )
        break;
      console.log(
        `Doctor: временный NETWORK_ERROR, повтор ${attempt + 1}/3 через 5 секунд…`,
      );
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
    assert(
      report.doctor.exitCode === 0 &&
        report.doctor.available &&
        report.doctor.privacyPassed,
      'DOCTOR_FAILED',
    );
    const manifest = async (jobId) => {
      const text = await fs.readFile(
        path.join(
          persistence.resolveStateDirectory(),
          sha(jobId),
          'manifest.json',
        ),
        'utf8',
      );
      assert(privacyCheck(text, secrets), 'MANIFEST_PRIVACY_FAILED');
      return JSON.parse(text);
    };
    const audio = async (track) => {
      const bytes = await fs.readFile(track.resultPath),
        metadata = await parseBuffer(bytes, undefined, { duration: true });
      const validation = await validator.validate({
        path: track.resultPath,
        variant: track.variant,
      });
      const st = await fs.stat(track.resultPath, { bigint: true });
      assert(validation.durationMs > 0, 'AUDIO_VALIDATION_FAILED');
      assert(
        metadata.common.title &&
          metadata.common.artist &&
          metadata.common.album &&
          metadata.common.picture?.length,
        'METADATA_MISSING',
      );
      return {
        trackKey: track.trackKey,
        file: path
          .relative(reportRoot, track.resultPath)
          .split(path.sep)
          .join('/'),
        bytes: bytes.length,
        sha256: sha(bytes),
        mtimeNs: st.mtimeNs.toString(),
        inode: st.ino.toString(),
        variant: {
          codec: track.variant.codec,
          container: track.variant.container,
          bitrate: track.variant.bitrate,
        },
        validation,
        tags: {
          title: metadata.common.title,
          artist: metadata.common.artist,
          album: metadata.common.album,
          pictures: metadata.common.picture.map((p) => ({
            format: p.format,
            bytes: p.data.length,
          })),
        },
      };
    };
    for (const kind of options.kinds) {
      assertSourceUrl(config.sources[kind]);
      for (let iteration = 1; iteration <= options.cycles; iteration++) {
        const cycle = {
          kind,
          iteration,
          startedAt: new Date().toISOString(),
          pass: false,
        };
        report.cycles.push(cycle);
        await save();
        console.log(
          `${kind} ${iteration}/${options.cycles}: загрузка → автоматический Ctrl+C → resume…`,
        );
        const output = path.join(reportRoot, `${kind}-${iteration}`);
        await fs.mkdir(output);
        const downloaded = await capture(
          [
            kind,
            config.sources[kind],
            '--json',
            '--quality',
            'best',
            '--concurrency',
            '1',
            '--output',
            output,
          ],
          { env, secrets, pause: true, kind },
        );
        cycle.download = downloaded.record;
        await save();
        assert(
          cycle.download.code === 4 &&
            cycle.download.signalAt &&
            cycle.download.signalBytes &&
            !cycle.download.timedOut &&
            !cycle.download.controllerFailure &&
            cycle.download.privacyPassed,
          'DOWNLOAD_DID_NOT_PAUSE',
        );
        if (process.platform === 'win32')
          assert(cycle.download.ctrlCSent, 'WINDOWS_CTRL_C_NOT_CONFIRMED');
        const before = await manifest(cycle.download.jobId);
        cycle.before = {
          counts: counts(before.tracks),
          completedFiles: await Promise.all(
            before.tracks.filter((t) => t.status === 'completed').map(audio),
          ),
          partialFiles: [],
        };
        for (const t of before.tracks.filter(
          (t) => t.status === 'paused' && t.partPath,
        )) {
          const stat = await fs.stat(t.partPath);
          cycle.before.partialFiles.push({
            trackKey: t.trackKey,
            bytes: stat.size,
            manifestBytes: t.partial?.bytes,
          });
          assert(
            stat.size > 0 && stat.size === t.partial?.bytes,
            'PARTIAL_PREFIX_MISMATCH',
          );
        }
        assert(
          cycle.before.partialFiles.length > 0,
          'NO_PHYSICAL_PARTIAL_PREFIX',
        );
        if (kind !== 'track')
          assert(
            cycle.before.completedFiles.length > 0,
            'NO_COMPLETED_FILE_BEFORE_RESUME',
          );
        cycle.manifestPrivacyBefore = true;
        await save();
        let lastProgress = 0;
        cycle.resume = (
          await capture(
            ['resume', before.jobId, '--json', '--concurrency', '1'],
            {
              env,
              secrets,
              onProgress: (completed, total) => {
                if (completed >= lastProgress + 20) {
                  lastProgress = completed;
                  console.log(
                    `  ${kind}: готово ${completed}${total ? '/' + total : ''}`,
                  );
                }
              },
            },
          )
        ).record;
        await save();
        assert(
          cycle.resume.code === 0 &&
            !cycle.resume.timedOut &&
            cycle.resume.privacyPassed,
          'RESUME_FAILED',
        );
        const after = await manifest(before.jobId);
        cycle.after = {
          counts: counts(after.tracks),
          total: after.tracks.length,
          files: await Promise.all(
            after.tracks.filter((t) => t.status === 'completed').map(audio),
          ),
        };
        assert(
          cycle.after.total > 0 &&
            cycle.after.counts.completed === cycle.after.total,
          'INCOMPLETE_COLLECTION',
        );
        cycle.manifestPrivacyAfter = true;
        cycle.preservedCompleted = cycle.before.completedFiles.every((b) =>
          cycle.after.files.some(
            (a) =>
              a.trackKey === b.trackKey &&
              a.sha256 === b.sha256 &&
              a.mtimeNs === b.mtimeNs &&
              a.inode === b.inode,
          ),
        );
        cycle.noRepeatedCompletedDownloads = cycle.before.completedFiles.every(
          (b) =>
            !cycle.resume.events.some(
              (e) =>
                e.trackKey === b.trackKey &&
                ['download.started', 'metadata.written'].includes(e.event),
            ),
        );
        assert(
          cycle.preservedCompleted && cycle.noRepeatedCompletedDownloads,
          'COMPLETED_FILE_CHANGED',
        );
        const files = await recursiveFiles(output);
        cycle.partsRemaining = files.filter(
          (f) => f.endsWith('.part') || f.endsWith('.candidate'),
        ).length;
        cycle.referencedPartsRemaining = 0;
        for (const t of after.tracks)
          if (
            t.partPath &&
            (await fs.stat(t.partPath).then(
              () => true,
              () => false,
            ))
          )
            cycle.referencedPartsRemaining++;
        assert(
          cycle.partsRemaining === 0 && cycle.referencedPartsRemaining === 0,
          'PARTS_REMAIN_AFTER_COMPLETION',
        );
        cycle.failedAttemptCount = after.tracks.reduce(
          (n, t) => n + (t.attempts ?? 0),
          0,
        );
        cycle.playlistSidecars = [];
        for (const file of files.filter((f) => f.endsWith('.m3u8'))) {
          const entries = (await fs.readFile(file, 'utf8'))
            .split(/\r?\n/)
            .filter((l) => l && !l.startsWith('#')).length;
          assert(entries === cycle.after.total, 'PLAYLIST_SIDECAR_INCOMPLETE');
          cycle.playlistSidecars.push({
            file: path.relative(reportRoot, file).split(path.sep).join('/'),
            entries,
          });
        }
        cycle.pass = true;
        cycle.finishedAt = new Date().toISOString();
        await save();
        console.log(
          `  PASS: ${cycle.after.total} файлов; пауза 4, resume 0; временных файлов нет.`,
        );
      }
    }
    report.sourceDigestAfter = await digestFiles(config.sourceFiles);
    assert(
      report.sourceDigestAfter === report.sourceDigest,
      'SOURCE_CHANGED_DURING_RUN',
    );
    for (const [key, folder] of [
      ['cliBuildDigest', 'apps/cli/dist'],
      ['providerBuildDigest', 'packages/providers/yandex-music/dist'],
    ]) {
      const files = (await recursiveFiles(path.join(root, folder)))
        .filter((p) => p.endsWith('.js'))
        .map((p) => path.relative(root, p).split(path.sep).join('/'));
      assert(
        (await digestFiles(files)) === report[key],
        'BUILD_CHANGED_DURING_RUN',
      );
    }
    report.status = options.kinds.length === 3 ? 'PASS' : 'SMOKE_PASS';
    report.ownerGo = 'PENDING';
  } catch (error) {
    report.status = 'FAIL';
    report.failureCode = safeCode(error.code ?? error.message);
    console.log(
      `Проверка остановлена: ${report.failureCode}. Готовые файлы и состояние заданий сохранены.`,
    );
    process.exitCode = 1;
  } finally {
    report.finishedAt = new Date().toISOString();
    report.passedCycles = report.cycles.filter((c) => c.pass).length;
    report.validatedFiles = report.cycles.reduce(
      (n, c) => n + (c.after?.files?.length ?? 0),
      0,
    );
    await save();
    console.log(
      `Результат: ${report.status}${options.diagnoseInstall ? ' (только установка)' : ', циклов ' + report.passedCycles + '/9'}. Отправить только: ${reportPath}`,
    );
  }
}
function counts(tracks) {
  return Object.fromEntries(
    ['completed', 'skipped', 'failed', 'paused', 'unavailable', 'queued'].map(
      (s) => [s, tracks.filter((t) => t.status === s).length],
    ),
  );
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch(() => {
    console.error(
      'RUNNER_FAILED: проверь доступность домашней папки и параметры запуска.',
    );
    process.exitCode = 1;
  });
}
