# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: download.spec.mjs >> Ссылка → предпросмотр → загрузка → пауза → продолжение → файл и история после перезапуска
- Location: apps/desktop/e2e/download.spec.mjs:19:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByLabel('Ссылка на музыку')
Expected: visible
Timeout: 15000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByLabel('Ссылка на музыку') with timeout 15000ms
  - waiting for getByLabel('Ссылка на музыку')

```

# Test source

```ts
  1   | import { test, expect, _electron as electron } from '@playwright/test';
  2   | import electronPath from 'electron';
  3   | import { readFile, rm, stat, writeFile } from 'node:fs/promises';
  4   | import path from 'node:path';
  5   | import { prepare } from './prepare.mjs';
  6   | 
  7   | /** Только наблюдение через настоящий preload: команды пользователя выполняются кнопками UI. */
  8   | async function jobs(page) {
  9   |   const response = await page.evaluate(() => globalThis.desktopApi.listJobs());
  10  |   expect(response.kind).toBe('result');
  11  |   return response.data;
  12  | }
  13  | async function history(page) {
  14  |   const response = await page.evaluate(() => globalThis.desktopApi.history());
  15  |   expect(response.kind).toBe('result');
  16  |   return response.data;
  17  | }
  18  | 
  19  | test('Ссылка → предпросмотр → загрузка → пауза → продолжение → файл и история после перезапуска', async () => {
  20  |   const testInfo = test.info();
  21  |   const fixture = await prepare();
  22  |   let app;
  23  |   let page;
  24  |   const env = { ...process.env, ...fixture.env };
  25  |   delete env.ELECTRON_RUN_AS_NODE;
  26  |   delete env.MUSIC_DOWNLOADER_SMOKE_DIR;
  27  |   async function launch() {
  28  |     app = await electron.launch({
  29  |       executablePath: electronPath,
  30  |       args: [path.join(fixture.directory, 'bootstrap.mjs')],
  31  |       env,
  32  |       timeout: 15_000,
  33  |     });
  34  |     page = await app.firstWindow();
> 35  |     await expect(page.getByLabel('Ссылка на музыку')).toBeVisible();
      |                                                       ^ Error: expect(locator).toBeVisible() failed
  36  |   }
  37  |   try {
  38  |     await launch();
  39  |     await expect.poll(async () => (await jobs(page)).length).toBe(0);
  40  |     await page.getByLabel('Ссылка на музыку').fill('mock://track/e2e-track');
  41  |     await page
  42  |       .getByRole('button', { name: 'Анализировать', exact: true })
  43  |       .click();
  44  |     await expect(
  45  |       page.getByRole('heading', { name: 'Проверочный сигнал', exact: true }),
  46  |     ).toBeVisible();
  47  |     // Предпросмотр не начинает загрузку; только явное действие создаёт job.
  48  |     expect(await jobs(page)).toEqual([]);
  49  |     await page
  50  |       .getByRole('button', { name: 'Выбрать папку', exact: true })
  51  |       .click();
  52  |     await page
  53  |       .getByRole('button', { name: 'Добавить в загрузки', exact: true })
  54  |       .click();
  55  |     const article = page.getByRole('article');
  56  |     await expect(article).toHaveCount(1);
  57  |     await expect
  58  |       .poll(async () => (await jobs(page))[0]?.tracks[0]?.status)
  59  |       .toBe('downloading');
  60  |     const jobId = (await jobs(page))[0].jobId;
  61  |     await article
  62  |       .getByRole('button', { name: 'Приостановить', exact: true })
  63  |       .click();
  64  |     await expect(
  65  |       article.getByText('Приостановлено', { exact: true }),
  66  |     ).toBeVisible();
  67  |     await expect.poll(async () => (await jobs(page))[0]?.status).toBe('paused');
  68  |     await article
  69  |       .getByRole('button', { name: 'Продолжить', exact: true })
  70  |       .click();
  71  |     await expect
  72  |       .poll(async () => (await jobs(page))[0]?.status)
  73  |       .toBe('completed');
  74  |     await expect(
  75  |       article.getByText('Завершено', { exact: true }).first(),
  76  |     ).toBeVisible();
  77  |     const [completed] = await jobs(page);
  78  |     expect(completed.jobId).toBe(jobId);
  79  |     expect(completed.tracks).toHaveLength(1);
  80  |     expect(completed.tracks[0].status).toBe('completed');
  81  |     const output = completed.tracks[0].resultPath;
  82  |     const relative = path.relative(fixture.env.MUSIC_E2E_OUTPUT, output);
  83  |     expect(relative).not.toMatch(/^\.\./);
  84  |     expect(path.isAbsolute(relative)).toBe(false);
  85  |     expect(relative).not.toBe('');
  86  |     const bytes = (await stat(output)).size;
  87  |     expect(bytes).toBeGreaterThan(0);
  88  |     await page.getByRole('button', { name: 'История', exact: true }).click();
  89  |     await expect(
  90  |       page.getByRole('heading', { name: 'История загрузок', exact: true }),
  91  |     ).toBeVisible();
  92  |     await expect(
  93  |       page.getByText('Проверочный сигнал', { exact: true }),
  94  |     ).toBeVisible();
  95  |     const entries = await history(page);
  96  |     expect(entries).toHaveLength(1);
  97  |     expect(entries[0]).toMatchObject({
  98  |       jobId,
  99  |       title: 'Проверочный сигнал',
  100 |       count: 1,
  101 |     });
  102 |     await app.close();
  103 |     app = undefined;
  104 |     // Файл SQLite и новый utilityProcess доказывают persistence без импорта внутренних stores из apps.
  105 |     const sqlite = await readFile(
  106 |       path.join(fixture.env.MUSIC_E2E_STATE, 'state.sqlite3'),
  107 |     );
  108 |     expect(sqlite.subarray(0, 16).toString()).toBe('SQLite format 3\0');
  109 |     await launch();
  110 |     await page.getByRole('button', { name: 'История', exact: true }).click();
  111 |     await expect(
  112 |       page.getByText('Проверочный сигнал', { exact: true }),
  113 |     ).toBeVisible();
  114 |     const restored = await history(page);
  115 |     expect(restored).toEqual(entries);
  116 |     expect((await jobs(page))[0]).toMatchObject({ jobId, status: 'completed' });
  117 |     expect((await stat(output)).size).toBe(bytes);
  118 |     const resultPath = testInfo.outputPath('result.json');
  119 |     await writeFile(
  120 |       resultPath,
  121 |       JSON.stringify(
  122 |         {
  123 |           platform: process.platform,
  124 |           jobId,
  125 |           status: 'completed',
  126 |           output: relative,
  127 |           bytes,
  128 |           historyAfterRestart: restored,
  129 |         },
  130 |         null,
  131 |         2,
  132 |       ),
  133 |     );
  134 |     await testInfo.attach('результат-сценария', {
  135 |       path: resultPath,
```