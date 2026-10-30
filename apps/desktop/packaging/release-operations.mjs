import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { root, json, save, sha } from './lib.mjs';
import {
  readCandidate,
  validateAssets,
  validatePublicReceipt,
} from './release-contract.mjs';

export const repository = 'yarkovaleksei/yandex-music-downloader';
const stableTag = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
export class ReleaseError extends Error {}
const requireState = (condition, message) => {
  if (!condition) throw new ReleaseError(message);
};

/** Версии stable сравниваются численно; локальные теги не определяют предыдущий выпуск. */
export function compareVersions(left, right) {
  const parts = (version) => {
    const tag = version.startsWith('v') ? version : `v${version}`;
    requireState(
      stableTag.test(tag),
      'Нужна stable-версия вида 1.2.3 без префикса v и суффиксов.',
    );
    return tag.slice(1).split('.').map(BigInt);
  };
  const a = parts(left);
  const b = parts(right);
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1;
  }
  return 0;
}

/** stderr внешних команд не попадает в ошибки: сеть и credential store могут раскрывать секретные URL. */
export function runCommand(
  command,
  args,
  { cwd = root, inherit = false, digestSize } = {},
) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'],
    });
    let bytes = 0;
    const chunks = [];
    const hash = digestSize === undefined ? null : createHash('sha256');
    let invalid = false;
    child.on('error', () =>
      reject(new ReleaseError(`Не удалось запустить ${command}.`)),
    );
    child.stderr?.resume();
    child.stdout?.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > (digestSize ?? 32 * 1024 * 1024)) {
        invalid = true;
        child.kill();
      } else if (hash) hash.update(chunk);
      else chunks.push(chunk);
    });
    child.on('close', (code) => {
      if (code !== 0 || invalid)
        reject(
          new ReleaseError(
            `Команда ${command} завершилась ошибкой; публикация остановлена.`,
          ),
        );
      else if (hash) resolve({ size: bytes, sha256: hash.digest('hex') });
      else resolve(Buffer.concat(chunks).toString('utf8').trim());
    });
  });
}

/** gh отвечает за аутентификацию; токен не читается скриптом и не передаётся в аргументах. */
export function githubClient(run = runCommand) {
  const api = async (endpoint) =>
    JSON.parse(
      await run('gh', ['api', endpoint, '--paginate', '--slurp']),
    ).flat();
  const repoArgs = ['--repo', repository];
  return {
    releases: () => api(`repos/${repository}/releases?per_page=100`),
    assets: (release) =>
      api(`repos/${repository}/releases/${release.id}/assets?per_page=100`),
    create: (tag, version, notes) =>
      run('gh', [
        'release',
        'create',
        tag,
        ...repoArgs,
        '--verify-tag',
        '--draft',
        '--title',
        `Yandex Music Downloader ${version}`,
        '--notes-file',
        notes,
      ]),
    upload: (tag, file) =>
      run('gh', ['release', 'upload', tag, file, ...repoArgs]),
    publish: (tag) =>
      run('gh', [
        'release',
        'edit',
        tag,
        ...repoArgs,
        '--draft=false',
        '--latest',
      ]),
    removeIncomplete: (asset) =>
      run('gh', [
        'api',
        '--method',
        'DELETE',
        `repos/${repository}/releases/assets/${asset.id}`,
      ]),
    digest: (asset, size) =>
      run(
        'gh',
        [
          'api',
          `repos/${repository}/releases/assets/${asset.id}`,
          '--header',
          'Accept: application/octet-stream',
        ],
        { digestSize: size },
      ),
    latest: async () =>
      JSON.parse(
        await run('gh', ['api', `repos/${repository}/releases/latest`]),
      ),
  };
}

/** Публичная проверка не использует gh/токен и не сохраняет подписанные адреса перенаправлений. */
export async function publicDigest(
  url,
  expectedSize,
  origins,
  fetcher = fetch,
) {
  const allowed = new Set(origins);
  const signal = AbortSignal.timeout(5 * 60_000);
  for (let redirects = 0; redirects <= 5; redirects++) {
    const parsed = new URL(url);
    requireState(
      parsed.protocol === 'https:' &&
        allowed.has(parsed.origin) &&
        !parsed.username &&
        !parsed.password,
      'Публичная загрузка перешла на недоверенный адрес.',
    );
    const response = await fetcher(url, { redirect: 'manual', signal });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      requireState(location, 'В перенаправлении отсутствует адрес.');
      url = new URL(location, url).href;
      continue;
    }
    requireState(
      response.status === 200 && response.body,
      'Публичное вложение недоступно; повторите publish для проверки уже опубликованного релиза.',
    );
    const hash = createHash('sha256');
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      requireState(
        size <= expectedSize,
        'Размер публичного вложения превышает ожидаемый.',
      );
      hash.update(chunk);
    }
    return { size, sha256: hash.digest('hex') };
  }
  throw new ReleaseError('Слишком много перенаправлений публичной загрузки.');
}

