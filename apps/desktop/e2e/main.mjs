import { app, dialog } from 'electron';
import { appendFileSync } from 'node:fs';

//  Причинный журнал устанавливается до production main.
const log = (event, data) => {
  if (process.env.MUSIC_FINAL_DIAGNOSTICS)
    appendFileSync(
      process.env.MUSIC_FINAL_DIAGNOSTICS,
      JSON.stringify({ time: new Date().toISOString(), event, data }) + '\n',
    );
};
process.on('uncaughtExceptionMonitor', (error) =>
  log('main-error', error.stack),
);
app.on('child-process-gone', (_event, details) =>
  log('child-process-gone', details),
);
app.on('web-contents-created', (_event, contents) => {
  for (const event of ['did-fail-load', 'preload-error', 'render-process-gone'])
    contents.on(event, (_event, ...details) =>
      log(
        event,
        details.map((value) => (value instanceof Error ? value.stack : value)),
      ),
    );
  // Electron 45 передаёт frame в details: сохраняем только сериализуемые причинные поля.
  contents.on(
    'console-message',
    (details, level, message, lineNumber, sourceId) =>
      log('console-message', {
        level: details.level ?? level,
        message: details.message ?? message,
        lineNumber: details.lineNumber ?? lineNumber,
        sourceId: details.sourceId ?? sourceId,
      }),
  );
  contents.on('did-finish-load', () =>
    log('did-finish-load', contents.getURL()),
  );
});

// userData задаётся до production main; native dialog возвращает только тестовый output.
app.setPath('userData', process.env.MUSIC_E2E_USER_DATA);
dialog.showOpenDialog = async () => ({
  canceled: false,
  filePaths: [process.env.MUSIC_E2E_OUTPUT],
});
// Playwright требует Chromium endpoint: отменяем только удаление двух automation switches.
// Production main остаётся неизменным; ограничение описано в README E2E.
const removeSwitch = app.commandLine.removeSwitch.bind(app.commandLine);
app.commandLine.removeSwitch = (name) => {
  if (!['remote-debugging-port', 'remote-debugging-pipe'].includes(name))
    removeSwitch(name);
};
await import('./dist/main/index.js');
