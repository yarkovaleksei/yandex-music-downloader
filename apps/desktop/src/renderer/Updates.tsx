import { useState } from 'react';
import { Alert, Button, Paper, Stack, Typography } from '@mui/material';
import type { DesktopApi } from '../contract/desktop-api.js';
import type { UpdateView } from '../contract/update.js';

/** @link docs/architecture-decisions/ADR-019-portable-distribution-and-updates.md Renderer запрашивает действие, но не передаёт URL или путь пакета. */
export function Updates({ api }: { api: DesktopApi }) {
  const [view, setView] = useState<UpdateView>();
  const [busy, setBusy] = useState(false);
  async function invoke(
    method: 'checkUpdate' | 'downloadUpdate' | 'openUpdateFolder',
  ) {
    setBusy(true);
    try {
      const result = await api[method]();
      if (result.kind === 'result') setView(result.data);
      else
        setView({
          status: 'error',
          currentVersion: '',
          message: 'Не удалось проверить обновление. Повторите попытку.',
        });
    } catch {
      setView({
        status: 'error',
        currentVersion: '',
        message: 'Связь с приложением потеряна. Повторите попытку.',
      });
    } finally {
      setBusy(false);
    }
  }
  return (
    <Paper variant="outlined" sx={{ p: 3 }}>
      <Stack spacing={2}>
        <Typography variant="h2">Обновления приложения</Typography>
        <Typography>
          Проверка и скачивание запускаются только по вашей команде. После
          скачивания закройте приложение и замените portable-файлы. Настройки и
          история останутся на месте.
        </Typography>
        {view && (
          <Alert severity={view.status === 'error' ? 'error' : 'info'}>
            {view.message}
            {view.version && ` Версия: ${view.version}.`}
          </Alert>
        )}
        <Stack direction="row" spacing={2}>
          <Button disabled={busy} onClick={() => void invoke('checkUpdate')}>
            Проверить обновления
          </Button>
          {view?.status === 'available' && (
            <Button
              disabled={busy}
              onClick={() => void invoke('downloadUpdate')}
            >
              Скачать обновление
            </Button>
          )}
          {view?.status === 'ready' && (
            <Button
              disabled={busy}
              onClick={() => void invoke('openUpdateFolder')}
            >
              Открыть папку с обновлением
            </Button>
          )}
        </Stack>
      </Stack>
    </Paper>
  );
}
