import { test, expect, _electron as electron } from '@playwright/test';
import electronPath from 'electron';
import { readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { prepare } from './prepare.mjs';

/** Только наблюдение через настоящий preload: команды пользователя выполняются кнопками UI. */
async function jobs(page) {
  const response = await page.evaluate(() => globalThis.desktopApi.listJobs());
  expect(response.kind).toBe('result');
  return response.data;
}
async function history(page) {
  const response = await page.evaluate(() => globalThis.desktopApi.history());
  expect(response.kind).toBe('result');
  return response.data;
}

test('Ссылка → предпросмотр → загрузка → пауза → продолжение → файл и история после перезапуска', async () => {
  const testInfo = test.info();
  const fixture = await prepare();
  let app;
  let page;
  const diagnostics = [];
  const env = { ...process.env, ...fixture.env };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.MUSIC_DOWNLOADER_SMOKE_DIR;
  async function launch() {
    app = await electron.launch({
      executablePath: electronPath,
      args: [path.join(fixture.directory, 'bootstrap.mjs')],
      env,
      timeout: 15_000,
    });
    app
      .process()
      .stdout?.on('data', (bytes) => diagnostics.push(bytes.toString()));
    app
      .process()
      .stderr?.on('data', (bytes) => diagnostics.push(bytes.toString()));
    page = await app.firstWindow();
    page.on('pageerror', (error) => diagnostics.push(error.stack));
    page.on('console', (message) =>
      diagnostics.push(message.type() + ': ' + message.text()),
    );
    await expect(page.getByLabel('Ссылка на музыку')).toBeVisible();
    if (process.env.MUSIC_FINAL_DIAGNOSTICS)
      await page.evaluate(() => console.info('журнал renderer подключён'));
  }
  try {
    await launch();
    // версия локальная, клиентское окно Linux не имеет служебного меню.
    const installed = await app.evaluate(({ app, BrowserWindow }) => ({
      version: app.getVersion(),
      dev: !app.isPackaged,
      menuVisible: BrowserWindow.getAllWindows()[0].isMenuBarVisible(),
    }));
    expect(
      await page.evaluate(() => globalThis.desktopApi.appInfo()),
    ).toMatchObject({
      kind: 'result',
      data: { version: installed.version, dev: installed.dev },
    });
    if (process.platform !== 'darwin')
      expect(installed.menuVisible).toBe(false);
    await expect.poll(async () => (await jobs(page)).length).toBe(0);
    // REQ-058: реальный preload сохраняет настройки, вкладки только формируют команду.
    await page.getByRole('button', { name: 'Настройки', exact: true }).click();
    await expect(
      page.getByLabel('Открывать папку после завершения загрузки'),
    ).toHaveCount(0);
    const concurrency = page.getByRole('spinbutton', {
      name: 'Параллельных загрузок',
    });
    await concurrency.fill('8');
    await page.getByRole('tab', { name: 'О программе', exact: true }).click();
    await expect(
      page.getByText(
        `Версия: ${installed.version}${installed.dev ? ' (dev)' : ''}`,
      ),
    ).toBeVisible();
    await page.getByRole('tab', { name: 'Файлы', exact: true }).click();
    for (const label of [
      'Скачивать обложки альбомов',
      'Сохранять метаданные (ID3/FLAC tags)',
      'Создавать плейлисты .m3u8',
    ])
      await page.getByLabel(label, { exact: true }).uncheck();
    await page.getByRole('tab', { name: 'Внешний вид', exact: true }).click();
    await page
      .getByRole('main')
      .getByLabel('Тёмная тема', { exact: true })
      .check();
    await page
      .getByRole('button', { name: 'Сохранить настройки', exact: true })
      .click();
    await expect(page.getByText(/Настройки сохранены/)).toBeVisible();
    const configured = await page.evaluate(() =>
      globalThis.desktopApi.getSettings(),
    );
    expect(configured.kind).toBe('result');
    expect(configured.data).toMatchObject({
      writeTags: false,
      saveCoverFile: false,
      writeM3u8: false,
      theme: 'dark',
      concurrency: 8,
    });
    await page.getByRole('button', { name: 'Главная', exact: true }).click();
    await page.getByLabel('Ссылка на музыку').fill('mock://track/e2e-track');
    await page
      .getByRole('button', { name: 'Анализировать', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Проверочный сигнал', exact: true }),
    ).toBeVisible();
    // Предпросмотр не начинает загрузку; только явное действие создаёт job.
    expect(await jobs(page)).toEqual([]);
    await page
      .getByRole('button', { name: 'Качество: Лучшее доступное', exact: true })
      .click();
    await page
      .getByLabel('MP3 / MP3 · 192 кбит/с · 1 / 1 трек', { exact: true })
      .check();
    await page.getByRole('button', { name: 'Отмена', exact: true }).click();
    await expect(
      page.getByRole('button', {
        name: 'Качество: Лучшее доступное',
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Качество: Лучшее доступное', exact: true })
      .click();
    await page
      .getByLabel('MP3 / MP3 · 192 кбит/с · 1 / 1 трек', { exact: true })
      .check();
    await page.getByRole('button', { name: 'Применить', exact: true }).click();
    await expect(
      page.getByRole('button', {
        name: 'Качество: MP3 / MP3 · 192 кбит/с',
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Выбрать папку', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Добавить в загрузки', exact: true })
      .click();
    const article = page.getByRole('article');
    await expect(article).toHaveCount(1);
    await expect
      .poll(async () => (await jobs(page))[0]?.tracks[0]?.status)
      .toBe('downloading');
    const jobId = (await jobs(page))[0].jobId;
    await article
      .getByRole('button', { name: 'Приостановить', exact: true })
      .click();
    await page.getByRole('tab', { name: 'Очередь (1)', exact: true }).click();
    await expect(
      article.getByText('Приостановлено', { exact: true }),
    ).toBeVisible();
    await expect.poll(async () => (await jobs(page))[0]?.status).toBe('paused');
    await article
      .getByRole('button', { name: 'Продолжить', exact: true })
      .click();
    await expect
      .poll(async () => (await jobs(page))[0]?.status)
      .toBe('completed');
    await page
      .getByRole('tab', { name: 'Завершённые (1)', exact: true })
      .click();
    await expect(
      article.getByText('Завершено', { exact: true }).first(),
    ).toBeVisible();
    const [completed] = await jobs(page);
    expect(completed.jobId).toBe(jobId);
    expect(completed.tracks).toHaveLength(1);
    expect(completed.tracks[0].status).toBe('completed');
    const output = completed.tracks[0].resultPath;
    const relative = path.relative(fixture.env.MUSIC_E2E_OUTPUT, output);
    expect(relative).not.toMatch(/^\.\./);
    expect(path.isAbsolute(relative)).toBe(false);
    expect(relative).not.toBe('');
    const bytes = (await stat(output)).size;
    expect(bytes).toBeGreaterThan(0);
    await page.getByRole('button', { name: 'История', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'История загрузок', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('Проверочный сигнал', { exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        (jobId) => globalThis.desktopApi.jobFolderAvailability({ jobId }),
        jobId,
      ),
    ).toMatchObject({ kind: 'result', data: { available: true } });
    const entries = await history(page);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      jobId,
      title: 'Проверочный сигнал',
      count: 1,
    });
    await app.close();
    app = undefined;
    // Файл SQLite и новый utilityProcess доказывают persistence без импорта внутренних stores из apps.
    const sqlite = await readFile(
      path.join(fixture.env.MUSIC_E2E_STATE, 'state.sqlite3'),
    );
    expect(sqlite.subarray(0, 16).toString()).toBe('SQLite format 3\0');
    await launch();
    const restoredSettings = await page.evaluate(() =>
      globalThis.desktopApi.getSettings(),
    );
    expect(restoredSettings.kind).toBe('result');
    expect(restoredSettings.data).toMatchObject({
      writeTags: false,
      saveCoverFile: false,
      writeM3u8: false,
      theme: 'dark',
      concurrency: 8,
    });
    await expect(page.getByLabel('Тёмная тема', { exact: true })).toBeChecked();
    await page.getByRole('button', { name: 'История', exact: true }).click();
    await expect(
      page.getByText('Проверочный сигнал', { exact: true }),
    ).toBeVisible();
    const restored = await history(page);
    expect(restored).toEqual(entries);
    expect((await jobs(page))[0]).toMatchObject({ jobId, status: 'completed' });
    expect((await stat(output)).size).toBe(bytes);
    // Смена текущих настроек не переписывает снимок истории; replay идёт через ту же команду UI.
    await page.getByRole('button', { name: 'Настройки', exact: true }).click();
    await page.getByRole('tab', { name: 'Файлы', exact: true }).click();
    for (const label of [
      'Скачивать обложки альбомов',
      'Сохранять метаданные (ID3/FLAC tags)',
      'Создавать плейлисты .m3u8',
    ])
      await page.getByLabel(label, { exact: true }).check();
    await page
      .getByRole('button', { name: 'Сохранить настройки', exact: true })
      .click();
    await expect(page.getByText(/Настройки сохранены/)).toBeVisible();
    await page.getByRole('button', { name: 'История', exact: true }).click();
    await page
      .getByRole('button', { name: 'Скачать снова', exact: true })
      .click();
    await expect.poll(async () => (await jobs(page)).length).toBe(2);
    await expect
      .poll(async () =>
        (await jobs(page)).every((job) => job.status === 'completed'),
      )
      .toBe(true);
    expect((await stat(output)).size).toBe(bytes);
    const resultPath = testInfo.outputPath('result.json');
    await writeFile(
      resultPath,
      JSON.stringify(
        {
          platform: process.platform,
          stateDir: fixture.env.MUSIC_E2E_STATE,
          outputPath: output,
          fixtureDirectory: fixture.directory,
          jobId,
          status: 'completed',
          output: relative,
          bytes,
          historyAfterRestart: restored,
          restoredSettings: restoredSettings.data,
          exactVariant: {
            codec: 'mp3',
            container: 'mp3',
            bitrate: 192,
            lossless: false,
          },
          replayJobs: await jobs(page),
        },
        null,
        2,
      ),
    );
    await testInfo.attach('результат-сценария', {
      path: resultPath,
      contentType: 'application/json',
    });
  } catch (error) {
    if (page && !page.isClosed())
      await testInfo.attach('окно-при-ошибке', {
        body: await page.screenshot(),
        contentType: 'image/png',
      });
    throw error;
  } finally {
    try {
      if (app) await app.close();
    } finally {
      await writeFile(
        testInfo.outputPath('electron-stdio.txt'),
        diagnostics.join(''),
      );
      if (process.env.MUSIC_FINAL_KIT !== '1')
        await rm(fixture.directory, { recursive: true, force: true });
    }
  }
});
