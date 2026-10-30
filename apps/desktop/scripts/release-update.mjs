import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { initializeKey, signDescriptor } from '../packaging/release-key.mjs';
import { captureBuildInputs } from '../packaging/build-inputs.mjs';
import {
  root,
  json,
  save,
  sha,
  targets,
  versionFromTag,
} from '../packaging/lib.mjs';
import {
  descriptorName,
  releaseDescriptor,
  validateTrust,
  validateAssets,
  validateShippingTrust,
  validatePublicReceipt,
  readCandidate,
} from '../packaging/release-contract.mjs';

const cache = path.join(root, '.cache/desktop-packaging');
const indexFile = path.join(cache, 'release-candidate.json');
const trustFile = path.join(root, 'apps/desktop/packaging/update-trust.json');
const run = (command, args, capture = false) => {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: capture ? 'pipe' : 'inherit',
  });
  if (result.error || result.status !== 0)
    throw new Error('Команда подготовки/проверки завершилась ошибкой');
  return result.stdout?.trim();
};
const packageCheck = (directory, historical = false) =>
  run(process.execPath, [
    'apps/desktop/scripts/verify-package.mjs',
    directory,
    ...(historical
      ? ['--inputs-snapshot', path.join(directory, 'build-inputs')]
      : []),
  ]);
async function keyEntry() {
  // Только sign/init-key обращаются к существующему Secret Service.
  const { Entry } = await import('@napi-rs/keyring');
  return new Entry('music-downloader.release.update-signing', 'current-user', {
    linux: { store: 'secret-service' },
  });
}
async function candidateIndex() {
  if (!existsSync(indexFile))
    throw new Error(
      'Нет реальных release-кандидатов. После фиксации кода и создания exact stable тега выполните prepare-release <tag>.',
    );
  const index = await json(indexFile);
  if (
    index.schema !== 1 ||
    !Array.isArray(index.candidates) ||
    !index.candidates.length ||
    index.candidates.length > 2
  )
    throw new Error('Неверный индекс release-кандидатов');
  const { newer } = await import('../dist/main/update/service.js');
  for (let position = 0; position < index.candidates.length; position++) {
    const current = versionFromTag(index.candidates[position].tag);
    if (
      current.includes('-') ||
      (position > 0 &&
        !newer(current, versionFromTag(index.candidates[position - 1].tag)))
    )
      throw new Error(
        'Индекс требует разные stable версии N и N+1 по возрастанию',
      );
  }
  return index;
}

