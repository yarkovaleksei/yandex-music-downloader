# Разработка

Документ описывает фактический toolchain, созданный STEP-001 по ADR-001 (слои и границы) и ADR-008 (Yarn workspaces). CI описан в разделе «CI/CD» (STEP-002); подключение Electron preload потребует отдельного bundler-решения в последующем STEP.

## Prerequisites

- Node.js `>=22.13.0 <25` (поддерживаются Node.js 22 и 24 LTS; Node.js 25 и новее не поддерживаются, ADR-008). Для разработки рекомендуется Node.js 24 (`.nvmrc`).
- Corepack из состава Node.js и сетевой доступ к npm registry при первом скачивании Yarn.
- Yarn фиксируется в корневом `package.json`: `packageManager` = `yarn@4.18.1+sha512.<hash>`. Менять версию вручную не нужно: используйте Corepack.

Corepack при запуске сверяет версию и sha512-хеш архива из `packageManager`. Он не проверяет подписи Yarn (для Yarn 2 и новее подписи не проверяются), поэтому этот документ не заявляет такой защиты: гарантия ограничена хешем в `packageManager`.

## Local setup

```bash
corepack enable
yarn install --immutable
```

Если установка Node.js доступна только для чтения, глобальные shims не создаются, а используется временный каталог только для текущей сессии:

```bash
mkdir -p "$HOME/.local/corepack-bin"
corepack enable --install-directory "$HOME/.local/corepack-bin"
export PATH="$HOME/.local/corepack-bin:$PATH"
yarn install --immutable
```

Тот же Yarn без записи global shims и пользовательского кеша запускает обёртка (она же использована в канонической верификации STEP-001):

```bash
node packages/testing/scripts/run-yarn.mjs install --immutable
```

`yarn.lock` — отслеживаемый generated-файл: вручную его не форматируют и не правят. При изменении зависимостей запустите `yarn install` (без `--immutable`) в корне, проверьте diff `yarn.lock` и закоммитьте его вместе с `package.json`. Внутренние зависимости всегда объявляются как `workspace:*`. Другие lockfile (`package-lock.json`) и `.npmrc` не используются.

## Development commands

Команды выполняются из корня репозитория:

```bash
yarn run lint
yarn run typecheck
yarn run format:check
yarn test
yarn run build
yarn run format
```

- `yarn run lint` — два независимых прохода ESLint с `--max-warnings 0`: основной (`eslint.config.mjs`, качество кода) и архитектурный (`eslint.boundaries.config.mjs`, границы ADR-001) с `--no-inline-config`, поэтому директива в коде не снимает запрет границ.
- `yarn run typecheck` — `tsc -b` по root solution (`tsconfig.json`, project references всех пакетов) и отдельная non-composite программа `tsconfig.tests.json`, которая включает все тесты, конфигурации и tooling-файлы TypeScript.
- `yarn test` — Vitest, отдельный project на каждый workspace и project `tooling` для `eslint/**/*.test.ts`.
- `yarn run build` — `tsc -b`; результат в `dist/` каждого пакета (игнорируется Git).
- `yarn run format` / `yarn run format:check` — Prettier для `apps`, `packages`, `eslint`, корневых конфигураций, `.yarnrc.yml` и этого файла. Остальные документы, Harness и `planning/` не форматируются автоматически.

### Проверка provider на реальном API

Отдельный ручной suite проверяет публичный контракт Yandex provider. После `yarn install --immutable` и `yarn run build` задайте `PROVIDER_TEST_TOKEN` только в окружении текущего процесса и выполните `yarn run test:provider`. Имя script `test:provider` совместимо с npm; отдельная npm-установка для этого не требуется. Значение токена не записывайте в команды, файлы, fixtures или evidence.

Без токена или с пустым токеном команда печатает `PROVIDER_TEST: SKIP TOKEN_MISSING`, завершается с кодом 0 и не загружает provider и не обращается к сети. С токеном она проверяет account, track, album, собственный playlist и audio variants; любая ошибка конфигурации или контракта завершается с ненулевым кодом и безопасными `stage` и `code`. По завершении provider очищает только test-only credentials в памяти.

