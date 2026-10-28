import { useEffect, useState } from 'react';
import { Alert, Button, Chip, Paper, Stack, Typography } from '@mui/material';
import type { JsonObject, SavedDiagnostics } from '@music-downloader/shared';
import type { DesktopApi } from '../contract/desktop-api.js';
const labels: Record<string, string> = {
  runtime: 'Среда выполнения',
  credentialStore: 'Защищённое хранилище',
  provider: 'Источник музыки',
  auth: 'Авторизация',
  account: 'Аккаунт',
  metadata: 'Метаданные',
  audioVariants: 'Варианты аудио',
  manifestStore: 'База состояния',
  filesystem: 'Папка загрузок',
  ffmpeg: 'FFmpeg',
  tokenPermissions: 'Права хранилища',
};
const statuses: Record<string, string> = {
  ok: 'Успешно',
  failed: 'Ошибка',
  'api-changed': 'API изменился',
  skipped: 'Пропущено',
  optional: 'Необязательно',
};
/** Последний успех не подменяет ошибку refresh: время и статус обновления показаны отдельно. */
export function Diagnostics({ api }: { api: DesktopApi }) {
  const [value, setValue] = useState<SavedDiagnostics | null>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void api.lastDiagnostics().then((result) => {
      if (result.kind === 'result') setValue(result.data);
      else setError(result.error.message);
    });
  }, [api]);
  async function refresh() {
    setBusy(true);
    setError('');
    try {
      const result = await api.refreshDiagnostics();
      if (result.kind === 'result') setValue(result.data);
      else {
        setError(`Проверка не обновлена. ${result.error.message}`);
        if (result.error.code === 'OUTCOME_UNKNOWN') {
          const saved = await api.lastDiagnostics();
          if (saved.kind === 'result') setValue(saved.data);
        }
      }
    } finally {
      setBusy(false);
    }
  }
  const checks = value?.diagnostics.configuration?.checks;
  const rows =
    checks && typeof checks === 'object' && !Array.isArray(checks)
      ? Object.entries(checks as JsonObject)
      : [];
  return (
    <Stack spacing={3}>
      <Stack
        direction="row"
        sx={{ justifyContent: 'space-between', alignItems: 'center' }}
      >
        <Typography variant="h1">Диагностика</Typography>
        <Button
          variant="contained"
          disabled={busy}
          onClick={() => void refresh()}
        >
          {busy ? 'Проверяем…' : 'Повторить проверки'}
        </Button>
      </Stack>
      <Typography color="text.secondary">
        Состояние приложения и доступности источника музыки
      </Typography>
      {error && <Alert severity="error">{error}</Alert>}
      <Typography>
        {value
          ? `Последняя проверка: ${new Date(value.checkedAt).toLocaleString('ru-RU')}`
          : 'Проверки ещё не запускались'}
      </Typography>
      {value && (
        <Alert severity={value.diagnostics.available ? 'success' : 'warning'}>
          {value.diagnostics.available
            ? 'Обязательные проверки пройдены'
            : 'Некоторые проверки требуют внимания'}
        </Alert>
      )}
      <Paper variant="outlined" sx={{ p: 3 }}>
        <Stack spacing={2}>
          {rows.length === 0 ? (
            <Typography color="text.secondary">
              Запустите проверку для получения результатов
            </Typography>
          ) : (
            rows.map(([key, raw]) => {
              const check = raw as JsonObject;
              return (
                <Stack
                  key={key}
                  direction="row"
                  sx={{ justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <Typography>{labels[key] ?? key}</Typography>
                  <Stack
                    direction="row"
                    spacing={2}
                    sx={{ alignItems: 'center' }}
                  >
                    {check.code && (
                      <Typography variant="caption" color="text.secondary">
                        {String(check.code)}
                      </Typography>
                    )}
                    <Chip
                      size="small"
                      color={
                        check.status === 'ok'
                          ? 'success'
                          : check.status === 'failed' ||
                              check.status === 'api-changed'
                            ? 'error'
                            : 'default'
                      }
                      label={`${statuses[String(check.status)] ?? String(check.status)}${check.optional === true ? ' · необязательно' : ''}`}
                    />
                  </Stack>
                </Stack>
              );
            })
          )}
        </Stack>
      </Paper>
      {value?.diagnostics.configuration?.schemaVersion && (
        <Typography variant="caption">
          Версия схемы provider:{' '}
          {String(value.diagnostics.configuration.schemaVersion)}
        </Typography>
      )}
    </Stack>
  );
}
