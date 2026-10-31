import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Avatar,
  Button,
  Chip,
  Box,
  Paper,
  Skeleton,
  Stack,
  Typography,
} from '@mui/material';
import type { Account as AccountDto } from '@music-downloader/shared';
import OpenInNewRounded from '@mui/icons-material/OpenInNewRounded';
import LoginRounded from '@mui/icons-material/LoginRounded';
import LogoutRounded from '@mui/icons-material/LogoutRounded';
import type { DesktopApi } from '../contract/desktop-api.js';
import { LogoutDialog } from './LogoutDialog.js';
import { YandexPlusIcon } from './YandexPlusIcon.js';

/** Показывает только подтверждённые provider поля; тариф и регион не выдумываются. */
export function Account({
  api,
  onChanged,
  initialAccount,
}: {
  api: DesktopApi;
  onChanged: () => void;
  initialAccount?: AccountDto | null | undefined;
}) {
  // Подтверждённый snapshot из App сохраняет карточку при возвращении на страницу.
  // undefined означает ожидание ответа, а null — подтверждённое отсутствие аккаунта.
  const [account, setAccount] = useState<AccountDto | null | undefined>(
    initialAccount,
  );
  const [avatar, setAvatar] = useState<string>();
  const revision = useRef(0);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  async function refresh() {
    const current = ++revision.current;
    setAvatar(undefined);
    const result = await api.account();
    if (current !== revision.current) return;
    if (result.kind === 'result') {
      setAccount(result.data);
      // account виден сразу; поздний avatar предыдущей сессии отбрасывается.
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
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
              <Typography variant="h2">
                {account === undefined ? (
                  <Skeleton width={220} />
                ) : (
                  (account?.displayName ?? 'Аккаунт не подключён')
                )}
              </Typography>
              {account?.premium && (
                <Chip
                  size="small"
                  variant="outlined"
                  icon={<YandexPlusIcon />}
                  label="Яндекс Плюс"
                />
              )}
            </Stack>
            <Typography color="text.secondary">
              {account === undefined ? (
                <Skeleton width={180} />
              ) : (
                account?.email || 'Email: нет данных'
              )}
            </Typography>
          </Box>
          {/* Вошедший аккаунт виден по карточке; отдельный статус не нужен. */}
          {account === null && (
            <Typography>
              Войдите через браузер, чтобы загружать доступную вам музыку
            </Typography>
          )}
          <Button
            variant="contained"
            startIcon={account ? <LogoutRounded /> : <LoginRounded />}
            disabled={busy || account === undefined}
            onClick={() => (account ? setLogoutOpen(true) : void action())}
          >
            {account === undefined
              ? 'Загрузка…'
              : account
                ? 'Выйти из аккаунта'
                : 'Войти через браузер'}
          </Button>
        </Stack>
      </Paper>
      {account && (
        <>
          <Typography variant="h2">Подписка</Typography>
          <Paper variant="outlined" sx={{ p: 3 }}>
            <Stack
              direction="row"
              spacing={2}
              sx={{ alignItems: 'center', justifyContent: 'space-between' }}
            >
              <Typography>
                {account.subscription ||
                  account.subscriptionReason ||
                  'Нет данных о подписке: сервис не передал достаточно сведений.'}
              </Typography>
              {account.subscriptionUrl && (
                <Button
                  endIcon={<OpenInNewRounded />}
                  sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}
                  onClick={() =>
                    void api.openExternal({ url: account.subscriptionUrl! })
                  }
                >
                  Управлять подпиской
                </Button>
              )}
            </Stack>
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
      <LogoutDialog
        open={logoutOpen}
        onCancel={() => setLogoutOpen(false)}
        onConfirm={() => {
          setLogoutOpen(false);
          void action();
        }}
      />
      <Alert severity="info">
        Данные входа находятся в защищённом хранилище операционной системы.
        Выход удаляет сохранённый токен этого приложения.
      </Alert>
    </Stack>
  );
}