По умолчанию используются track `2224197`, album `221173` и playlist `users/<account>/playlists/1000`. Для разрешённых аккаунту ресурсов можно задать не секретные `PROVIDER_TEST_TRACK_ID`, `PROVIDER_TEST_ALBUM_ID` и `PROVIDER_TEST_PLAYLIST_ID`; допустимы числовые ID track/album и UUID или `users/<encoded-owner>/playlists/<number>` для playlist. `yarn test` остаётся offline, не требует токена и не запускает этот suite; PR CI также его не запускает.

## Workspace

Workspace-пакеты (все `private`, ESM): `@music-downloader/shared`, `@music-downloader/core-downloader`, `@music-downloader/core-planner`, `@music-downloader/core-queue`, `@music-downloader/core-retry`, `@music-downloader/core-manifest`, `@music-downloader/core-filesystem`, `@music-downloader/core-validation`, `@music-downloader/provider-yandex-music`, `@music-downloader/metadata`, `@music-downloader/persistence`, `@music-downloader/application`, `@music-downloader/logging`, `@music-downloader/testing`, `@music-downloader/cli`. Всего 15; каталоги — `packages/shared`, `packages/core/*`, `packages/providers/yandex-music`, `packages/metadata`, `packages/persistence`, `packages/application`, `packages/logging`, `packages/testing`, `apps/cli`. STEP-003 добавил доменные типы, безопасные ошибки и контракт `MusicProvider` в `shared`, а также mock provider и fixtures в `testing`. Остальные production-пакеты пока содержат каркасы; STEP-005/006 завершили исследования и архитектурные решения, а не реализацию provider или авторизации. CLI-команд и desktop на этом этапе нет.

Каждый пакет экспортирует `src/index.ts` под условием `@music-downloader/source` и `dist/index.js` по умолчанию. TypeScript (`customConditions`) и Vitest (`resolve`/`ssr` conditions) используют условие `source`, поэтому тесты и typecheck не зависят от предварительной сборки `dist`.

## Границы зависимостей

Единый источник таблицы — `eslint/boundaries.config.mjs`; исполняет её локальный плагин `eslint/boundaries-plugin.mjs` (правила `boundaries/dependency`, `boundaries/external`, `boundaries/bypass`). Проверяются все `ts/tsx/mts/cts/js/mjs/cjs`: статические и динамические импорты, `require`, `import x = require()`, `import('x').T`, re-export, относительные и deep-импорты в другие пакеты. Вычисляемые specifier-ы и `createRequire` запрещены целиком (fail-closed), будущие пакеты закрыты по умолчанию.

Разбор specifier-ов fail-closed: относительный путь, ведущий в `node_modules`, отображается на имя пакета (сегмент после последнего `node_modules/`) и проходит те же проверки workspace/external (Yandex SDK, запрещённые модули, чистота `shared`); относительный путь за пределы корня репозитория или всех workspace-пакетов, абсолютные пути, URL-схемы (`file:`, `data:`, `http:`, `https:` и любые другие, кроме `node:`), `#`-imports, относительные specifier-ы с `?`, `#` или `%` (Node отбрасывает query/fragment и декодирует `%2e`, поэтому их нельзя классифицировать как обычный путь), обратные слеши и `..` внутри «голого» specifier запрещены правилом `boundaries/bypass`. Также запрещены `require` не в форме прямого вызова (`const r = require`), `module.require`, любые `createRequire` (включая деструктурирование и `m['createRequire']`). В `packages/shared` запрещены и ambient-объявления I/O-имён (`declare const|let|var`, `declare function|class|enum|namespace|module`, в том числе внутри `declare global`), поэтому `declare const process` обход не даёт.

Обязательства ADR/PRN:

