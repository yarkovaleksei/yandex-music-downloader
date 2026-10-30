import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Avatar,
  Button,
  Chip,
  Box,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
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
  const [avatar, setAvatar] = useState<string>();
  const revision = useRef(0);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function refresh() {
    const current = ++revision.current;
    setAvatar(undefined);
    const result = await api.account();
    if (current !== revision.current) return;
    if (result.kind === 'result') {
      setAccount(result.data);
      // STEP-059: account виден сразу; поздний avatar предыдущей сессии отбрасывается.
      if (result.data)
        void api
          .accountAvatar()
          .then((image) => {
            if (
              current === revision.current &&
              image.kind === 'result' &&
              image.data
            )
              setAvatar(
                `data:${image.data.mimeType};base64,${image.data.base64}`,
              );
          })
          .catch(() => {});
    } else setMessage(result.error.message);
  }
  useEffect(() => {
    void refresh();
    return () => {
      revision.current++;
    };
  }, [api]);
  async function action() {
    revision.current++;
    setAvatar(undefined);
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
        <Stack direction="row" spacing={3} sx={{ alignItems: 'center' }}>
          <Avatar
            alt="Аватар аккаунта"
            src={avatar}
            sx={{ width: 72, height: 72, bgcolor: 'primary.main' }}
          >
            {account?.displayName.slice(0, 1) ?? 'Я'}
          </Avatar>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h2">
              {account?.displayName ?? 'Аккаунт не подключён'}
            </Typography>
            <Typography color="text.secondary">
              {account?.email || 'Email: нет данных'}
            </Typography>
          </Box>
          <Typography component="div">
            {account ? (
              <Chip color="success" label="Авторизация активна" />
            ) : (
              'Войдите через браузер, чтобы загружать доступную вам музыку'
            )}
          </Typography>
          <Button
            variant="contained"
            disabled={busy || account === undefined}
            onClick={() => void action()}
          >
            {account ? 'Выйти из аккаунта' : 'Войти через браузер'}
          </Button>
        </Stack>
      </Paper>
      {account && (
        <>
          <Typography variant="h2">Подписка</Typography>
          <Paper variant="outlined" sx={{ p: 3 }}>
            <Typography>
              {account.subscription ||
                account.subscriptionReason ||
                'Нет данных о подписке: сервис не передал достаточно сведений.'}
            </Typography>
          </Paper>
          <Typography variant="h2">Информация</Typography>
          <Paper variant="outlined">
            <Box
              component="dl"
              sx={{
                m: 0,
                '& > div': {
                  display: 'grid',
                  gridTemplateColumns: '1fr 2fr',
                  p: 2,
                  borderBottom: 1,
                  borderColor: 'divider',
                },
                '& dd': { m: 0 },
              }}
            >
              {[
                ['ID аккаунта', account.id],
                ['Email', account.email],
                ['Регион', account.region],
                [
                  'Тип подписки',
                  account.subscription || account.subscriptionReason,
                ],
                [
                  'Доступные форматы',
                  account.formats?.join(', ') ||
                    'Общего перечня нет: сервис сообщает варианты при анализе конкретного трека. Подписка не гарантирует доступность отдельного формата.',
                ],
              ].map(([label, text]) => (
                <Box key={label}>
                  <Typography component="dt" color="text.secondary">
                    {label}
                  </Typography>
                  <Typography component="dd">{text || 'Нет данных'}</Typography>
                </Box>
              ))}
            </Box>
          </Paper>
        </>
      )}
      <Alert severity="info">
        Данные входа находятся в защищённом хранилище операционной системы.
        Выход удаляет сохранённый токен этого приложения.
      </Alert>
    </Stack>
  );
}
