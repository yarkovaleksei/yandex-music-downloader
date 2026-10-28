import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Container,
  CssBaseline,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import DownloadRounded from '@mui/icons-material/DownloadRounded';
import type { Account } from '@music-downloader/shared';
import type { DesktopApi } from '../contract/desktop-api.js';

/** Минимальная оболочка STEP-030 использует только typed preload API. */
export function App({ api = window.desktopApi }: { api?: DesktopApi }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [connected, setConnected] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  async function refresh() {
    const result = await api.account();
    if (result.kind === 'result') {
      setAccount(result.data);
      setError('');
    } else setError(result.error.message);
  }
  useEffect(() => {
    void refresh();
    return api.subscribe((event) => {
      if (event.event === 'auth.notice') setNotice(event.message);
      if (event.event === 'host.status') {
        setConnected(event.connected);
        if (event.connected) void refresh();
      }
    });
  }, [api]);
  async function authenticate() {
    setBusy(true);
    setError('');
    const result = await api.authenticate();
    setBusy(false);
    if (result.kind === 'result') {
      setAccount(result.data);
      setNotice('');
    } else setError(result.error.message);
  }
  async function logout() {
    setBusy(true);
    const result = await api.logout();
    setBusy(false);
    if (result.kind === 'result') setAccount(null);
    else setError(result.error.message);
  }
  return (
    <>
      <CssBaseline />
      <Box
        sx={{
          borderBottom: 1,
          borderColor: 'divider',
          bgcolor: 'background.paper',
          py: 2,
        }}
      >
        <Container>
          <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
            <DownloadRounded color="primary" />
            <Typography variant="h3" sx={{ flex: 1 }}>
              Yandex Music Downloader
            </Typography>
            <Chip
              size="small"
              color={connected ? 'success' : 'warning'}
              label={
                connected ? 'Приложение подключено' : 'Восстановление связи…'
              }
            />
          </Stack>
        </Container>
      </Box>
      <Container maxWidth="md" sx={{ py: 6 }}>
        <Stack spacing={3}>
          <Typography variant="h1">Музыка — в вашей коллекции</Typography>
          <Typography color="text.secondary">
            Desktop-приложение для загрузки доступной вам музыки.
          </Typography>
          <Paper variant="outlined" sx={{ p: 3 }}>
            <Stack spacing={2}>
              <Typography variant="h2">Аккаунт</Typography>
              <Typography>
                {account
                  ? `Вы вошли как ${account.displayName}`
                  : 'Войдите в аккаунт, чтобы подключить свою музыку.'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Авторизация откроется в системном браузере. Данные входа
                сохраняются в защищённом хранилище операционной системы.
              </Typography>
              <Stack direction="row" spacing={2}>
                <Button
                  variant="contained"
                  disabled={busy || !connected}
                  onClick={() => void (account ? logout() : authenticate())}
                >
                  {busy
                    ? 'Подождите…'
                    : account
                      ? 'Выйти'
                      : 'Войти через браузер'}
                </Button>
                <Button
                  disabled={busy || !connected}
                  onClick={() => void refresh()}
                >
                  Обновить состояние
                </Button>
              </Stack>
            </Stack>
          </Paper>
          {notice && <Alert severity="info">{notice}</Alert>}
          {error && <Alert severity="error">{error}</Alert>}
          {!connected && (
            <Alert severity="warning">
              Связь с приложением потеряна. Дождитесь восстановления и обновите
              состояние.
            </Alert>
          )}
        </Stack>
      </Container>
    </>
  );
}
