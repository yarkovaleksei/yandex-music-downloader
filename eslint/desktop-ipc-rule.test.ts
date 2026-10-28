import { Linter } from 'eslint';
import { expect, it } from 'vitest';
import rule from './desktop-ipc-rule.mjs';
function check(code: string, file: string) {
  return new Linter().verify(
    code,
    [
      {
        files: ['**/*.js'],
        plugins: { desktop: { rules: { ipc: rule } } },
        rules: { 'desktop/ipc': 'error' },
      },
    ],
    { filename: `${process.cwd()}/apps/desktop/src/${file}.js` },
  );
}
it('ADR-016 запрещает произвольный IPC вне transport и renderer imports', () => {
  expect(
    check(
      "import {ipcMain} from 'electron'; ipcMain.handle('raw',()=>{});",
      'main/index',
    ),
  ).not.toHaveLength(0);
  expect(
    check(
      "import {ipcRenderer as ipc} from 'electron'; ipc.invoke('raw');",
      'transport/preload',
    ),
  ).not.toHaveLength(0);
  expect(
    check("import {ipcRenderer} from 'electron';", 'renderer/App'),
  ).not.toHaveLength(0);
  expect(check("import fs from 'node:fs';", 'renderer/App')).not.toHaveLength(
    0,
  );
  expect(
    check(
      "import {ipcRenderer} from 'electron'; import {channel} from '../contract/desktop-api.js'; ipcRenderer.invoke(channel('account'));",
      'transport/preload',
    ),
  ).toHaveLength(0);
});
