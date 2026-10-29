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
};
const statuses: Record<string, string> = {
  ok: 'Успешно',
  failed: 'Ошибка',
  'api-changed': 'API изменился',
  skipped: 'Пропущено',
  optional: 'Необязательно',
};
// Описание называет предмет проверки, а не обещает успех до чтения результата.
// Это сохраняет понятный смысл и для ошибок, и для зависимых пропусков.
const descriptions: Record<string, string> = {
  runtime: 'Совместимость установленной среды с загрузкой музыки.',
  credentialStore: 'Доступ к сохранённому входу в системном хранилище паролей.',
  provider: 'Доступность источника музыки и совместимость его ответа.',
  auth: 'Возможность получать музыку с текущей авторизацией.',
  account: 'Доступ приложения к вашему аккаунту.',
  metadata: 'Получение названий и других данных музыки.',
  audioVariants: 'Получение доступных аккаунту вариантов аудио.',
  manifestStore: 'Чтение заданий и истории из локальной базы.',
  filesystem: 'Возможность сохранять файлы в выбранную папку загрузок.',
};

function explanation(
  key: string,
  check: JsonObject,
  checks: JsonObject,
): string {
  if (check.code === 'DEPENDENCY_FAILED' || check.status === 'skipped') {
    const blockers = Object.entries(checks)
      .filter(
        ([name, item]) =>
          name !== key &&
          item &&
          typeof item === 'object' &&
          !Array.isArray(item) &&
          ['failed', 'api-changed'].includes(
            String((item as JsonObject).status),
          ),
      )
      .map(([name]) => labels[name] ?? name);
    return `Пока не проверено: сначала исправьте ${blockers.length ? blockers.join(', ') : 'ошибку предыдущей проверки'} и повторите проверки.`;
  }
  if (check.code === 'DISK_FULL')
    return 'На диске нет места. Освободите место или выберите другую папку в Настройках.';
  if (check.code === 'STATE_SCHEMA_UNSUPPORTED')
    return 'База создана более новой версией приложения. Обновите приложение; не удаляйте базу.';
  if (check.code === 'UNSUPPORTED_RUNTIME')
    return 'Версия среды не поддерживается. Обновите приложение или используйте поддерживаемую версию Node.js.';
  if (
    ['NETWORK_ERROR', 'SERVICE_UNAVAILABLE', 'UNAVAILABLE'].includes(
      String(check.code),
    ) &&
    key !== 'credentialStore'
  )
    return 'Не удалось связаться с источником. Проверьте интернет и повторите проверку; при сбое сервиса попробуйте позже.';
  if (check.status === 'api-changed')
    return 'Ответ источника несовместим с этой версией. Обновите приложение и повторите проверку.';
  if (key === 'credentialStore')
    return 'Сохранённый вход недоступен. Разблокируйте системное хранилище паролей и войдите снова на странице Аккаунт.';
  if (key === 'auth' || key === 'account')
    return 'Вход недоступен или истёк. Откройте Аккаунт и войдите снова.';
  if (key === 'filesystem')
    return 'Не удалось записать файл. В Настройках выберите доступную для записи папку и проверьте свободное место.';
  if (key === 'manifestStore')
    return 'Не удалось прочитать базу заданий. Проверьте доступ к папке данных приложения и перезапустите приложение; при повторной ошибке сохраните базу для восстановления.';
  if (key === 'audioVariants')
    return 'Доступное аудио не получено. Проверьте вход и доступность музыки для аккаунта, затем повторите проверку.';
  return 'Данные источника не получены. Проверьте интернет и вход в аккаунт, затем повторите проверку.';
}

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
  const raw = value?.diagnostics.configuration?.checks;
  // Renderer использует только DTO: фильтр представления также скрывает старые служебные строки.
  // Неполный набор результатов не превращается в сообщение об успешной проверке.
  const rows =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? Object.entries(raw as JsonObject).filter(
          ([key, item]) =>
            Object.hasOwn(labels, key) &&
            item &&
            typeof item === 'object' &&
            !Array.isArray(item) &&
            (item as JsonObject).code !== 'NOT_APPLICABLE',
        )
      : [];
  const checks: JsonObject = Object.fromEntries(rows);
  const required = [
    'runtime',
    'provider',
    'auth',
    'account',
    'metadata',
    'audioVariants',
    'manifestStore',
    'filesystem',
  ];
  const available =
    required.every(
      (key) => (checks[key] as JsonObject | undefined)?.status === 'ok',
    ) && rows.every(([, item]) => (item as JsonObject).status === 'ok');
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
        <Alert severity={available ? 'success' : 'warning'}>
          {available
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
                  <Stack spacing={0.5} sx={{ pr: 3 }}>
                    <Typography>{labels[key] ?? key}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {descriptions[key]}
                    </Typography>
                    {check.status !== 'ok' && (
                      <Typography variant="body2" color="warning.main">
                        {explanation(key, check, checks as JsonObject)}
                      </Typography>
                    )}
                  </Stack>
                  <Stack
                    direction="row"
                    spacing={2}
                    sx={{ alignItems: 'center' }}
                  >
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
    </Stack>
  );
}
