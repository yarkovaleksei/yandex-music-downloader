import { Updates } from './Updates.js';
import { useEffect, useRef, useState } from 'react';
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
import FileOpenRounded from '@mui/icons-material/FileOpenRounded';
import FolderOpenRounded from '@mui/icons-material/FolderOpenRounded';
import OpenInNewRounded from '@mui/icons-material/OpenInNewRounded';
import RefreshRounded from '@mui/icons-material/RefreshRounded';
import SaveRounded from '@mui/icons-material/SaveRounded';
import SearchRounded from '@mui/icons-material/SearchRounded';
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
  const [tab, setTab] = useState('download');
  const [value, setValue] = useState<DesktopSettings>();
  const [concurrency, setConcurrency] = useState('');
  const [appInfo, setAppInfo] = useState<{ version: string; dev: boolean }>();
  const validConcurrency = /^[1-8]$/.test(concurrency);
  const [directoryRef, setDirectoryRef] = useState<string>();
  const [ffmpegRef, setFfmpegRef] = useState<string | null>();
  const [message, setMessage] = useState<{
    severity: 'success' | 'error';
    text: string;
  }>();
  const [busy, setBusy] = useState(false);
  const [ffmpegStatus, setFfmpegStatus] = useState<
    'available' | 'missing' | 'error'
  >();
  const [ffmpegBusy, setFfmpegBusy] = useState(false);
  const ffmpegRequest = useRef(0);
  const [help, setHelp] = useState<{ url: string; instruction: string }>();
  useEffect(() => {
    void api.getSettings().then((result) => {
      if (result.kind === 'result') {
        setValue(result.data);
        setConcurrency(String(result.data.concurrency));
      } else setMessage({ severity: 'error', text: result.error.message });
    });
    // Проверка сохранённого FFmpeg при открытии; ничего не скачивает (ADR-013).
    void checkFfmpeg(undefined);
    void api.appInfo().then((result) => {
      if (result.kind === 'result') setAppInfo(result.data);
    });
    void api.ffmpegHelp().then((result) => {
      if (result.kind === 'result') setHelp(result.data);
    });
  }, [api]);
  // F-001: тема переключается в sidebar; черновик и opaque refs сохраняются.
  useEffect(() => {
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
    } else if (result.kind === 'error')
      setMessage({ severity: 'error', text: result.error.message });
  }
  async function chooseFfmpeg() {
    const result = await api.selectFfmpeg();
    if (result.kind === 'result' && result.data && value) {
      setFfmpegRef(result.data.executableRef);
      setValue({ ...value, ffmpegPath: result.data.displayPath });
      void checkFfmpeg(result.data.executableRef);
    } else if (result.kind === 'error')
      setMessage({ severity: 'error', text: result.error.message });
  }
  /** undefined — сохранённый путь, null — поиск в PATH, строка — выбранный файл. */
  async function checkFfmpeg(ref: string | null | undefined) {
    // Результат устаревшей проверки не перезаписывает проверку нового пути.
    const revision = ++ffmpegRequest.current;
    setFfmpegBusy(true);
    try {
      const result = await api.checkFfmpeg(
        ref === undefined ? {} : { ffmpegRef: ref },
      );
      if (revision !== ffmpegRequest.current) return;
      setFfmpegStatus(
        result.kind === 'error'
          ? 'error'
          : result.data.available
            ? 'available'
            : 'missing',
      );
    } catch {
      // Потерянная связь с приложением — тоже «не удалось проверить».
      if (revision === ffmpegRequest.current) setFfmpegStatus('error');
    } finally {
      if (revision === ffmpegRequest.current) setFfmpegBusy(false);
    }
  }
  async function openLogFolder() {
    const result = await api.openLogFolder().catch(() => undefined);
    if (result?.kind !== 'result')
      setMessage({
        severity: 'error',
        text: 'Не удалось открыть папку журнала.',
      });
  }
  async function save() {
    if (!value || !validConcurrency) return;
    setBusy(true);
    setMessage(undefined);
    const input: Input<'saveSettings'> = {
      quality: value.quality,
      concurrency: Number(concurrency),
      naming: value.naming,
      overwrite: value.overwrite,
      logging: value.logging,
      writeTags: value.writeTags ?? true,
      saveCoverFile: value.saveCoverFile ?? true,
      writeM3u8: value.writeM3u8 ?? true,

      theme: confirmedTheme ?? value.theme ?? 'light',
      ...(directoryRef === undefined ? {} : { directoryRef }),
      ...(ffmpegRef === undefined ? {} : { ffmpegRef }),
    };
    try {
      const result = await api.saveSettings(input);
      if (result.kind === 'result') {
        setValue(result.data);
        setConcurrency(String(result.data.concurrency));
        setDirectoryRef(undefined);
        setFfmpegRef(undefined);
        setMessage({
          severity: 'success',
          text: 'Настройки сохранены. Новые загрузки используют их, текущие продолжат с прежними параметрами.',
        });
        onSaved();
      } else {
        setMessage({
          severity: 'error',
          text:
            result.error.code === 'OUTCOME_UNKNOWN'
              ? 'Исход сохранения неизвестен. Загружены сохранённые настройки; проверьте значения.'
              : result.error.message,
        });
        const current = await api.getSettings();
        if (current.kind === 'result') {
          setValue(current.data);
          setConcurrency(String(current.data.concurrency));
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
        onChange={(_, next: string) => {
          // Итог сохранения относится к форме, а не к открытой вкладке.
          setMessage(undefined);
          setTab(next);
        }}
        aria-label="Разделы настроек"
        sx={{ borderBottom: 1, borderColor: 'divider' }}
      >
        {[
          ['download', 'Загрузка'],
          ['files', 'Файлы'],
          ['advanced', 'Дополнительно'],
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
      {message && <Alert severity={message.severity}>{message.text}</Alert>}
      {value && tab !== 'about' && (
        <Paper variant="outlined" sx={{ p: 3 }}>
          <Stack spacing={3}>
            <Box hidden={tab !== 'download'}>
              <Stack spacing={3}>
                <Stack direction="row" spacing={2}>
                  <TextField
                    label="Папка загрузок"
                    value={value.outputDirectory ?? 'Не выбрана'}
                    slotProps={{ input: { readOnly: true } }}
                    fullWidth
                  />
                  <Button
                    startIcon={<FolderOpenRounded />}
                    sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}
                    onClick={() => void chooseDirectory()}
                  >
                    Выбрать папку
                  </Button>
                </Stack>
                <Stack
                  direction="row"
                  spacing={2}
                  sx={{ alignItems: 'flex-start' }}
                >
                  <TextField
                    select
                    fullWidth
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
                  {/* отдельный черновик не сбрасывает выбранные пути и тему. */}
                  <TextField
                    type="number"
                    label="Параллельных загрузок"
                    value={concurrency}
                    onChange={(event) => setConcurrency(event.target.value)}
                    error={!validConcurrency}
                    helperText={
                      !validConcurrency
                        ? 'Введите целое число от 1 до 8.'
                        : 'Применится после перезапуска приложения.'
                    }
                    slotProps={{ htmlInput: { min: 1, max: 8, step: 1 } }}
                    sx={{ width: 220, flexShrink: 0 }}
                  />
                </Stack>
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
            {/* Редко нужные настройки: журнал и необязательный FFmpeg. */}
            <Box hidden={tab !== 'advanced'}>
              <Stack spacing={3}>
                <Stack direction="row" spacing={2}>
                  <TextField
                    fullWidth
                    label="FFmpeg"
                    value={value.ffmpegPath ?? 'Автоматически из PATH'}
                    slotProps={{ input: { readOnly: true } }}
                  />
                  <Button
                    startIcon={<FileOpenRounded />}
                    sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}
                    onClick={() => void chooseFfmpeg()}
                  >
                    Указать файл ffmpeg
                  </Button>
                  <Button
                    startIcon={<SearchRounded />}
                    sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}
                    disabled={value.ffmpegPath === null}
                    onClick={() => {
                      setFfmpegRef(null);
                      setValue({ ...value, ffmpegPath: null });
                      void checkFfmpeg(null);
                    }}
                  >
                    Искать в PATH
                  </Button>
                </Stack>
                {/* Сообщение появляется только при проблеме; найденный FFmpeg не требует внимания. */}
                {(ffmpegStatus === 'missing' || ffmpegStatus === 'error') && (
                  <Alert
                    severity="warning"
                    action={
                      <Button
                        size="small"
                        startIcon={<RefreshRounded />}
                        sx={{ whiteSpace: 'nowrap' }}
                        disabled={ffmpegBusy}
                        onClick={() => void checkFfmpeg(ffmpegRef)}
                      >
                        {ffmpegBusy ? 'Проверяем…' : 'Проверить снова'}
                      </Button>
                    }
                  >
                    {ffmpegStatus === 'missing'
                      ? 'FFmpeg не найден или не запускается.'
                      : 'Не удалось проверить FFmpeg.'}{' '}
                    Он необязателен: загрузки и запись тегов работают без него.
                    {help && (
                      <>
                        {' '}
                        {help.instruction}{' '}
                        <Button
                          size="small"
                          endIcon={<OpenInNewRounded />}
                          onClick={() =>
                            void api.openExternal({ url: help.url })
                          }
                        >
                          Скачать FFmpeg
                        </Button>
                      </>
                    )}
                  </Alert>
                )}
                <Typography color="text.secondary">
                  Журнал записывает загрузки и ошибки: какие задания
                  запускались, какие треки не скачались и почему. Пароли и
                  токены в него не попадают. Если что-то пошло не так, приложите
                  файл журнала к сообщению об ошибке.
                </Typography>
                <Stack
                  direction="row"
                  spacing={2}
                  sx={{ alignItems: 'flex-start' }}
                >
                  <TextField
                    select
                    fullWidth
                    label="Подробность журнала"
                    helperText="Применится после перезапуска приложения."
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
                  <Button
                    startIcon={<FolderOpenRounded />}
                    sx={{ whiteSpace: 'nowrap', flexShrink: 0, mt: 1 }}
                    onClick={() => void openLogFolder()}
                  >
                    Открыть папку журнала
                  </Button>
                </Stack>
              </Stack>
            </Box>
            <Stack direction="row" sx={{ justifyContent: 'flex-end' }}>
              <Button
                variant="contained"
                startIcon={<SaveRounded />}
                disabled={busy || !validConcurrency}
                onClick={() => void save()}
              >
                Сохранить настройки
              </Button>
            </Stack>
          </Stack>
        </Paper>
      )}
    </Stack>
  );
}
