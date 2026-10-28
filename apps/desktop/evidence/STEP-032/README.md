# STEP-032 — визуальная проверка и действия пользователя

Проверено 2026-10-28 на Linux x64 через Playwright CLI и headless Google Chrome. Собраны фактические renderer-компоненты приложения и локальные Inter 400/600/700; DesktopApi заменён синтетической fixture. Аккаунт, музыка и пути вымышлены, реальные provider, credentials, SQLite владельца и аудиофайлы стенд не использует.

## Сверка с макетами

| Вход | Результат | Наблюдение |
|---|---|---|
| Макет 04 | [04-history.png](04-history.png) | Sidebar, таблица названия/типа/count/size/date, поиск, фильтры и действия читаемы. Legacy запись показывает неизвестный размер и явный отказ повторной загрузки. |
| Макет 05 | [05-settings-saved.png](05-settings-saved.png) | Настройки output/quality/concurrency/presets/overwrite/FFmpeg/logging, явное сохранение и подсказка перезапуска; кнопка доступна обычной прокруткой. |
| Макет 06 | [06-account.png](06-account.png) | Состояние, фактические доступные name/id и выход. Данные подписки и региона не выдуманы. |
| Doctor DTO | [06-diagnostics-errors.png](06-diagnostics-errors.png) | Все переданные проверки: успешные, API_CHANGED, пропущенные и необязательная ошибка FFmpeg различимы. |

Сверены структура, брендовая палитра, отступы, читаемость и состояния. Попиксельное совпадение с иллюстративными макетами не заявляется. Обложки истории не добавлены при отсутствии соответствующего сохранённого DTO. Viewport: History и начальные Settings — 1440×1000; Settings после сохранения, Account и Diagnostics — 1440×1200. На меньшей высоте Settings прокручиваются.

## Пройденные действия

- History: поиск «Сияй» и фильтр «Трек» оставляют одну запись — screenshots `04-history-search.png` / `04-history-filter.png`, соответствующие YAML snapshots. «Открыть папку» вызывает mock API. «Скачать снова» создаёт новый synthetic job и переводит на Downloads: [04-history-replay.png](04-history-replay.png). «Убрать из истории» уменьшает число записей с 3 до 2: [04-history-hidden.png](04-history-hidden.png). У legacy кнопка повтора отключена с объяснением.
- Settings: выбраны синтетические output и FFmpeg через opaque refs, включена замена файлов, concurrency изменена 4→2, нажато «Сохранить настройки». После reload renderer и повторного открытия Settings значения сохранены: [05-settings-reloaded.png](05-settings-reloaded.png). Fixture использует localStorage только для воспроизведения backend; реальную SQLite/restart семантику доказывают application/persistence integration tests текущего STEP.
- Account: mock logout меняет основной экран и sidebar на состояние «Аккаунт не подключён»: [06-account-logged-out.png](06-account-logged-out.png). Реальный токен пользователя не удалялся. Удаление credential проверяется только mock secure store в тестах.
- Diagnostics: повтор меняет время 15:00→15:05: [06-diagnostics-refreshed.png](06-diagnostics-refreshed.png). Отдельный ответ API_CHANGED/DEPENDENCY_FAILED показан без общего ложного успеха. При ошибке refresh остаются прежние время/результат с явным «Проверка не обновлена»: [06-diagnostics-refresh-error.png](06-diagnostics-refresh-error.png).
- Пустые состояния сохранены: [04-history-empty.png](04-history-empty.png), [06-diagnostics-empty.png](06-diagnostics-empty.png).

Во время browser-прогона ошибок приложения не наблюдалось; единственная ошибка сети — отсутствующий favicon HTTP 404. Отсутствующие подписи первых двух кнопок в отдельных accessibility snapshots оказались особенностью snapshot: скриншот подтверждает видимые «Главная» и «Загрузки», исходный код/компонентные тесты подтверждают названия; гипотеза дефекта отброшена.

## Границы доказательства

Browser fixture подтверждает пользовательскую поверхность и wiring. Нативные диалоги/файловый менеджер, доступность системного keyring и другие ОС этим прогоном не квалифицируются. Host authority, schema rejection, SQLite migration/backup/version guards, exact replay и неизменность fixture-аудиокаталога проверяются отдельными тестами текущего STEP. Packaging и платформенная квалификация остаются вне scope.

Описание `yarn run desktop` в `docs/development.md` сверено с поставленной поверхностью: шесть экранов, history actions/legacy limitation, persistent settings/restart hint, account и diagnostics refresh. Packaging, platform qualification, keyring namespace и соседние описания сохранены.

## Воспроизведение

Скопировать `visual-fixture.txt` в `.harness/local/tmp/<execution>/visual.tsx`, `visual-index.txt` — в соседний `visual/index.html`. Из корня проекта:

```bash
node_modules/.bin/esbuild .harness/local/tmp/<execution>/visual.tsx --bundle --format=esm --platform=browser --jsx=automatic --loader:.woff2=file --loader:.woff=file '--asset-names=assets/[name]-[hash]' --outfile=.harness/local/tmp/<execution>/visual/app.js
python3 -m http.server 8770 --bind 127.0.0.1 --directory .harness/local/tmp/<execution>/visual
```

Сценарии: `/?scenario=normal`, `diagnostic-errors`, `refresh-error`, `empty`, `loggedout`. Сохранённые значения fixture очищаются удалением localStorage этого локального origin. Скриншоты снимаются после открытия соответствующего раздела через навигацию; действия фиксируются в YAML. SHA-256 артефактов — в `visual-evidence.json`.


## Исправление замечаний первичного ревью

Источник: `planning/reviews/STEP-032/REVIEW-20261028T200732Z.md`.

- F-001: безопасная валидация snapshot согласована с каноническими opaque ID provider-а. Application regression tests проверяют создание новых CLI/desktop заданий для `users/Owner/playlists/7`, owner с percent encoding и `lk.UUID`; исходный ID сохраняется без преобразования. Browser fixture не подменяет эту проверку provider/application границы.
- F-002: после отказа replay экран History остаётся смонтированным, App перечитывает очередь, предупреждение остаётся видимым. Успех по-прежнему переводит на Downloads; повторной mutation нет. Реальный App проверяется компонентными regression tests.
- После FIX отдельно пройден Chrome-сценарий `/?scenario=replay-error`: «Скачать снова» возвращает синтетический OUTCOME_UNKNOWN, видны History и «Исход операции неизвестен. Состояние перечитано; проверьте загрузки перед повторным запуском». Скриншот [04-history-replay-outcome-unknown.png](04-history-replay-outcome-unknown.png) и YAML сохраняют результат. Остальные screenshots относятся к ранее проверенным неизменённым экранам.
- Fixture дополнена только воспроизведением этого отказа; executable opaque ref приведён к фактическому префиксу `exe:`. Проверка нативных диалогов этим не заявляется.
