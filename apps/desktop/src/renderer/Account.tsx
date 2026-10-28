import { useEffect, useState } from 'react';
import { Alert, Avatar, Button, Paper, Stack, Typography } from '@mui/material';
import type { Account as AccountDto } from '@music-downloader/shared';
import type { DesktopApi } from '../contract/desktop-api.js';

/** Показывает только подтверждённые provider поля; тариф и регион не выдумываются. */
export function Account({
  api,
  onChanged,
}: {
  api: DesktopApi;
  onChanged: () => void;
}) {
  const [account, setAccount] = useState<AccountDto | null>();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function refresh() {
    const result = await api.account();
    if (result.kind === 'result') setAccount(result.data);
    else setMessage(result.error.message);
  }
  useEffect(() => {
    void refresh();
  }, [api]);
  async function action() {
    setBusy(true);
    setMessage('');
    try {
      const result = await (account ? api.logout() : api.authenticate());
      if (result.kind === 'result') {
        await refresh();
        onChanged();
      } else {
        setMessage(result.error.message);
        await refresh();
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <Stack spacing={3}>
      <Typography variant="h1">Аккаунт</Typography>
      <Typography color="text.secondary">
        Подключение к Яндекс Музыке
      </Typography>
      {message && <Alert severity="warning">{message}</Alert>}
      <Paper variant="outlined" sx={{ p: 4 }}>
        <Stack spacing={3} sx={{ alignItems: 'flex-start' }}>
          <Avatar sx={{ width: 72, height: 72, bgcolor: 'primary.main' }}>
            {account?.displayName.slice(0, 1) ?? 'Я'}
          </Avatar>
          <Typography variant="h2">
            {account?.displayName ?? 'Аккаунт не подключён'}
          </Typography>
          <Typography>
            {account
              ? 'Авторизация активна'
              : 'Войдите через браузер, чтобы загружать доступную вам музыку'}
          </Typography>
          {account && (
            <Typography color="text.secondary">
              ID аккаунта: {account.id}
            </Typography>
          )}
          <Button
            variant="contained"
            disabled={busy || account === undefined}
            onClick={() => void action()}
          >
            {account ? 'Выйти из аккаунта' : 'Войти через браузер'}
          </Button>
        </Stack>
      </Paper>
      <Alert severity="info">
        Данные входа находятся в защищённом хранилище операционной системы.
        Выход удаляет сохранённый токен этого приложения.
      </Alert>
    </Stack>
  );
}
