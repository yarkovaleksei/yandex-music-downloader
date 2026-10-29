import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Divider,
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
}: {
  api: DesktopApi;
  onSaved: () => void;
}) {
  const [value, setValue] = useState<DesktopSettings>();
  const [directoryRef, setDirectoryRef] = useState<string>();
  const [ffmpegRef, setFfmpegRef] = useState<string | null>();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [ffmpegMessage, setFfmpegMessage] = useState('');
  const [ffmpegBusy, setFfmpegBusy] = useState(false);
  const [help, setHelp] = useState<{ url: string; instruction: string }>();
  useEffect(() => {
    void api.getSettings().then((result) => {
      if (result.kind === 'result') setValue(result.data);
      else setMessage(result.error.message);
    });
    void api.ffmpegHelp().then((result) => {
      if (result.kind === 'result') setHelp(result.data);
    });
  }, [api]);
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
    if (!value) return;
    setBusy(true);
    setMessage('');
    const input: Input<'saveSettings'> = {
      quality: value.quality,
      concurrency: value.concurrency,
      naming: value.naming,
      overwrite: value.overwrite,
      logging: value.logging,
      ...(directoryRef === undefined ? {} : { directoryRef }),
      ...(ffmpegRef === undefined ? {} : { ffmpegRef }),
    };
    try {
      const result = await api.saveSettings(input);
      if (result.kind === 'result') {
        setValue(result.data);
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
        if (current.kind === 'result') setValue(current.data);
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
      {message && <Alert severity="info">{message}</Alert>}
      {value && (
        <Paper variant="outlined" sx={{ p: 3 }}>
          <Stack spacing={3}>
            <Typography variant="h2">Загрузка</Typography>
            <Stack direction="row" spacing={2}>
              <TextField
                label="Папка загрузок"
                value={value.outputDirectory ?? 'Не выбрана'}
                slotProps={{ input: { readOnly: true } }}
                fullWidth
              />
              <Button onClick={() => void chooseDirectory()}>
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
            <TextField
              select
              label="Параллельных загрузок"
              value={value.concurrency}
              onChange={(e) =>
                setValue({ ...value, concurrency: Number(e.target.value) })
              }
            >
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                <MenuItem key={n} value={n}>
                  {n}
                </MenuItem>
              ))}
            </TextField>
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
            <Divider />
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
            <Button disabled={ffmpegBusy} onClick={() => void checkFfmpeg()}>
              {ffmpegBusy ? 'Проверяем FFmpeg…' : 'Проверить FFmpeg'}
            </Button>
            {ffmpegMessage && <Alert severity="info">{ffmpegMessage}</Alert>}
            <Alert severity="info">
              FFmpeg необязателен: базовые загрузки и запись тегов работают без
              него. Устанавливать его для обычного использования не нужно.
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
            <Alert severity="info">
              Параллельность и уровень журнала применяются после перезапуска.
              Остальные настройки используются новыми заданиями; текущие
              загрузки сохраняют свои параметры.
            </Alert>
            <Button
              variant="contained"
              disabled={busy}
              onClick={() => void save()}
            >
              Сохранить настройки
            </Button>
          </Stack>
        </Paper>
      )}
    </Stack>
  );
}
