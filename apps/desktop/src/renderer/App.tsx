import { tracksQuantity } from './quantity.js';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  IconButton,
  InputAdornment,
  AlertTitle,
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
import CloseRounded from '@mui/icons-material/CloseRounded';
import MusicNoteRounded from '@mui/icons-material/MusicNoteRounded';
import HomeRounded from '@mui/icons-material/HomeRounded';
import HistoryRounded from '@mui/icons-material/HistoryRounded';
import SettingsRounded from '@mui/icons-material/SettingsRounded';
import PersonRounded from '@mui/icons-material/PersonRounded';
import HealthAndSafetyRounded from '@mui/icons-material/HealthAndSafetyRounded';
import FolderOpenRounded from '@mui/icons-material/FolderOpenRounded';
import type {
  Account,
  DesktopSettings,
  JsonObject,
  PreviewDto,
  QualityPreference,
  VariantSelection,
  ArtworkDto,
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
function artworkUrl(artwork?: ArtworkDto) {
  return artwork
    ? `data:${artwork.mimeType};base64,${artwork.base64}`
    : undefined;
}
function variantName(value: VariantSelection) {
  return `${value.codec.toUpperCase()} / ${value.container.toUpperCase()}${value.bitrate === undefined ? ' · битрейт не указан' : ` · ${value.bitrate} кбит/с`}${value.lossless ? ' · без потерь' : ''}`;
}
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
  const [variant, setVariant] = useState<VariantSelection>();
  const [draftQuality, setDraftQuality] = useState<QualityPreference>();
  const [draftVariant, setDraftVariant] = useState<VariantSelection>();
  const [themeBusy, setThemeBusy] = useState(false);
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
      setDark(result.data.theme === 'dark');
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
    setVariant(undefined);
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
  // REQ-058: тема подтверждается сохранённым снимком; неизвестный исход перечитывается без повтора.
  async function saveTheme(checked: boolean) {
    if (!settings) return;
    setThemeBusy(true);
    try {
      const result = await api.saveSettings({
        quality: settings.quality,
        concurrency: settings.concurrency,
        naming: settings.naming,
        overwrite: settings.overwrite,
        logging: settings.logging,
        writeTags: settings.writeTags ?? true,
        saveCoverFile: settings.saveCoverFile ?? true,
        writeM3u8: settings.writeM3u8 ?? true,

        theme: checked ? 'dark' : 'light',
      });
      if (result.kind === 'result') {
        setSettings(result.data);
        setDark(result.data.theme === 'dark');
      } else {
        setNotice({ severity: 'error', message: result.error.message });
        await refreshSettings();
      }
    } finally {
      setThemeBusy(false);
    }
  }
  function changeUrl(value: string) {
    request.current++;
    setUrl(value);
    setPreview(undefined);
    setQuality(undefined);
    setVariant(undefined);
    setQualityOpen(false);
    setPreviewBusy(false);
    setUrlError('');
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
        ...(variant ? { variantSelection: variant } : {}),
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
      {/* Цветовая схема распространяется и на встроенный календарь браузера. */}
      <CssBaseline enableColorScheme />
      <Box sx={{ display: 'flex', minHeight: '100vh' }}>
        <Box
          component="aside"
          sx={{
            width: 224,
            position: 'sticky',
            top: 0,
            height: '100vh',
            overflowY: 'auto',
            '& > .MuiButton-root': {
              justifyContent: 'flex-start',
              boxShadow: 'none',
              '&.MuiButton-contained': {
                bgcolor: 'action.selected',
                // @link docs/brand/brandbook.md Активный пункт сохраняет контраст AA в обеих темах.
                color: dark ? 'primary.main' : 'primary.dark',
              },
              textAlign: 'left',
            },
            flexShrink: 0,
            borderRight: 1,
            borderColor: 'divider',
            bgcolor: 'background.paper',
            p: 2,
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
          }}
        >
          <Stack
            direction="row"
            spacing={1}
            sx={{ alignItems: 'center', mb: 3 }}
          >
            {/* Утверждённая иконка сохраняет единый образ приложения. @link docs/brand/brandbook.md */}
            <Avatar
              variant="rounded"
              src={
                new URL('../../../../docs/brand/icon.png', import.meta.url).href
              }
              alt=""
              sx={{ bgcolor: 'transparent' }}
            />
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
          {/* Иконки Rounded сохраняют единый визуальный ряд пунктов меню. */}
          {(
            [
              ['history', 'История', HistoryRounded],
              ['settings', 'Настройки', SettingsRounded],
              ['account', 'Аккаунт', PersonRounded],
              ['diagnostics', 'Диагностика', HealthAndSafetyRounded],
            ] as const
          ).map(([key, label, Icon]) => (
            <Button
              key={key}
              startIcon={<Icon />}
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
                disabled={themeBusy}
                onChange={(_, checked) => void saveTheme(checked)}
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
          sx={{ p: { xs: 2, md: 4 }, flex: 1, minWidth: 0 }}
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
                sx={{
                  border: 1,
                  borderColor: `${downloads.notice.severity}.light`,
                  borderRadius: 2,
                }}
              >
                <AlertTitle>
                  {downloads.notice.severity === 'success'
                    ? 'Загрузка завершена'
                    : downloads.notice.severity === 'error'
                      ? 'Ошибка загрузки'
                      : 'Уведомление'}
                </AlertTitle>
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
              <Settings
                api={api}
                confirmedTheme={settings?.theme}
                onSaved={() => void refreshSettings()}
              />
            ) : page === 'account' ? (
              // смена аккаунта в sidebar сбрасывает данные и pending avatar страницы.
              <AccountPage
                key={account?.id ?? 'signed-out'}
                api={api}
                onChanged={() => setAccountRevision((value) => value + 1)}
              />
            ) : page === 'diagnostics' ? (
              <Diagnostics api={api} />
            ) : page === 'downloads' ? (
              <Downloads {...downloads} />
            ) : (
              <>
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
                    slotProps={{
                      input: {
                        endAdornment: url ? (
                          <InputAdornment position="end">
                            <IconButton
                              aria-label="Очистить ссылку"
                              onClick={() => changeUrl('')}
                            >
                              <CloseRounded />
                            </IconButton>
                          </InputAdornment>
                        ) : undefined,
                      },
                    }}
                    onChange={(event) => changeUrl(event.target.value)}
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
                    <Avatar
                      variant="rounded"
                      sx={{
                        width: 80,
                        height: 80,
                        bgcolor: 'primary.main',
                        mx: 'auto',
                        mb: 3,
                      }}
                    >
                      <MusicNoteRounded sx={{ fontSize: 48 }} />
                    </Avatar>
                    <Typography variant="h2">
                      Вставьте ссылку на Яндекс Музыку
                    </Typography>
                    <Typography color="text.secondary" sx={{ mt: 1 }}>
                      Скачивайте отдельные треки, альбомы и плейлисты с
                      сохранением метаданных и обложек
                    </Typography>
                  </Paper>
                )}
                {!preview && !previewBusy && (
                  <Stack
                    spacing={1}
                    sx={{ pl: 2, borderLeft: 1, borderColor: 'divider' }}
                  >
                    <Typography variant="h3">Примеры ссылок</Typography>
                    {[
                      'https://music.yandex.ru/album/123456',
                      'https://music.yandex.ru/track/987654',
                      'https://music.yandex.ru/users/username/playlists/123456',
                    ].map((example) => (
                      <Button
                        key={example}
                        sx={{
                          justifyContent: 'flex-start',
                          color: 'text.secondary',
                        }}
                        onClick={() => changeUrl(example)}
                      >
                        ＋ {example}
                      </Button>
                    ))}
                  </Stack>
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
                            width: 144,
                            height: 144,
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
                          <Typography color="text.secondary" sx={{ mt: 1 }}>
                            {preview.description || 'Описание не указано'}
                          </Typography>
                          <Stack
                            direction="row"
                            spacing={1}
                            sx={{ alignItems: 'center', mt: 2 }}
                          >
                            <Avatar
                              src={artworkUrl(preview.authorArtwork)}
                              sx={{ width: 28, height: 28 }}
                            >
                              <PersonRounded fontSize="small" />
                            </Avatar>
                            <Typography>
                              Автор: {preview.author || 'не указан'}
                            </Typography>
                          </Stack>
                          <Typography color="text.secondary">
                            Продолжительность:{' '}
                            {preview.durationMs === undefined
                              ? 'не указана'
                              : `${Math.floor(preview.durationMs / 3600000)} ч ${Math.floor(preview.durationMs / 60000) % 60} мин`}
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
                                    <Avatar
                                      variant="rounded"
                                      src={artworkUrl(
                                        (item.artwork ??
                                          track.artwork) as unknown as
                                          ArtworkDto | undefined,
                                      )}
                                      sx={{
                                        display: 'inline-flex',
                                        width: 32,
                                        height: 32,
                                        mr: 1,
                                        verticalAlign: 'middle',
                                      }}
                                    >
                                      <MusicNoteRounded fontSize="small" />
                                    </Avatar>
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
                          onClick={() => {
                            setDraftQuality(quality);
                            setDraftVariant(variant);
                            setQualityOpen(true);
                          }}
                          disabled={
                            !preview.qualities?.some(
                              (item) => item.available > 0,
                            )
                          }
                        >
                          Качество:{' '}
                          {variant
                            ? variantName(variant)
                            : quality
                              ? qualityNames[quality]
                              : 'Нет доступного'}
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
                          ` · Покрытие качества: ${variant ? preview.variants?.find((item) => JSON.stringify(item.selection) === JSON.stringify(variant))?.available : preview.qualities?.find((item) => item.preference === quality)?.available} / ${preview.tracks.length}`}
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
                      checked={
                        !draftVariant && draftQuality === item.preference
                      }
                      onChange={() => {
                        setDraftQuality(item.preference);
                        setDraftVariant(undefined);
                      }}
                    />
                  }
                  label={`${qualityNames[item.preference]} · ${item.available} / ${tracksQuantity(item.total)}`}
                />
              ))}
            {preview?.variants?.map((item) => (
              <FormControlLabel
                key={JSON.stringify(item.selection)}
                disabled={item.available === 0}
                control={
                  <Radio
                    checked={
                      JSON.stringify(draftVariant) ===
                      JSON.stringify(item.selection)
                    }
                    onChange={() => setDraftVariant(item.selection)}
                  />
                }
                label={`${variantName(item.selection)} · ${item.available} / ${tracksQuantity(item.total)}${item.available === 0 ? ' · недоступно' : ''}`}
              />
            ))}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setQualityOpen(false)}>Отмена</Button>
          <Button
            variant="contained"
            disabled={!draftQuality && !draftVariant}
            onClick={() => {
              setQuality(draftQuality);
              setVariant(draftVariant);
              setQualityOpen(false);
            }}
          >
            Применить
          </Button>
        </DialogActions>
      </Dialog>
    </ThemeProvider>
  );
}
