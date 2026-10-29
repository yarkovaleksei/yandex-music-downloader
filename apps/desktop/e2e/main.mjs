import { app, dialog } from 'electron';

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