/** STEP-060: локальная подготовка не создаёт тегов, коммитов или публикаций. */
try {
  if (process.platform !== 'linux') throw new Error('Требуется Linux');
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === 'init-key') {
    console.log(initializeKey(await keyEntry()));
  } else if (args.length === 2 && args[0] === 'sign') {
    const bytes = await readFile(args[1]);
    const { descriptorSchema } = await import('../dist/main/update/service.js');
    descriptorSchema.parse(JSON.parse(bytes.toString('utf8')));
    await writeFile(args[1] + '.sig', signDescriptor(await keyEntry(), bytes));
    console.log(
      'Описание подписано; приватный ключ остался в системном хранилище.',
    );
  } else if (args.length === 2 && args[0] === 'prepare-release') {
    const tag = args[1];
    if (versionFromTag(tag).includes('-'))
      throw new Error('Нужен stable тег без prerelease');
    const revision = run('git', ['rev-parse', 'HEAD'], true);
    if (
      run('git', ['rev-parse', `refs/tags/${tag}^{commit}`], true) !==
        revision ||
      run('git', ['status', '--porcelain'], true)
    )
      throw new Error('Нужны существующий exact HEAD тег и чистое дерево');
    const trust = await json(trustFile);
    validateTrust(trust);
    const index = existsSync(indexFile)
      ? await candidateIndex()
      : { schema: 1, candidates: [] };
    if (index.candidates.length === 2)
      throw new Error(
        'Индекс уже содержит N и N+1; сохраните evidence перед подготовкой следующей пары',
      );
    if (index.candidates.length) {
      const { newer } = await import('../dist/main/update/service.js');
      if (!newer(versionFromTag(tag), versionFromTag(index.candidates[0].tag)))
        throw new Error('Следующий кандидат должен быть новее N');
    }
    const directory = path.join(cache, tag);
    // Уже подготовленные байты одной версии не заменяются другой сборкой.
    if (existsSync(directory))
      throw new Error(
        'Каталог тега уже существует; используйте новый тег для новой сборки',
      );
    run(process.execPath, ['apps/desktop/scripts/package.mjs', '--tag', tag]);
    packageCheck(directory);
    const manifest = await json(path.join(directory, 'manifest.json'));
    await captureBuildInputs(
      path.join(directory, 'manifest.json'),
      root,
      path.join(directory, 'build-inputs'),
    );
    await validateShippingTrust(directory, manifest, trust);
    for (const target of targets) {
      const bytes = Buffer.from(
        JSON.stringify(releaseDescriptor(manifest, target), null, 2) + '\n',
      );
      const file = path.join(directory, descriptorName(target));
      await writeFile(file, bytes);
      run(process.execPath, [
        'apps/desktop/scripts/release-update.mjs',
        'sign',
        file,
      ]);
    }
    const assets = await validateAssets(directory, manifest, trust);
    await save(path.join(directory, 'release-assets.json'), assets);
    index.candidates.push({
      tag,
      revision,
      directory: path.relative(root, directory),
      manifestSha256: sha(
        await readFile(path.join(directory, 'manifest.json')),
      ),
    });
    await save(indexFile, index);
    console.log(
      'Локальный release-комплект проверен. Публикация требует отдельного действия владельца.',
    );
  } else if (args.length === 1 && args[0] === 'verify-release') {
    const index = await candidateIndex();
    const trust = await json(trustFile);
    for (const candidate of index.candidates) {
      versionFromTag(candidate.tag);
      const directory = path.resolve(root, candidate.directory);
      if (directory !== path.join(cache, candidate.tag))
        throw new Error('Неверный каталог release-кандидата');
      const manifest = await readCandidate(directory, candidate);
      if (
        run(
          'git',
          ['rev-parse', `refs/tags/${candidate.tag}^{commit}`],
          true,
        ) !== candidate.revision
      )
        throw new Error('Тег не соответствует revision кандидата');
      // Только прошлый revision использует связанный с manifest снимок: текущий сверяется с source.
      packageCheck(
        directory,
        candidate.revision !== run('git', ['rev-parse', 'HEAD'], true),
      );
      await validateShippingTrust(directory, manifest, trust);
      const assets = await validateAssets(directory, manifest, trust);
      const receipt = path.join(directory, 'public-release.json');
      if (existsSync(receipt))
        validatePublicReceipt(await json(receipt), manifest, assets);
      console.log(
        `Проверен локальный комплект ${candidate.tag}: 12 assets; публичная квитанция ${existsSync(receipt) ? 'сверена' : 'ещё не получена'}.`,
      );
    }
  } else
    throw new Error(
      'Команды: init-key, sign <descriptor>, prepare-release <tag>, verify-release',
    );
} catch (error) {
  // Исключения native keyring/сети не печатаются: они могут содержать секретные детали.
  const known = [
    'Нет реальных release-кандидатов.',
    'Нужны существующий exact HEAD',
    'Нужен stable',
    'Каталог тега уже',
    'Индекс уже',
    'Команды:',
    'Требуется Linux',
  ];
  console.error(
    known.some((prefix) => error.message?.startsWith(prefix))
      ? error.message
      : 'Подготовка/проверка недоступна. Проверьте exact stable тег, чистое дерево, production trust, комплект assets и системное хранилище Linux.',
  );
  process.exitCode = 1;
}
