import { Updates } from './Updates.js';
import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Tabs,
  Tab,
  Button,
  FormControlLabel,
  MenuItem,
  Paper,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import type { DesktopSettings } from '@music-downloader/shared';
import type { DesktopApi, Input } from '../contract/desktop-api.js';

/** REQ-052: пути выбираются диалогом main; renderer хранит только opaque refs. */
export function Settings({
  api,
  onSaved,
  confirmedTheme,
}: {
  api: DesktopApi;
  onSaved: () => void;
  confirmedTheme?: DesktopSettings['theme'];
}) {
  const [tab, setTab] = useState('general');
  const [value, setValue] = useState<DesktopSettings>();
  const [concurrency, setConcurrency] = useState('');
  const [appInfo, setAppInfo] = useState<{ version: string; dev: boolean }>();
  const validConcurrency = /^[1-8]$/.test(concurrency);
  const [themeEdited, setThemeEdited] = useState(false);
  const [directoryRef, setDirectoryRef] = useState<string>();
  const [ffmpegRef, setFfmpegRef] = useState<string | null>();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [ffmpegMessage, setFfmpegMessage] = useState('');
  const [ffmpegBusy, setFfmpegBusy] = useState(false);
  const [help, setHelp] = useState<{ url: string; instruction: string }>();
  useEffect(() => {
    void api.getSettings().then((result) => {
      if (result.kind === 'result') {
        setValue(result.data);
        setConcurrency(String(result.data.concurrency));
      } else setMessage(result.error.message);
    });
    void api.appInfo().then((result) => {
      if (result.kind === 'result') setAppInfo(result.data);
    });
    void api.ffmpegHelp().then((result) => {
      if (result.kind === 'result') setHelp(result.data);
    });
  }, [api]);
  // F-001: подтверждённая тема sidebar обновляет только theme, сохраняя черновик и opaque refs.
  // @link planning/reviews/STEP-058/REVIEW-20261029T193045Z.md
  useEffect(() => {
    setThemeEdited(false);
    if (confirmedTheme)
      setValue((previous) =>
        previous ? { ...previous, theme: confirmedTheme } : previous,
      );
  }, [confirmedTheme]);
  async function chooseDirectory() {
    const result = await api.selectDirectory();
    if (result.kind === 'result' && result.data && value) {
      setDirectoryRef(result.data.directoryRef);
      setValue({ ...value, outputDirectory: result.data.displayPath });
    } else if (result.kind === 'error') setMessage(result.error.message);
  }
  async function chooseFfmpeg() {
    const result = await api.selectFfmpeg();
    if (result.kind === 'result' && result.data && value) {
      setFfmpegRef(result.data.executableRef);
      setValue({ ...value, ffmpegPath: result.data.displayPath });
    } else if (result.kind === 'error') setMessage(result.error.message);
  }
  async function checkFfmpeg() {
    setFfmpegBusy(true);
    try {
      const result = await api.checkFfmpeg(
        ffmpegRef === undefined ? {} : { ffmpegRef },
      );
      setFfmpegMessage(
        result.kind === 'result'
          ? result.data.available
            ? 'FFmpeg найден и запускается.'
            : 'FFmpeg не найден или не запускается. Основные загрузки продолжат работать. Установите его по инструкции ниже либо выберите исполняемый файл.'
          : 'Не удалось проверить FFmpeg. Выберите исполняемый файл и повторите проверку; основные загрузки продолжат работать.',
      );
    } finally {
      setFfmpegBusy(false);
    }
  }
  async function save() {
    if (!value || !validConcurrency) return;
    setBusy(true);
    setMessage('');
    const input: Input<'saveSettings'> = {
      quality: value.quality,
      concurrency: Number(concurrency),
      naming: value.naming,
      overwrite: value.overwrite,
      logging: value.logging,
      writeTags: value.writeTags ?? true,
      saveCoverFile: value.saveCoverFile ?? true,
      writeM3u8: value.writeM3u8 ?? true,

      theme: themeEdited
        ? (value.theme ?? 'light')
        : (confirmedTheme ?? value.theme ?? 'light'),
      ...(directoryRef === undefined ? {} : { directoryRef }),
      ...(ffmpegRef === undefined ? {} : { ffmpegRef }),
    };
    try {
      const result = await api.saveSettings(input);
      if (result.kind === 'result') {
        setValue(result.data);
        setConcurrency(String(result.data.concurrency));
        setThemeEdited(false);
        setDirectoryRef(undefined);
        setFfmpegRef(undefined);
        setMessage(
          'Настройки сохранены. Изменения параллельности и логирования применятся после перезапуска.',
        );
        onSaved();
      } else {
        setMessage(
          result.error.code === 'OUTCOME_UNKNOWN'
            ? 'Исход сохранения неизвестен. Загружены сохранённые настройки; проверьте значения.'
            : result.error.message,
        );
        const current = await api.getSettings();
        if (current.kind === 'result') {
          setValue(current.data);
          setConcurrency(String(current.data.concurrency));
          setThemeEdited(false);
          onSaved();
        }
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <Stack spacing={3}>
      <Typography variant="h1">Настройки</Typography>
      <Typography color="text.secondary">
        Загрузка музыки и параметры приложения
      </Typography>
      <Tabs
        value={tab}
        onChange={(_, next: string) => setTab(next)}
        aria-label="Разделы настроек"
        sx={{ borderBottom: 1, borderColor: 'divider' }}
      >
        {[
          ['general', 'Основные'],
          ['download', 'Загрузка'],
          ['files', 'Файлы'],
          ['appearance', 'Внешний вид'],
          ['about', 'О программе'],
        ].map(([key, label]) => (
          <Tab key={key} value={key} label={label} />
        ))}
      </Tabs>
      {tab === 'about' && (
        <>
          <Typography variant="h2">Yandex Music Downloader</Typography>
          <Typography color="text.secondary">
            Музыка с вами, даже офлайн
          </Typography>
          <Typography>
            Версия:{' '}
            {appInfo
              ? `${appInfo.version}${appInfo.dev ? ' (dev)' : ''}`
              : 'Загружаем…'}
          </Typography>
          <Updates api={api} />
        </>
      )}
      {message && <Alert severity="info">{message}</Alert>}
      {value && tab !== 'about' && (
        <Paper variant="outlined" sx={{ p: 3 }}>
          <Stack spacing={3}>
            <Box hidden={tab !== 'general'}>
              <Stack spacing={3}>
                <Stack direction="row" spacing={2}>
                  <TextField
                    label="Папка загрузок"
                    value={value.outputDirectory ?? 'Не выбрана'}
                    slotProps={{ input: { readOnly: true } }}
                    fullWidth
                  />
                  <Button
                    sx={{ whiteSpace: 'nowrap', minWidth: 160 }}
                    onClick={() => void chooseDirectory()}
                  >
                    Выбрать папку
                  </Button>
                </Stack>
                <TextField
                  select
                  label="Качество по умолчанию"
                  value={value.quality}
                  onChange={(e) =>
                    setValue({
                      ...value,
                      quality: e.target.value as DesktopSettings['quality'],
                    })
                  }
                >
                  <MenuItem value="best">Лучшее доступное</MenuItem>
                  <MenuItem value="lossless">Без потерь</MenuItem>
                  <MenuItem value="high">Высокое</MenuItem>
                  <MenuItem value="normal">Обычное</MenuItem>
                </TextField>
                {/* STEP-059: отдельный черновик не сбрасывает выбранные пути и тему. */}
                <TextField
                  type="number"
                  label="Параллельных загрузок"
                  value={concurrency}
                  onChange={(event) => setConcurrency(event.target.value)}
                  error={!validConcurrency}
                  helperText={
                    !validConcurrency
                      ? 'Введите целое число от 1 до 8.'
                      : undefined
                  }
                  slotProps={{ htmlInput: { min: 1, max: 8, step: 1 } }}
                  sx={{ width: 220 }}
                />
              </Stack>
            </Box>
            <Box hidden={tab !== 'files'}>
              <Stack spacing={3}>
                <TextField
                  select
                  label="Имена и каталоги"
                  value={value.naming}
                  onChange={(e) =>
                    setValue({
                      ...value,
                      naming: e.target.value as DesktopSettings['naming'],
                    })
                  }
                >
                  <MenuItem value="collection">
                    По коллекции: номер — исполнитель — трек
                  </MenuItem>
                  <MenuItem value="album">
                    Альбомы: исполнитель / альбом / номер — трек
                  </MenuItem>
                </TextField>
                <FormControlLabel
                  label="Заменять существующие файлы"
                  control={
                    <Switch
                      checked={value.overwrite}
                      onChange={(_, checked) =>
                        setValue({ ...value, overwrite: checked })
                      }
                    />
                  }
                />
                {(
                  [
                    [
                      'saveCoverFile',
                      'Скачивать обложки альбомов',
                      'Сохранять отдельный cover.jpg; встроенная обложка сохраняется независимо.',
                    ],
                    [
                      'writeTags',
                      'Сохранять метаданные (ID3/FLAC tags)',
                      'Записывать текстовые теги в аудиофайлы.',
                    ],
                    [
                      'writeM3u8',
                      'Создавать плейлисты .m3u8',
                      'Генерировать файл плейлиста для загруженных плейлистов.',
                    ],
                  ] as const
                ).map(([key, label, description]) => (
                  <Box key={key}>
                    <FormControlLabel
                      label={label}
                      control={
                        <Switch
                          checked={value[key] ?? true}
                          onChange={(_, checked) =>
                            setValue({ ...value, [key]: checked })
                          }
                        />
                      }
                    />
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ ml: 6 }}
                    >
                      {description}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            </Box>
            <Box hidden={tab !== 'download'}>
              <Stack spacing={3}>
                <Typography variant="h2">Диагностика и журнал</Typography>
                <Typography color="text.secondary">
                  Дополнительная проверка FFmpeg запускается только по вашей
                  команде.
                </Typography>
                <Stack direction="row" spacing={2}>
                  <TextField
                    fullWidth
                    label="FFmpeg"
                    value={value.ffmpegPath ?? 'Автоматически из PATH'}
                    slotProps={{ input: { readOnly: true } }}
                  />
                  <Button onClick={() => void chooseFfmpeg()}>
                    Выбрать FFmpeg
                  </Button>
                  <Button
                    onClick={() => {
                      setFfmpegRef(null);
                      setValue({ ...value, ffmpegPath: null });
                    }}
                  >
                    Автоматически
                  </Button>
                </Stack>
                <Button
                  disabled={ffmpegBusy}
                  onClick={() => void checkFfmpeg()}
                >
                  {ffmpegBusy ? 'Проверяем FFmpeg…' : 'Проверить FFmpeg'}
                </Button>
                {ffmpegMessage && (
                  <Alert severity="info">{ffmpegMessage}</Alert>
                )}
                <Alert severity="info">
                  FFmpeg необязателен: базовые загрузки и запись тегов работают
                  без него. Устанавливать его для обычного использования не
                  нужно.
                  {help && (
                    <>
                      {' '}
                      {help.instruction}{' '}
                      <Button
                        size="small"
                        onClick={() => void api.openExternal({ url: help.url })}
                      >
                        Скачать FFmpeg
                      </Button>
                    </>
                  )}
                </Alert>
                <TextField
                  select
                  label="Уровень журнала"
                  value={value.logging}
                  onChange={(e) =>
                    setValue({
                      ...value,
                      logging: e.target.value as DesktopSettings['logging'],
                    })
                  }
                >
                  {[
                    ['error', 'Ошибки'],
                    ['warn', 'Предупреждения'],
                    ['info', 'Обычный'],
                    ['debug', 'Подробный'],
                    ['trace', 'Трассировка'],
                  ].map(([key, label]) => (
                    <MenuItem key={key} value={key}>
                      {label}
                    </MenuItem>
                  ))}
                </TextField>
              </Stack>
            </Box>
            <Box hidden={tab !== 'appearance'}>
              <FormControlLabel
                label="Тёмная тема"
                control={
                  <Switch
                    checked={value.theme === 'dark'}
                    onChange={(_, checked) => {
                      setThemeEdited(true);
                      setValue({ ...value, theme: checked ? 'dark' : 'light' });
                    }}
                  />
                }
              />
              <Typography color="text.secondary">
                Тема сохранится после перезапуска приложения.
              </Typography>
            </Box>
            {tab !== 'about' && (
              <>
                <Alert severity="info">
                  Параллельность и уровень журнала применяются после
                  перезапуска. Остальные настройки используются новыми
                  заданиями; текущие загрузки сохраняют свои параметры.
                </Alert>
                <Button
                  variant="contained"
                  disabled={busy || !validConcurrency}
                  onClick={() => void save()}
                >
                  Сохранить настройки
                </Button>
              </>
            )}
          </Stack>
        </Paper>
      )}
    </Stack>
  );
}