| Источник                                             | Разрешено                                                                                                                                                              |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/*` (ADR-001 п.1)                               | `application`; `shared` только type-only (`import type`/`export type`)                                                                                                 |
| `application` (п.2)                                  | `shared`, `core/*`, provider, `metadata`, `persistence`, `logging`; без `electron` и native-модулей SQLite/secure storage (их передаёт клиент через `runtimeAdapters`) |
| `core/*` (п.3)                                       | `shared`; `filesystem`, `retry`, `manifest`, `validation` не зависят от `downloader` и `queue`; без `electron` и `react`                                               |
| provider, `metadata`, `persistence`, `logging` (п.4) | только `shared`, без `core/*` и друг друга                                                                                                                             |
| `shared` (п.5)                                       | ничего: без Node built-ins (с `node:` и без), сторонних зависимостей и I/O-глобалов (`process`, `fetch`, `window`, `indexedDB`, `globalThis`/`self` и т. п.)           |
| `testing` (п.6)                                      | только `shared`                                                                                                                                                        |
| `@dvxch/yandex-music` (PRN-001)                      | только `packages/providers/yandex-music`, любые src/test-файлы и subpaths                                                                                              |

Локальные ужесточения STEP-001 (не требования ADR): `core/planner` не зависит от `downloader` и `queue`; в `core` запрещены также `react-dom`, `@mui/*` и native-модули (`better-sqlite3`, `sqlite3`, `keytar`, `@napi-rs/keyring`, `electron-store`); в `application` запрещены `react`, `react-dom`, `@mui/*`; `testing` доступен только тестовым файлам `packages/**` кроме `shared`, а `apps/**` (включая их тесты) его не получают. Неизвестный native-модуль в `core`/`application` остаётся документированным остаточным риском: список запрещённых модулей — явный.

Тестовыми считаются файлы `*.test.*`, `*.spec.*` и каталоги `test`, `tests`, `__tests__`, `e2e`, `fixtures` — определение одно (`eslint/boundaries.config.mjs`), из него развёрнуты tsconfig-списки, а `eslint/consistency.test.ts` проверяет их согласованность.

`packages/shared` собирается с `lib: ES2023` без DOM и `types: []`. Нужные чистые web-API (`AbortController`/`AbortSignal`, `URL`/`URLSearchParams`, `TextEncoder`/`TextDecoder`, `ReadableStream`) описаны точечными ambient-типами в `packages/shared/src/web-platform.d.ts`; новые I/O-глобалы туда не добавляются.

## Качество кода

Основной проход ESLint: `typescript-eslint` recommended, `no-explicit-any`, `ban-ts-comment` (с описанием), `consistent-type-imports`, `no-import-type-side-effects`, `reportUnusedDisableDirectives`; директивы допускаются только как `eslint-disable-next-line` с описанием после `--`. Для production-файлов `packages/**/src` и `apps/*/src` (кроме тестовых globs) включены type-aware `no-unsafe-*` правила. Обоснованный `any`:

```ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- причина
```

Boundary-проход директивы не принимает вообще. ESLint и Prettier игнорируют `.cache/**`, `.yarn/**`, `dist`, `coverage`, `node_modules`.

## Testing

Тесты лежат рядом с кодом (`src/*.test.ts`): smoke-тесты проверяют каркасы пакетов, а тесты `shared` и `testing` — доменные ошибки, контракт `MusicProvider` и mock provider из STEP-003. `eslint/*.test.ts` проверяют toolchain: границы (`boundaries.test.ts`, независимый oracle по ADR-001), strict-контракт (`strict.test.ts`), качество (`quality.test.ts`), согласованность конфигураций (`consistency.test.ts`).

## Воспроизводимая проверка STEP-001

Скрипты в `packages/testing/scripts/` принадлежат STEP-001 (toolchain) и не содержат зависимостей:

- `run-yarn.mjs` — запуск `corepack yarn` с проверкой диапазона Node.js и Corepack-кешем в `.cache/corepack` рабочей копии;
- `verify-toolchain.mjs` — Node, `packageManager` (sha512), `.yarnrc.yml`, отсутствие npm-артефактов, фактический Yarn;
- `verify-step-001.mjs` — чистые копии для Node.js 22.13.0 и 24: `corepack enable --install-directory <tmp-bin>`, immutable install, lint/test/typecheck/format:check/build, негативные boundary-проверки, mismatch `yarn.lock` и недоступный workspace;
- `verify-step-001-manual.sh` — обёртка для ручного запуска.

Требования и ограничения: нужны `nvm` с уже установленными Node.js 22.13.0 и 24 (`nvm install` скрипты не вызывают; при отсутствии версии результат FAIL с причиной) и доступ к npm registry. Проверка выполнена на Linux; Windows (запуск Corepack как `corepack.cmd` через shell) и macOS не проверялись локально; платформенную матрицу выполняет CI (STEP-002): Windows и macOS проверены им, результат зафиксирован в Evidence STEP-002.

## Environment / configuration

`.yarnrc.yml`: `nodeLinker: node-modules`; `enableGlobalCache`, `enableMirror`, `enableTelemetry` выключены; `cacheFolder: .yarn/cache`, `globalFolder: .cache/yarn/global` — всё состояние Yarn внутри рабочей копии и в `.gitignore`. Пакеты scope `@music-downloader` привязаны к `https://registry.invalid/`: отсутствующий workspace не резолвится через публичный registry (обязательство ADR-008). `supportedArchitectures` перечисляет Linux/macOS/Windows, x64/arm64, glibc/musl, чтобы `yarn.lock` содержал platform-specific optional dependencies; установка и тесты проверены на Linux, Windows и macOS в CI.

## Database / migrations

Не применимо до появления persistence.

## CI/CD

Workflow `.github/workflows/ci.yml` (STEP-002) запускается на `pull_request` в `main` и на `push` в `main`. Права — только `contents: read`, secrets не используются. Устаревшие запуски PR отменяются; запуск для `main` новым push не отменяется, но ожидающий в очереди запуск GitHub может заменить более новым, поэтому не каждый промежуточный merge commit гарантированно проверяется отдельно. Все actions закреплены полными SHA, runner images — конкретными версиями (`ubuntu-24.04`, `windows-2025`, `macos-15`).

- Job `quality` (Ubuntu, Node.js 24): `install --immutable`, `lint`, `typecheck`, `format:check`, `build`. Провал любого шага роняет job.
- Job `test` — матрица ОС (`ubuntu-24.04`, `windows-2025`, `macos-15`) × Node.js (`22.13.0` — нижняя граница `engines`, и `24`), `fail-fast: false`. Каждый вариант выполняет `install --immutable` и `test`; один и тот же набор Vitest (unit и integration) идёт на всех ОС, чтобы особенности файловой системы выявлялись рано. Сборка выполняется один раз в `quality`: тесты не требуют `dist`.
- Установка и запуск везде идут через `node packages/testing/scripts/run-yarn.mjs`, без зависимости от глобальных shims Corepack.
- Кэш (`actions/cache`): `.yarn/cache` и `.cache/corepack`, ключ из ОС, версии Node.js и хеша `yarn.lock`. Встроенный кэш `setup-node` не используется, потому что он требует Yarn в `PATH` до установки.
- Offline-тест `packages/providers/yandex-music/test-live/runner.test.mjs` (`node:test`) не входит в `yarn test` и в CI не запускается; при изменении этого каталога запускайте его вручную: `node --test packages/providers/yandex-music/test-live/runner.test.mjs`.
- Live-тесты provider в CI не запускаются и токены не передаются: они выполняются вручную (см. «Проверка provider на реальном API»).
- Harness Integrity workflow остаётся отдельным и этим STEP не изменяется.

Локальное воспроизведение: `yarn install --immutable`, `yarn run lint`, `yarn run typecheck`, `yarn run format:check`, `yarn run build`, `yarn test`.

Идентификаторы jobs (`quality`, `test`) стабильны; для branch protection используйте отображаемые имена checks: `Quality` и `Test (<ОС>, Node.js <версия>)` (6 вариантов). сама защита ветки настраивается вне репозитория. Release CI, сборки desktop и публикация артефактов относятся к последующим STEP.

## Git и CI

Repository Git workflow задаётся `.harness/docs/GIT_WORKFLOW.md` и `.harness/git-policy.toml`. Harness Integrity CI является baseline; product CI (`ci.yml`) описан в разделе «CI/CD».
