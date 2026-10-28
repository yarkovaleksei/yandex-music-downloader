import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  CssBaseline,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  LinearProgress,
  Paper,
  Radio,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import DownloadRounded from '@mui/icons-material/DownloadRounded';
import HomeRounded from '@mui/icons-material/HomeRounded';
import FolderOpenRounded from '@mui/icons-material/FolderOpenRounded';
import type {
  Account,
  DesktopSettings,
  JsonObject,
  PreviewDto,
  QualityPreference,
} from '@music-downloader/shared';
import type {
  DesktopApi,
  DirectorySelection,
} from '../contract/desktop-api.js';
import { History } from './History.js';
import { Settings } from './Settings.js';
import { Account as AccountPage } from './Account.js';
import { Diagnostics } from './Diagnostics.js';
import { Downloads } from './Downloads.js';
import { useDownloads } from './useDownloads.js';
import { darkTheme, theme } from './theme.js';

const qualityNames: Record<QualityPreference, string> = {
  best: 'Лучшее доступное',
  lossless: 'Без потерь',
  high: 'Высокое',
  normal: 'Обычное',
};
const kindNames = { track: 'Трек', album: 'Альбом', playlist: 'Плейлист' };
function metadata(item: JsonObject): JsonObject {
  return typeof item.track === 'object' &&
    item.track !== null &&
    !Array.isArray(item.track)
    ? (item.track as JsonObject)
    : item;
}
function artists(track: JsonObject) {
  return Array.isArray(track.artists)
    ? track.artists
        .map((artist: unknown) =>
          typeof artist === 'object' && artist !== null && 'name' in artist
            ? String(artist.name)
            : '',
        )
        .filter(Boolean)
        .join(', ')
    : '';
}
/** Главная работает только через DesktopApi; временный выбор не становится Settings. */
export function App({ api = window.desktopApi }: { api?: DesktopApi }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [authNotice, setAuthNotice] = useState('');
  const [page, setPage] = useState<
    'home' | 'downloads' | 'history' | 'settings' | 'account' | 'diagnostics'
  >('home');
  const [dark, setDark] = useState(false);
  const [url, setUrl] = useState('');
  const [preview, setPreview] = useState<PreviewDto>();
  const [previewBusy, setPreviewBusy] = useState(false);
  const [urlError, setUrlError] = useState('');
  const [quality, setQuality] = useState<QualityPreference>();
  const [qualityOpen, setQualityOpen] = useState(false);
  const [directory, setDirectory] = useState<DirectorySelection>();
  const [settings, setSettings] = useState<DesktopSettings>();
  const [accountRevision, setAccountRevision] = useState(0);
  const [creating, setCreating] = useState(false);
  const request = useRef(0);
  const downloads = useDownloads(api);
  const { setNotice } = downloads;
  async function refreshSettings() {
    const result = await api.getSettings();
    if (result.kind === 'result') {
      setSettings(result.data);
      if (result.data.outputDirectory)
        setDirectory((previous) =>
          previous?.directoryRef.startsWith('dir:')
            ? previous
            : {
                directoryRef: 'default-output',
                displayPath: result.data.outputDirectory!,
              },
        );
    }
  }
  useEffect(() => {
    void refreshSettings();
  }, [api]);
  useEffect(() => {
    async function refreshAccount() {
      const result = await api.account();
      if (result.kind === 'result') setAccount(result.data);
      else setNotice({ severity: 'error', message: result.error.message });
    }
    void refreshAccount();
    return api.subscribe((event) => {
      if (event.event === 'auth.notice') setAuthNotice(event.message);
      if (event.event === 'host.status' && event.connected)
        void refreshAccount();
    });
  }, [api, setNotice, accountRevision]);
  async function authenticate() {
    setAuthBusy(true);
    try {
      const result = await (account ? api.logout() : api.authenticate());
      if (result.kind === 'result') {
        setAccount(result.data);
        setAuthNotice('');
      } else setNotice({ severity: 'error', message: result.error.message });
    } finally {
      setAuthBusy(false);
    }
  }
  async function analyze() {
    const revision = ++request.current;
    setPreviewBusy(true);
    setPreview(undefined);
    setQuality(undefined);
    setUrlError('');
    try {
      const resolved = await api.resolve({ url });
      if (revision !== request.current) return;
      if (resolved.kind === 'error') {
        setUrlError(resolved.error.message);
        return;
      }
      const result = await api.preview({ source: resolved.data });
      if (revision !== request.current) return;
      if (result.kind === 'error') setUrlError(result.error.message);
      else {
        setPreview(result.data);
        setQuality(
          result.data.qualities?.find(
            (item) =>
              item.preference === settings?.quality && item.available > 0,
          )?.preference ??
            result.data.qualities?.find((item) => item.available > 0)
              ?.preference,
        );
      }
    } finally {
      if (revision === request.current) setPreviewBusy(false);
    }
  }
  async function chooseDirectory() {
    const result = await api.selectDirectory();
    if (result.kind === 'result') {
      if (result.data) setDirectory(result.data);
    } else setNotice({ severity: 'error', message: result.error.message });
  }
  async function start() {
    if (!preview || !quality || !directory || creating) return;
    setCreating(true);
    setPage('downloads');
    try {
      const result = await api.createDownload({
        source: preview.source,
        quality,
        directoryRef: directory.directoryRef,
      });
      if (result.kind === 'error')
        setNotice({
          severity: 'error',
          message:
            result.error.code === 'OUTCOME_UNKNOWN'
              ? 'Исход запуска неизвестен. Проверьте очередь перед новым запуском.'
              : result.error.message,
        });
      await downloads.refresh();
    } finally {
      setCreating(false);
    }
  }
  return (
    <ThemeProvider theme={dark ? darkTheme : theme}>
      <CssBaseline />
      <Box sx={{ display: 'flex', minHeight: '100vh' }}>
        <Box
          component="aside"
          sx={{
            width: 224,
            flexShrink: 0,
            borderRight: 1,
            borderColor: 'divider',
            bgcolor: 'background.paper',
            p: 2,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          <Stack
            direction="row"
            spacing={1}
            sx={{ alignItems: 'center', mb: 3 }}
          >
            <Avatar variant="rounded" sx={{ bgcolor: 'primary.main' }}>
              <DownloadRounded />
            </Avatar>
            <Typography variant="h3">Yandex Music Downloader</Typography>
          </Stack>
          <Button
            startIcon={<HomeRounded />}
            variant={page === 'home' ? 'contained' : 'text'}
            onClick={() => setPage('home')}
          >
            Главная
          </Button>
          <Button
            startIcon={<DownloadRounded />}
            variant={page === 'downloads' ? 'contained' : 'text'}
            onClick={() => setPage('downloads')}
          >
            Загрузки{' '}
            {downloads.jobs.length > 0 ? `(${downloads.jobs.length})` : ''}
          </Button>
          {(
            [
              ['history', 'История'],
              ['settings', 'Настройки'],
              ['account', 'Аккаунт'],
              ['diagnostics', 'Диагностика'],
            ] as const
          ).map(([key, label]) => (
            <Button
              key={key}
              variant={page === key ? 'contained' : 'text'}
              onClick={() => setPage(key)}
            >
              {label}
            </Button>
          ))}
          <Box sx={{ flex: 1 }} />
          <FormControlLabel
            control={
              <Switch
                checked={dark}
                onChange={(_, checked) => setDark(checked)}
              />
            }
            label="Тёмная тема"
          />
          <Divider />
          <Typography variant="body2">
            {account
              ? `Вы вошли как ${account.displayName}`
              : 'Войдите, чтобы подключить музыку'}
          </Typography>
          <Button
            disabled={authBusy || !downloads.connected}
            onClick={() => void authenticate()}
          >
            {authBusy
              ? 'Подождите…'
              : account
                ? 'Выйти'
                : 'Войти через браузер'}
          </Button>
          {!account && (
            <Typography variant="caption" color="text.secondary">
              Данные входа сохраняются в защищённом хранилище операционной
              системы.
            </Typography>
          )}
        </Box>
        <Box
          component="main"
          sx={{ p: { xs: 2, md: 4 }, flex: 1, minWidth: 0, maxWidth: 1200 }}
        >
          <Stack spacing={3}>
            <Stack direction="row" sx={{ justifyContent: 'flex-end' }}>
              <Chip
                size="small"
                color={downloads.connected ? 'success' : 'warning'}
                label={
                  downloads.connected
                    ? 'Приложение подключено'
                    : 'Восстановление связи…'
                }
              />
            </Stack>
            {!downloads.connected && (
              <Alert severity="warning">
                Связь с приложением потеряна. Дождитесь восстановления.
              </Alert>
            )}
            {authNotice && <Alert severity="info">{authNotice}</Alert>}
            {downloads.notice && (
              <Alert
                severity={downloads.notice.severity}
                closeText="Закрыть"
                onClose={() => setNotice(undefined)}
              >
                {downloads.notice.message}
              </Alert>
            )}
            {page === 'history' ? (
              <History
                api={api}
                onReplay={(succeeded) => {
                  void downloads.refresh();
                  if (succeeded) setPage('downloads');
                }}
              />
            ) : page === 'settings' ? (
              <Settings api={api} onSaved={() => void refreshSettings()} />
            ) : page === 'account' ? (
              <AccountPage
                api={api}
                onChanged={() => setAccountRevision((value) => value + 1)}
              />
            ) : page === 'diagnostics' ? (
              <Diagnostics api={api} />
            ) : page === 'downloads' ? (
              <Downloads {...downloads} />
            ) : (
              <>
                <Typography variant="h1">Музыка — в вашей коллекции</Typography>
                <Typography color="text.secondary">
                  Вставьте ссылку на трек, альбом или плейлист Яндекс Музыки
                </Typography>
                <Stack
                  component="form"
                  direction="row"
                  spacing={2}
                  onSubmit={(event) => {
                    event.preventDefault();
                    void analyze();
                  }}
                >
                  <TextField
                    fullWidth
                    label="Ссылка на музыку"
                    placeholder="https://music.yandex.ru/…"
                    value={url}
                    error={Boolean(urlError)}
                    helperText={urlError}
                    onChange={(event) => {
                      request.current++;
                      setUrl(event.target.value);
                      setPreview(undefined);
                      setQuality(undefined);
                      setPreviewBusy(false);
                      setUrlError('');
                    }}
                  />
                  <Button
                    type="submit"
                    variant="contained"
                    disabled={
                      !url.trim() || previewBusy || !downloads.connected
                    }
                  >
                    Анализировать
                  </Button>
                </Stack>
                {previewBusy && (
                  <LinearProgress aria-label="Получение предпросмотра" />
                )}
                {!preview && !previewBusy && (
                  <Paper
                    variant="outlined"
                    sx={{ p: 7, textAlign: 'center', borderStyle: 'dashed' }}
                  >
                    <DownloadRounded
                      sx={{ fontSize: 48, color: 'primary.main', mb: 2 }}
                    />
                    <Typography variant="h2">Начните со ссылки</Typography>
                    <Typography color="text.secondary" sx={{ mt: 1 }}>
                      Посмотрите состав и доступное качество перед загрузкой
                    </Typography>
                  </Paper>
                )}
                {preview && (
                  <Paper variant="outlined" sx={{ p: 3 }}>
                    <Stack spacing={3}>
                      <Stack
                        direction="row"
                        spacing={3}
                        sx={{ alignItems: 'center' }}
                      >
                        <Avatar
                          variant="rounded"
                          src={
                            preview.artwork
                              ? `data:${preview.artwork.mimeType};base64,${preview.artwork.base64}`
                              : undefined
                          }
                          alt="Обложка"
                          sx={{
                            width: 112,
                            height: 112,
                            bgcolor: 'primary.main',
                          }}
                        >
                          <DownloadRounded sx={{ fontSize: 40 }} />
                        </Avatar>
                        <Box>
                          <Typography variant="h2">
                            {preview.title || 'Название не указано'}
                          </Typography>
                          <Typography color="text.secondary">
                            {kindNames[preview.kind]} · Треков:{' '}
                            {preview.tracks.length}
                          </Typography>
                          <Typography sx={{ mt: 2 }}>
                            Автор: {preview.author || 'не указан'}
                          </Typography>
                          <Typography color="text.secondary">
                            Объём не определён
                          </Typography>
                        </Box>
                      </Stack>
                      <Box sx={{ maxHeight: 320, overflow: 'auto' }}>
                        <Box
                          component="table"
                          sx={{
                            width: '100%',
                            borderCollapse: 'collapse',
                            '& td, & th': {
                              textAlign: 'left',
                              py: 1.5,
                              borderBottom: 1,
                              borderColor: 'divider',
                            },
                          }}
                        >
                          <thead>
                            <tr>
                              <th>№</th>
                              <th>Название</th>
                              <th>Исполнитель</th>
                              <th>Длительность</th>
                            </tr>
                          </thead>
                          <tbody>
                            {preview.tracks.map((item, index) => {
                              const track = metadata(item);
                              const duration =
                                typeof track.durationMs === 'number'
                                  ? Math.floor(track.durationMs / 1000)
                                  : undefined;
                              return (
                                <tr key={index}>
                                  <td>
                                    {typeof item.position === 'number'
                                      ? item.position
                                      : index + 1}
                                  </td>
                                  <td>
                                    {String(
                                      track.title ?? 'Название не указано',
                                    )}
                                    {track.availability !== 'available' && (
                                      <Typography
                                        variant="caption"
                                        sx={{ display: 'block' }}
                                      >
                                        {track.availability === 'unknown'
                                          ? 'Доступность неизвестна'
                                          : 'Недоступен'}
                                      </Typography>
                                    )}
                                  </td>
                                  <td>{artists(track) || 'Не указан'}</td>
                                  <td>
                                    {duration === undefined
                                      ? '—'
                                      : `${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, '0')}`}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </Box>
                      </Box>
                      <Stack
                        direction="row"
                        spacing={2}
                        sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 1 }}
                      >
                        <Button
                          variant="outlined"
                          onClick={() => setQualityOpen(true)}
                          disabled={
                            !preview.qualities?.some(
                              (item) => item.available > 0,
                            )
                          }
                        >
                          Качество:{' '}
                          {quality ? qualityNames[quality] : 'Нет доступного'}
                        </Button>
                        <Button
                          variant="outlined"
                          startIcon={<FolderOpenRounded />}
                          onClick={() => void chooseDirectory()}
                          disabled={!downloads.connected}
                        >
                          Выбрать папку
                        </Button>
                        <Button
                          variant="contained"
                          startIcon={<DownloadRounded />}
                          disabled={
                            !quality ||
                            !directory ||
                            creating ||
                            !downloads.connected
                          }
                          onClick={() => void start()}
                        >
                          Добавить в загрузки
                        </Button>
                      </Stack>
                      <Typography variant="body2" color="text.secondary">
                        {directory
                          ? `Папка: ${directory.displayPath}`
                          : 'Папка не выбрана'}
                        {quality &&
                          ` · Покрытие качества: ${preview.qualities?.find((item) => item.preference === quality)?.available} / ${preview.tracks.length}`}
                      </Typography>
                    </Stack>
                  </Paper>
                )}
              </>
            )}
          </Stack>
        </Box>
      </Box>
      <Dialog
        open={qualityOpen}
        onClose={() => setQualityOpen(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Качество загрузки</DialogTitle>
        <DialogContent>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            Предпочтение применяется к доступным вариантам каждого трека.
            Частичное покрытие не гарантирует загрузку всей коллекции.
          </Typography>
          <Stack>
            {preview?.qualities
              ?.filter((item) => item.available > 0)
              .map((item) => (
                <FormControlLabel
                  key={item.preference}
                  control={
                    <Radio
                      checked={quality === item.preference}
                      onChange={() => setQuality(item.preference)}
                    />
                  }
                  label={`${qualityNames[item.preference]} · ${item.available} / ${item.total} треков`}
                />
              ))}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setQualityOpen(false)}>Готово</Button>
        </DialogActions>
      </Dialog>
    </ThemeProvider>
  );
}
