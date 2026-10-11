# STEP-041 — Browser evidence

Проверка выполнена 2026-10-11 через Playwright CLI и Chrome. Использовался только синтетический challenge: код `ABCD–EFGH`, hostname `ya.ru`, lifetime 300 секунд. Live OAuth, реальные credentials и challenge не использовались.

## Сборка и доставка

`node packages/testing/scripts/run-yarn.mjs build` завершился с exit code 0. Каталог provider `dist` скопирован в `/tmp/step041-built-provider`; fixture `node /tmp/step041-browser-fixture.mjs` импортировал оттуда `auth-browser.js` и выполнялся с cwd `/tmp`. Таким образом, runtime не обращался к исходному `docs` и корню репозитория. PNG/favicon вернули HTTP 200, `image/png`, 1 348 273 байта; HTTP unit test также сравнивает их с исходной иконкой побайтно.

## Визуальная сверка

- [desktop.png](desktop.png) — viewport 1448 × 1086. Сохранены шапка, вступление, основная карточка слева, инструкция и информационная карточка справа, footer. Цвета и основные действия соответствуют брендбуку; PNG не изменён, пропорции сохранены.
- [mobile.png](mobile.png) — viewport 640 × 900; [mobile-full.png](mobile-full.png) — полный документ при той же ширине. Одна колонка, `scrollWidth = innerWidth = 640`; инструкция начинается после основной карточки, действия находятся внутри viewport по горизонтали. Нижние блоки доступны вертикальной прокруткой.

Обоснованные отличия от макета: Inter не загружается извне, поэтому Chrome использует системный fallback и метрики текста немного отличаются. Фон без декоративного градиента, CTA без тяжёлой тени; используются точные цвета и умеренные тени брендбука. Заголовок и компоновка следуют макету. Шапка на узком окне переносит служебные подписи; инструкция уходит под карточку. Таймер и progress в screenshots показывают синтетический deadline, зафиксированный browser clock для воспроизводимого кадра, а не новый срок при загрузке.

## Действия и lifecycle

Playwright CLI `run-code` завершился с exit code 0 и вернул `status: PASS`. [browser-observations.json](browser-observations.json) содержит сохранённый результат и дополнительные наблюдения:

- Native clipboard success: после Enter на кнопке получен актуальный код и текст «Код скопирован». `NotAllowedError` смоделирован для проверки отказа; показано сообщение с ручным копированием, double-click выделяет весь код.
- Tab последовательно фокусирует копирование, внешний переход и отмену. Focus имеет видимый `solid` outline.
- Browser clock показывает `04:32` и progress `272000 / 300000`. После сдвига на 10 секунд и reload остаётся исходный deadline и отображается `04:22`. За deadline — `00:00`, текст об истечении и недоступные действия кода.
- Переход перехвачен в browser context: фактический HTTPS URL соответствует fixture, заголовок Referer отсутствует. Код не отправлялся на внешний сайт. Страница и assets самостоятельно обращались только к loopback; JavaScript exceptions не зафиксированы.
- POST cancel показал «Вход отменён», `challenge.cancel` завершился и helper был закрыт. Во втором probe helper закрыт без cancel; попытка отмены показала прерванную связь и предложение проверить приложение. Успех или подтверждённая отмена не объявлены. Network error в console при закрытом helper ожидаем.

Это browser-проверка страницы, а не новый auth flow. Связь с реальным auth hard timeout и success/error/timeout/cancel cleanup подтверждают существующие и дополненные `auth-browser.test.ts` и `yandex-music-auth.test.ts`; узкий запуск этих файлов прошёл: 2 файла, 23 теста. Полный canonical Verification выполняет dispatcher и фиксирует результат в Evidence STEP-041.
