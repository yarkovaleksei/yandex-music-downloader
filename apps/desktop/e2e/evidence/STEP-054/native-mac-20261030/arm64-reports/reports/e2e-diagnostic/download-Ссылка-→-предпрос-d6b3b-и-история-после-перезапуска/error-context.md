# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: download.spec.mjs >> Ссылка → предпросмотр → загрузка → пауза → продолжение → файл и история после перезапуска
- Location: apps/desktop/e2e/download.spec.mjs:19:1

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 0
Received: 1

Call Log:
- Timeout 15000ms exceeded while waiting on the predicate
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
  24  |   const diagnostics = [];
  25  |   const env = { ...process.env, ...fixture.env };
  26  |   delete env.ELECTRON_RUN_AS_NODE;
  27  |   delete env.MUSIC_DOWNLOADER_SMOKE_DIR;
  28  |   async function launch() {
  29  |     app = await electron.launch({
  30  |       executablePath: electronPath,
  31  |       args: [path.join(fixture.directory, 'bootstrap.mjs')],
  32  |       env,
  33  |       timeout: 15_000,
  34  |     });
  35  |     app
  36  |       .process()
  37  |       .stdout?.on('data', (bytes) => diagnostics.push(bytes.toString()));
  38  |     app
  39  |       .process()
  40  |       .stderr?.on('data', (bytes) => diagnostics.push(bytes.toString()));
  41  |     page = await app.firstWindow();
  42  |     page.on('pageerror', (error) => diagnostics.push(error.stack));
  43  |     page.on('console', (message) =>
  44  |       diagnostics.push(message.type() + ': ' + message.text()),
  45  |     );
  46  |     await expect(page.getByLabel('Ссылка на музыку')).toBeVisible();
  47  |     if (process.env.MUSIC_FINAL_DIAGNOSTICS)
  48  |       await page.evaluate(() =>
  49  |         console.info('STEP-054: журнал renderer подключён'),
  50  |       );
  51  |   }
  52  |   try {
  53  |     await launch();
> 54  |     await expect.poll(async () => (await jobs(page)).length).toBe(0);
      |                                                              ^ Error: expect(received).toBe(expected) // Object.is equality
  55  |     await page.getByLabel('Ссылка на музыку').fill('mock://track/e2e-track');
  56  |     await page
  57  |       .getByRole('button', { name: 'Анализировать', exact: true })
  58  |       .click();
  59  |     await expect(
  60  |       page.getByRole('heading', { name: 'Проверочный сигнал', exact: true }),
  61  |     ).toBeVisible();
  62  |     // Предпросмотр не начинает загрузку; только явное действие создаёт job.
  63  |     expect(await jobs(page)).toEqual([]);
  64  |     await page
  65  |       .getByRole('button', { name: 'Выбрать папку', exact: true })
  66  |       .click();
  67  |     await page
  68  |       .getByRole('button', { name: 'Добавить в загрузки', exact: true })
  69  |       .click();
  70  |     const article = page.getByRole('article');
  71  |     await expect(article).toHaveCount(1);
  72  |     await expect
  73  |       .poll(async () => (await jobs(page))[0]?.tracks[0]?.status)
  74  |       .toBe('downloading');
  75  |     const jobId = (await jobs(page))[0].jobId;
  76  |     await article
  77  |       .getByRole('button', { name: 'Приостановить', exact: true })
  78  |       .click();
  79  |     await expect(
  80  |       article.getByText('Приостановлено', { exact: true }),
  81  |     ).toBeVisible();
  82  |     await expect.poll(async () => (await jobs(page))[0]?.status).toBe('paused');
  83  |     await article
  84  |       .getByRole('button', { name: 'Продолжить', exact: true })
  85  |       .click();
  86  |     await expect
  87  |       .poll(async () => (await jobs(page))[0]?.status)
  88  |       .toBe('completed');
  89  |     await expect(
  90  |       article.getByText('Завершено', { exact: true }).first(),
  91  |     ).toBeVisible();
  92  |     const [completed] = await jobs(page);
  93  |     expect(completed.jobId).toBe(jobId);
  94  |     expect(completed.tracks).toHaveLength(1);
  95  |     expect(completed.tracks[0].status).toBe('completed');
  96  |     const output = completed.tracks[0].resultPath;
  97  |     const relative = path.relative(fixture.env.MUSIC_E2E_OUTPUT, output);
  98  |     expect(relative).not.toMatch(/^\.\./);
  99  |     expect(path.isAbsolute(relative)).toBe(false);
  100 |     expect(relative).not.toBe('');
  101 |     const bytes = (await stat(output)).size;
  102 |     expect(bytes).toBeGreaterThan(0);
  103 |     await page.getByRole('button', { name: 'История', exact: true }).click();
  104 |     await expect(
  105 |       page.getByRole('heading', { name: 'История загрузок', exact: true }),
  106 |     ).toBeVisible();
  107 |     await expect(
  108 |       page.getByText('Проверочный сигнал', { exact: true }),
  109 |     ).toBeVisible();
  110 |     const entries = await history(page);
  111 |     expect(entries).toHaveLength(1);
  112 |     expect(entries[0]).toMatchObject({
  113 |       jobId,
  114 |       title: 'Проверочный сигнал',
  115 |       count: 1,
  116 |     });
  117 |     await app.close();
  118 |     app = undefined;
  119 |     // Файл SQLite и новый utilityProcess доказывают persistence без импорта внутренних stores из apps.
  120 |     const sqlite = await readFile(
  121 |       path.join(fixture.env.MUSIC_E2E_STATE, 'state.sqlite3'),
  122 |     );
  123 |     expect(sqlite.subarray(0, 16).toString()).toBe('SQLite format 3\0');
  124 |     await launch();
  125 |     await page.getByRole('button', { name: 'История', exact: true }).click();
  126 |     await expect(
  127 |       page.getByText('Проверочный сигнал', { exact: true }),
  128 |     ).toBeVisible();
  129 |     const restored = await history(page);
  130 |     expect(restored).toEqual(entries);
  131 |     expect((await jobs(page))[0]).toMatchObject({ jobId, status: 'completed' });
  132 |     expect((await stat(output)).size).toBe(bytes);
  133 |     const resultPath = testInfo.outputPath('result.json');
  134 |     await writeFile(
  135 |       resultPath,
  136 |       JSON.stringify(
  137 |         {
  138 |           platform: process.platform,
  139 |           stateDir: fixture.env.MUSIC_E2E_STATE,
  140 |           outputPath: output,
  141 |           fixtureDirectory: fixture.directory,
  142 |           jobId,
  143 |           status: 'completed',
  144 |           output: relative,
  145 |           bytes,
  146 |           historyAfterRestart: restored,
  147 |         },
  148 |         null,
  149 |         2,
  150 |       ),
  151 |     );
  152 |     await testInfo.attach('результат-сценария', {
  153 |       path: resultPath,
  154 |       contentType: 'application/json',
```