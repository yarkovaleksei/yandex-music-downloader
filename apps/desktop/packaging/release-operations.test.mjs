import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { generateKeyPairSync, sign } from 'node:crypto';
import { existsSync } from 'node:fs';
import {
  createReleaseOperations,
  compareVersions,
  githubClient,
  publicDigest,
  ReleaseError,
  runCommand,
  repository,
} from './release-operations.mjs';
import {
  descriptorName,
  releaseBase,
  releaseDescriptor,
  readReleaseCandidates,
} from './release-contract.mjs';
import { sha, targets } from './lib.mjs';

/** Настоящий Git работает только во временной копии; GitHub, ключ и пакеты полностью изолированы. */
async function fixture(action) {
  const temporary = await mkdtemp(path.join(tmpdir(), 'ymd-publishing-'));
  const cwd = path.join(temporary, 'product');
  const origin = path.join(temporary, 'origin.git');
  await mkdir(cwd);
  const git = (...args) => runCommand('git', args, { cwd });
  await git('init', '--initial-branch=main');
  await git('config', 'user.name', 'Проверка релизов');
  await git('config', 'user.email', 'release-test@example.invalid');
  await writeFile(path.join(cwd, '.gitignore'), '.cache/\n');
  const pair = generateKeyPairSync('ed25519');
  const trust = {
    feedBaseUrl: releaseBase + 'latest/download/',
    channel: 'stable',
    publicKey: pair.publicKey
      .export({ type: 'spki', format: 'pem' })
      .toString(),
    origins: [
      'https://github.com',
      'https://release-assets.githubusercontent.com',
    ],
  };
  await mkdir(path.join(cwd, 'apps/desktop/packaging'), { recursive: true });
  await writeFile(
    path.join(cwd, 'apps/desktop/packaging/update-trust.json'),
    JSON.stringify(trust),
  );
  await git('add', '.');
  await git('commit', '-m', 'Начальное состояние продукта');
  await runCommand('git', ['init', '--bare', origin], { cwd });
  await git('remote', 'add', 'origin', origin);
  await git('push', 'origin', 'main');
  await mkdir(path.join(cwd, '.cache'), { recursive: true });
  const notes = path.join(cwd, '.cache/notes.md');
  await writeFile(notes, 'Первый выпуск продукта.\n');
  const calls = [];
  const releases = [];
  const bytes = new Map();
  let nextId = 1;
  let builds = 0;
  let failUpload = false;
  let failPublic = false;
  const github = {
    releases: async () => structuredClone(releases),
    assets: async (release) =>
      structuredClone(releases.find((item) => item.id === release.id).assets),
    create: async (tag, version, file) => {
      calls.push(['create', tag]);
      releases.push({
        id: nextId++,
        tag_name: tag,
        name: `Yandex Music Downloader ${version}`,
        body: await readFile(file, 'utf8'),
        draft: true,
        prerelease: false,
        assets: [],
      });
    },
    upload: async (tag, file) => {
      if (
        failUpload &&
        calls.filter(([call]) => call === 'upload').length === 3
      ) {
        releases
          .find((item) => item.tag_name === tag)
          .assets.push({
            id: nextId++,
            name: path.basename(file),
            size: 0,
            state: 'starter',
          });
        throw new ReleaseError('Сбой тестовой сети');
      }
      const content = await readFile(file);
      const asset = {
        id: nextId++,
        name: path.basename(file),
        size: content.length,
        state: 'uploaded',
      };
      calls.push(['upload', asset.name]);
      releases.find((item) => item.tag_name === tag).assets.push(asset);
      bytes.set(asset.id, content);
    },
    removeIncomplete: async (asset) => {
      calls.push(['removeIncomplete', asset.name]);
      const release = releases.find((item) =>
        item.assets.some((entry) => entry.id === asset.id),
      );
      assert(release.draft && asset.state === 'starter' && asset.size === 0);
      release.assets = release.assets.filter((entry) => entry.id !== asset.id);
    },
    digest: async (asset) => ({
      size: bytes.get(asset.id).length,
      sha256: sha(bytes.get(asset.id)),
    }),
    publish: async (tag) => {
      calls.push(['publish', tag]);
      const release = releases.find((item) => item.tag_name === tag);
      assert.equal(release.assets.length, 12);
      release.draft = false;
    },
    latest: async () =>
      releases
        .filter((item) => !item.draft)
        .sort((a, b) => compareVersions(b.tag_name, a.tag_name))[0],
  };
  const operations = createReleaseOperations({
    cwd,
    github,
    run: (command, args, options) => {
      calls.push([command, ...args]);
      // Проверяется реальный локальный origin; наружу он представляется каноническим GitHub URL.
      if (command === 'git' && args.join(' ') === 'remote get-url origin')
        return Promise.resolve(`git@github.com:${repository}.git`);
      return runCommand(command, args, options);
    },
    prepareBundle: async (tag) => {
      builds++;
      const directory = path.join(cwd, '.cache/desktop-packaging', tag);
      await mkdir(directory, { recursive: true });
      const manifest = {
        tag,
        version: tag.slice(1),
        gitHead: await git('rev-parse', 'HEAD'),
        local: false,
        published: false,
        targets: {},
      };
      for (const target of targets) {
        const artifact = `${target}/music-downloader-${tag.slice(1)}-${target}.${target === 'linux-x64' ? 'AppImage' : 'zip'}`;
        const content = Buffer.from('Пакет ' + tag + ' ' + target);
        await mkdir(path.dirname(path.join(directory, artifact)), {
          recursive: true,
        });
        await writeFile(path.join(directory, artifact), content);
        manifest.targets[target] = {
          artifact,
          bytes: content.length,
          sha256: sha(content),
        };
        const descriptor = Buffer.from(
          JSON.stringify(releaseDescriptor(manifest, target)),
        );
        await writeFile(
          path.join(directory, descriptorName(target)),
          descriptor,
        );
        await writeFile(
          path.join(directory, descriptorName(target) + '.sig'),
          sign(null, descriptor, pair.privateKey),
        );
      }
      const manifestBytes = Buffer.from(JSON.stringify(manifest));
      await writeFile(path.join(directory, 'manifest.json'), manifestBytes);
      await writeFile(
        path.join(directory, 'release-candidate.json'),
        JSON.stringify({
          schema: 1,
          tag,
          revision: manifest.gitHead,
          directory: path.relative(cwd, directory),
          manifestSha256: sha(manifestBytes),
        }),
      );
    },
    publicDigest: async (url) => {
      if (failPublic)
        throw new ReleaseError('Публичная загрузка временно недоступна');
      const name = decodeURIComponent(new URL(url).pathname.split('/').at(-1));
      const tag = new URL(url).pathname.split('/').at(-2);
      const asset = releases
        .find((item) => item.tag_name === tag)
        .assets.find((item) => item.name === name);
      return github.digest(asset);
    },
  });
  try {
    await action({
      cwd,
      git,
      notes,
      calls,
      releases,
      bytes,
      operations,
      builds: () => builds,
      failUpload: (value) => {
        failUpload = value;
      },
      failPublic: (value) => {
        failPublic = value;
      },
    });
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

test('первый план предлагает 0.2.0 и не создаёт тегов или релизов; грязное дерево допустимо только для плана', async () => {
  await fixture(async ({ cwd, git, notes, operations, releases, calls }) => {
    await writeFile(path.join(cwd, 'изменение.txt'), 'Незавершённая работа');
    const plan = await operations.plan();
    assert.equal(plan.version, '0.2.0');
    assert.equal(plan.firstRelease, true);
    assert.equal(plan.previousTag, null);
    assert.equal(plan.commits.length, 1);
    assert.equal(plan.workingTreeClean, false);
    await assert.rejects(operations.prepare('0.2.0', notes), /чистого дерева/);
    assert.equal(await git('tag', '--list'), '');
    assert.equal(releases.length, 0);
    assert(
      !calls.some(
        ([command, argument]) => command === 'git' && argument === 'push',
      ),
    );
  });
});

test('prepare создаёт только локальный аннотированный тег и повторно использует те же подписанные пакеты', async () => {
  await fixture(async ({ git, notes, operations, releases, builds }) => {
    const result = await operations.prepare('0.2.0', notes);
    assert.equal(result.reused, false);
    assert.equal(await git('cat-file', '-t', 'v0.2.0'), 'tag');
    assert.equal(await git('ls-remote', '--tags', 'origin'), '');
    assert.equal(releases.length, 0);
    assert.equal((await operations.prepare('0.2.0', notes)).reused, true);
    assert.equal(builds(), 1);
  });
});

test('publish продолжает прерванную загрузку draft и проверяет публичные байты всех 12 вложений', async () => {
  await fixture(
    async ({ cwd, notes, operations, calls, releases, failUpload }) => {
      await operations.prepare('0.2.0', notes);
      failUpload(true);
      await assert.rejects(operations.publish('0.2.0'), /Сбой тестовой сети/);
      assert.equal(releases[0].draft, true);
      assert.equal(releases[0].assets.length, 4);
      assert.equal(
        releases[0].assets.filter((asset) => asset.state === 'starter').length,
        1,
      );
      assert(!calls.some(([call]) => call === 'publish'));
      failUpload(false);
      assert.equal((await operations.publish('0.2.0')).publiclyVerified, true);
      assert.equal(
        calls.filter(([call]) => call === 'removeIncomplete').length,
        1,
      );
      assert.equal(calls.filter(([call]) => call === 'create').length, 1);
      assert.equal(calls.filter(([call]) => call === 'upload').length, 12);
      assert.equal(calls.filter(([call]) => call === 'publish').length, 1);
      const receipt = JSON.parse(
        await readFile(
          path.join(cwd, '.cache/desktop-packaging/v0.2.0/public-release.json'),
        ),
      );
      assert.equal(receipt.assets.length, 12);
      assert(
        receipt.assets.every((asset) =>
          asset.url.startsWith(releaseBase + 'download/v0.2.0/'),
        ),
      );
    },
  );
});

test('после сбоя анонимной проверки повторный publish не меняет опубликованный релиз', async () => {
  await fixture(async ({ cwd, notes, operations, calls, failPublic }) => {
    await operations.prepare('0.2.0', notes);
    failPublic(true);
    await assert.rejects(operations.publish('0.2.0'), /Публичная загрузка/);
    assert(
      !existsSync(
        path.join(cwd, '.cache/desktop-packaging/v0.2.0/public-release.json'),
      ),
    );
    failPublic(false);
    await operations.publish('0.2.0');
    assert.equal(calls.filter(([call]) => call === 'publish').length, 1);
    assert.equal(calls.filter(([call]) => call === 'upload').length, 12);
  });
});

test('повреждённое вложение draft не заменяется автоматически и не публикуется', async () => {
  await fixture(
    async ({ notes, operations, releases, bytes, calls, failUpload }) => {
      await operations.prepare('0.2.0', notes);
      failUpload(true);
      await assert.rejects(operations.publish('0.2.0'));
      failUpload(false);
      const asset = releases[0].assets[0];
      const altered = Buffer.from(bytes.get(asset.id));
      altered[0] ^= 1;
      bytes.set(asset.id, altered);
      await assert.rejects(operations.publish('0.2.0'), /SHA-256/);
      assert.equal(releases[0].draft, true);
      assert.equal(calls.filter(([call]) => call === 'upload').length, 3);
    },
  );
});

test('публикация отклоняет изменённое описание, подпись пакета и неопубликованный commit', async () => {
  await fixture(async ({ cwd, git, notes, operations, calls }) => {
    await operations.prepare('0.2.0', notes);
    const directory = path.join(cwd, '.cache/desktop-packaging/v0.2.0');
    await writeFile(path.join(directory, 'notes.md'), 'Подмена');
    await assert.rejects(operations.publish('0.2.0'), /Описание изменилось/);
    await writeFile(path.join(directory, 'notes.md'), await readFile(notes));
    await writeFile(
      path.join(directory, descriptorName(targets[0]) + '.sig'),
      Buffer.alloc(64),
    );
    await assert.rejects(operations.publish('0.2.0'));
    assert(!calls.some(([call]) => call === 'create'));
    await writeFile(path.join(cwd, 'новое.txt'), 'Изменение');
    await git('add', '.');
    await git('commit', '-m', 'Новый неопубликованный commit');
    await assert.rejects(operations.publish('0.2.0'), /main на GitHub/);
  });
});

test('три последовательных выпуска независимы; предыдущий релиз выбирается среди опубликованных stable, а не по локальным тегам', async () => {
  await fixture(async ({ cwd, git, notes, operations, releases }) => {
    for (const version of ['0.2.0', '0.2.1', '0.3.0']) {
      await operations.prepare(version, notes);
      await operations.publish(version);
      await writeFile(path.join(cwd, 'версия.txt'), version);
      await git('add', '.');
      await git('commit', '-m', `Изменения после ${version}`);
      await git('push', 'origin', 'main');
    }
    await git('tag', 'v99.0.0');
    releases.push({
      id: 9999,
      tag_name: 'v100.0.0',
      draft: true,
      prerelease: false,
    });
    const plan = await operations.plan();
    assert.equal(plan.previousTag, 'v0.3.0');
    assert.equal(plan.version, '0.3.1');
    assert.equal(plan.commits.length, 1);
    assert.equal(
      (await readReleaseCandidates(path.join(cwd, '.cache/desktop-packaging')))
        .length,
      3,
    );
    assert.equal(
      (
        await readReleaseCandidates(
          path.join(cwd, '.cache/desktop-packaging'),
          'v0.2.1',
        )
      ).length,
      1,
    );
    await assert.rejects(operations.prepare('0.2.9', notes), /выше последнего/);
  });
});

test('публичная загрузка следует только доверенным HTTPS origins и не использует авторизацию', async () => {
  const content = Buffer.from('Публичный пакет');
  const origins = [
    'https://github.com',
    'https://release-assets.githubusercontent.com',
  ];
  const requests = [];
  const fetcher = async (url, options) => {
    requests.push({ url, options });
    return requests.length === 1
      ? new Response(null, {
          status: 302,
          headers: { location: origins[1] + '/asset?signature=test-only' },
        })
      : new Response(content);
  };
  assert.deepEqual(
    await publicDigest(origins[0] + '/asset', content.length, origins, fetcher),
    { size: content.length, sha256: sha(content) },
  );
  assert(
    requests.every(
      ({ options }) => !options.headers && options.redirect === 'manual',
    ),
  );
  await assert.rejects(
    publicDigest(
      origins[0] + '/asset',
      content.length,
      origins,
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: 'http://other.invalid/asset' },
        }),
    ),
    /недоверенный/,
  );
  await assert.rejects(
    publicDigest(
      origins[0] + '/asset',
      1,
      origins,
      async () => new Response(content),
    ),
    /превышает/,
  );
});

test('GitHub CLI получает явный репозиторий, draft, verify-tag и notes-file; загрузка не использует clobber', async () => {
  const commands = [];
  const github = githubClient(async (command, args) => {
    commands.push([command, ...args]);
    return args.includes('--slurp') ? '[[],[]]' : '';
  });
  assert.deepEqual(await github.releases(), []);
  await github.create('v0.2.0', '0.2.0', '/tmp/описание.md');
  await github.upload('v0.2.0', '/tmp/пакет.zip');
  await github.publish('v0.2.0');
  assert(
    commands[1].includes('--verify-tag') &&
      commands[1].includes('--draft') &&
      commands[1].includes('--notes-file'),
  );
  assert(commands.slice(1).every((args) => args.includes(repository)));
  assert(!commands.some((args) => args.includes('--clobber')));
});