export function createReleaseOperations(options = {}) {
  const cwd = options.cwd ?? root;
  const run = (command, args, extra = {}) =>
    (options.run ?? runCommand)(command, args, { cwd, ...extra });
  const github = options.github ?? githubClient(run);
  const cache = path.join(cwd, '.cache/desktop-packaging');
  const git = (...args) => run('git', args);
  const directoryFor = (tag) => path.join(cache, tag);
  const prepareBundle =
    options.prepareBundle ??
    ((tag) =>
      run(
        process.execPath,
        ['apps/desktop/scripts/release-update.mjs', 'prepare-release', tag],
        { inherit: true },
      ));

  async function state(version) {
    if (version !== undefined) {
      requireState(
        !version.startsWith('v'),
        'Передайте --version без префикса v.',
      );
      compareVersions(version, version);
    }
    const remote = await git('remote', 'get-url', 'origin');
    requireState(
      [
        `git@github.com:${repository}.git`,
        `git@github.com:${repository}`,
        `https://github.com/${repository}.git`,
        `https://github.com/${repository}`,
        `ssh://git@github.com/${repository}.git`,
      ].includes(remote),
      'origin должен указывать на репозиторий Yandex Music Downloader на GitHub.',
    );
    const revision = await git('rev-parse', 'HEAD');
    const clean = !(await git('status', '--porcelain'));
    const refs = new Map(
      (await git('ls-remote', '--heads', '--tags', 'origin'))
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          const [value, name] = line.split(/\s+/);
          return [name, value];
        }),
    );
    const releases = await github.releases();
    const published = releases.filter(
      (release) =>
        !release.draft &&
        !release.prerelease &&
        stableTag.test(release.tag_name),
    );
    published.sort((a, b) => compareVersions(b.tag_name, a.tag_name));
    const newest = published[0];
    const selected =
      version ??
      (newest
        ? newest.tag_name
            .slice(1)
            .split('.')
            .map((part, i) => (i === 2 ? String(BigInt(part) + 1n) : part))
            .join('.')
        : '0.2.0');
    const tag = `v${selected}`;
    const previous = published.find((release) => release.tag_name !== tag);
    const previousRevision = previous
      ? (refs.get(`refs/tags/${previous.tag_name}^{}`) ??
        refs.get(`refs/tags/${previous.tag_name}`))
      : null;
    if (previous) {
      requireState(
        previousRevision,
        'У предыдущего опубликованного релиза отсутствует удалённый тег.',
      );
      try {
        await git('merge-base', '--is-ancestor', previousRevision, revision);
      } catch {
        throw new ReleaseError(
          'Предыдущий релиз не является предком HEAD или его commit отсутствует локально. Получите историю и теги origin.',
        );
      }
    }
    const existing = releases.find((release) => release.tag_name === tag);
    const remoteTag =
      refs.get(`refs/tags/${tag}^{}`) ?? refs.get(`refs/tags/${tag}`);
    return {
      revision,
      clean,
      refs,
      releases,
      newest,
      previous,
      previousRevision,
      version: selected,
      tag,
      existing,
      remoteTag,
    };
  }

  async function assertLocalTag(tag, revision) {
    requireState(
      (await git('rev-parse', `refs/tags/${tag}^{commit}`)) === revision,
      'Локальный тег не соответствует HEAD и подготовленному комплекту.',
    );
  }

  async function readPrepared(current) {
    const directory = directoryFor(current.tag);
    const metadata = await json(path.join(directory, 'release.json'));
    requireState(
      metadata.schema === 1 &&
        metadata.tag === current.tag &&
        metadata.revision === current.revision &&
        metadata.version === current.version,
      'Подготовленный релиз не соответствует HEAD или версии.',
    );
    const candidate = await json(
      path.join(directory, 'release-candidate.json'),
    );
    const manifest = await readCandidate(directory, candidate);
    requireState(
      sha(await readFile(path.join(directory, 'manifest.json'))) ===
        metadata.manifestSha256 && manifest.gitHead === current.revision,
      'Сборочный manifest изменился после подготовки.',
    );
    const notes = await readFile(path.join(directory, 'notes.md'), 'utf8');
    requireState(
      sha(notes) === metadata.notesSha256,
      'Описание изменилось после подготовки релиза.',
    );
    const trust = await json(
      path.join(cwd, 'apps/desktop/packaging/update-trust.json'),
    );
    const assets = await validateAssets(directory, manifest, trust);
    const files = new Map(
      Object.values(manifest.targets).map((target) => [
        path.basename(target.artifact),
        target.artifact,
      ]),
    );
    return {
      directory,
      metadata,
      manifest,
      notes,
      trust,
      assets: assets.map((asset) => {
        const file = path.resolve(
          directory,
          files.get(asset.name) ?? asset.name,
        );
        requireState(
          !path.relative(directory, file).startsWith('..'),
          'Путь вложения выходит за каталог релиза.',
        );
        return { ...asset, file };
      }),
    };
  }

  async function plan(version) {
    const current = await state(version);
    const range = current.previousRevision
      ? `${current.previousRevision}..${current.revision}`
      : current.revision;
    const log = (
      await git('log', '--reverse', '--format=%H%x00%s%x00%b%x00', range)
    ).split('\0');
    const commits = [];
    for (let i = 0; i + 2 < log.length; i += 3)
      commits.push({
        revision: log[i].trim(),
        subject: log[i + 1],
        body: log[i + 2].trim(),
      });
    return {
      version: current.version,
      tag: current.tag,
      revision: current.revision,
      previousTag: current.previous?.tag_name ?? null,
      previousRevision: current.previousRevision,
      firstRelease: !current.previous,
      workingTreeClean: current.clean,
      remoteMainMatches:
        current.refs.get('refs/heads/main') === current.revision,
      releaseState: current.existing
        ? current.existing.draft
          ? 'draft'
          : 'published'
        : 'absent',
      remoteTagExists: Boolean(current.remoteTag),
      commits,
      changes: await git(
        'diff-tree',
        '--root',
        '--no-commit-id',
        '--stat',
        '-r',
        range,
      ),
    };
  }

  async function prepare(version, notesFile) {
    requireState(version && notesFile, 'prepare требует --version и --notes.');
    const current = await state(version);
    requireState(
      current.clean,
      'Подготовка требует чистого дерева. Зафиксируйте изменения отдельным действием.',
    );
    requireState(
      !current.existing || current.existing.draft,
      'Эта версия уже опубликована; для изменений выберите новую.',
    );
    requireState(
      !current.newest ||
        compareVersions(current.tag, current.newest.tag_name) > 0,
      'Новая версия должна быть выше последнего опубликованного stable-релиза.',
    );
    requireState(
      !current.remoteTag || current.remoteTag === current.revision,
      'Удалённый тег указывает на другой commit.',
    );
    const notes = await readFile(path.resolve(cwd, notesFile), 'utf8');
    requireState(notes.trim(), 'Описание релиза не должно быть пустым.');
    const localTags = (await git('tag', '--list', current.tag)).trim();
    if (localTags) await assertLocalTag(current.tag, current.revision);
    const directory = directoryFor(current.tag);
    if (existsSync(path.join(directory, 'release.json'))) {
      const prepared = await readPrepared(current);
      requireState(
        prepared.notes === notes,
        'Релиз уже подготовлен с другим описанием.',
      );
      return {
        tag: current.tag,
        revision: current.revision,
        prepared: true,
        reused: true,
      };
    }
    requireState(
      !existsSync(directory),
      'Каталог сборки уже существует без завершённого релиза. Сохраните нужные файлы и удалите только этот незавершённый каталог перед повтором prepare.',
    );
    if (!localTags)
      await git(
        'tag',
        '-a',
        current.tag,
        '-m',
        `Релиз Yandex Music Downloader ${version}`,
        current.revision,
      );
    await prepareBundle(current.tag);
    requireState(
      (await git('rev-parse', 'HEAD')) === current.revision &&
        !(await git('status', '--porcelain')),
      'HEAD или рабочее дерево изменились во время сборки.',
    );
    const manifestSha256 = sha(
      await readFile(path.join(directory, 'manifest.json')),
    );
    await writeFile(path.join(directory, 'notes.md'), notes);
    await save(path.join(directory, 'release.json'), {
      schema: 1,
      tag: current.tag,
      version,
      revision: current.revision,
      previousTag: current.previous?.tag_name ?? null,
      manifestSha256,
      notesSha256: sha(notes),
    });
    await readPrepared(current);
    return {
      tag: current.tag,
      revision: current.revision,
      prepared: true,
      reused: false,
    };
  }

  async function publish(version) {
    requireState(version, 'publish требует --version.');
    let current = await state(version);
    requireState(current.clean, 'Публикация требует чистого рабочего дерева.');
    requireState(
      current.refs.get('refs/heads/main') === current.revision,
      'Перед публикацией отправьте подготовленный commit в main на GitHub.',
    );
    requireState(
      !current.newest ||
        compareVersions(current.tag, current.newest.tag_name) >= 0,
      'На GitHub уже есть более новая stable-версия; latest не будет понижен.',
    );
    await assertLocalTag(current.tag, current.revision);
    const prepared = await readPrepared(current);
    const { assets, directory, notes, trust, manifest } = prepared;
    requireState(
      !current.remoteTag || current.remoteTag === current.revision,
      'Удалённый тег не соответствует подготовленному комплекту.',
    );
    if (!current.remoteTag)
      await git('push', 'origin', `refs/tags/${current.tag}`);
    if (!current.existing) {
      await github.create(
        current.tag,
        current.version,
        path.join(directory, 'notes.md'),
      );
      current = await state(version);
    }
    requireState(
      current.existing &&
        !current.existing.prerelease &&
        current.existing.name === `Yandex Music Downloader ${version}` &&
        (current.existing.body ?? '').trimEnd() === notes.trimEnd(),
      'Описание, имя или канал существующего релиза отличаются от подготовленного комплекта.',
    );
    const remoteAssets = await github.assets(current.existing);
    const names = new Set(assets.map((asset) => asset.name));
    requireState(
      new Set(remoteAssets.map((asset) => asset.name)).size ===
        remoteAssets.length &&
        remoteAssets.every((asset) => names.has(asset.name)),
      'В релизе есть лишние или повторяющиеся вложения.',
    );
    for (const asset of assets) {
      let remote = remoteAssets.find((item) => item.name === asset.name);
      // GitHub после 502 может оставить пустой starter: удаляем только этот след в draft.
      if (
        current.existing.draft &&
        remote?.state === 'starter' &&
        remote.size === 0
      ) {
        await github.removeIncomplete(remote);
        remote = undefined;
      }
      if (!remote) {
        requireState(
          current.existing.draft,
          'В опубликованном релизе отсутствуют вложения; опубликованные файлы не изменяются.',
        );
        await github.upload(current.tag, asset.file);
        const uploaded = await github.assets(current.existing);
        remote = uploaded.find((item) => item.name === asset.name);
      }
      requireState(
        remote?.state === 'uploaded' && remote.size === asset.size,
        'Размер или состояние вложения на GitHub не совпадает; автоматическая замена запрещена.',
      );
      const digest = await github.digest(remote, asset.size);
      requireState(
        digest.size === asset.size && digest.sha256 === asset.sha256,
        'SHA-256 вложения на GitHub не совпадает; автоматическая замена запрещена.',
      );
    }
    const finalAssets = await github.assets(current.existing);
    requireState(
      finalAssets.length === 12 &&
        finalAssets.every((asset) => names.has(asset.name)),
      'Перед публикацией нужен полный комплект из 12 вложений.',
    );
    const fresh = await state(version);
    requireState(
      fresh.clean &&
        fresh.revision === current.revision &&
        fresh.remoteTag === current.revision &&
        fresh.refs.get('refs/heads/main') === current.revision,
      'Git-состояние изменилось во время загрузки; публикация остановлена.',
    );
    requireState(
      !fresh.newest || compareVersions(current.tag, fresh.newest.tag_name) >= 0,
      'Во время загрузки опубликован более новый релиз.',
    );
    if (current.existing.draft) await github.publish(current.tag);
    const latest = await github.latest();
    requireState(
      latest.tag_name === current.tag && !latest.draft && !latest.prerelease,
      'Релиз не выбран как latest; проверьте состояние GitHub.',
    );
    const verifiedAssets = [];
    for (const asset of assets) {
      const digest = await (options.publicDigest ?? publicDigest)(
        asset.url,
        asset.size,
        trust.origins,
      );
      requireState(
        digest.size === asset.size && digest.sha256 === asset.sha256,
        'Публичное вложение не совпадает с подготовленным комплектом. Повторите publish после проверки GitHub.',
      );
      verifiedAssets.push({ name: asset.name, url: asset.url, ...digest });
    }
    const receipt = {
      schema: 1,
      tag: current.tag,
      revision: current.revision,
      assets: verifiedAssets,
    };
    validatePublicReceipt(
      receipt,
      manifest,
      assets.map(({ name, url, size, sha256 }) => ({
        name,
        url,
        size,
        sha256,
      })),
    );
    await save(path.join(directory, 'public-release.json'), receipt);
    return {
      tag: current.tag,
      revision: current.revision,
      published: true,
      publiclyVerified: true,
      assets: verifiedAssets.length,
    };
  }
  return { plan, prepare, publish };
}
