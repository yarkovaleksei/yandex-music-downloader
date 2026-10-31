import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import Markdown from 'markdown-to-jsx';
import DownloadRounded from '@mui/icons-material/DownloadRounded';
import FolderOpenRounded from '@mui/icons-material/FolderOpenRounded';
import NewReleasesRounded from '@mui/icons-material/NewReleasesRounded';
import RefreshRounded from '@mui/icons-material/RefreshRounded';
import type { DesktopApi } from '../contract/desktop-api.js';
import type { UpdateView } from '../contract/update.js';

/** @link docs/architecture-decisions/ADR-019-portable-distribution-and-updates.md Renderer запрашивает действие, но не передаёт URL или путь пакета. */
export function Updates({ api }: { api: DesktopApi }) {
  const [view, setView] = useState<UpdateView>();
  const [busy, setBusy] = useState(false);
  // undefined — описание загружается, null — недоступно.
  const [notes, setNotes] = useState<string | null>();
  const [notesOpen, setNotesOpen] = useState(false);
  async function showNotes() {
    setNotesOpen(true);
    setNotes(undefined);
    try {
      const result = await api.updateNotes();
      setNotes(result.kind === 'result' ? result.data : null);
    } catch {
      setNotes(null);
    }
  }
  async function invoke(
    method: 'checkUpdate' | 'downloadUpdate' | 'openUpdateFolder',
  ) {
    setBusy(true);
    try {
      const result = await api[method]();
      if (result.kind === 'result') setView(result.data);
      else
        setView({
          status: 'error',
          currentVersion: '',
          message: 'Не удалось проверить обновление. Повторите попытку.',
        });
    } catch {
      setView({
        status: 'error',
        currentVersion: '',
        message: 'Связь с приложением потеряна. Повторите попытку.',
      });
    } finally {
      setBusy(false);
    }
  }
  return (
    <Paper variant="outlined" sx={{ p: 3 }}>
      <Stack spacing={2}>
        <Typography variant="h2">Обновления приложения</Typography>
        <Typography>
          Приложение не обновляется само: после скачивания закройте его и
          замените скачанным файлом. Настройки и история останутся на месте.
        </Typography>
        {view && (
          <Alert
            severity={view.status === 'error' ? 'error' : 'info'}
            sx={{ alignItems: 'center' }}
          >
            {view.message}
            {view.version && ` Версия: ${view.version}.`}
            {(view.status === 'available' || view.status === 'ready') && (
              <Button
                size="small"
                startIcon={<NewReleasesRounded />}
                sx={{ ml: 1 }}
                onClick={() => void showNotes()}
              >
                Что нового
              </Button>
            )}
          </Alert>
        )}
        <Stack direction="row" spacing={2}>
          <Button
            startIcon={<RefreshRounded />}
            disabled={busy}
            onClick={() => void invoke('checkUpdate')}
          >
            Проверить обновления
          </Button>
          {view?.status === 'available' && (
            <Button
              variant="contained"
              startIcon={<DownloadRounded />}
              disabled={busy}
              onClick={() => void invoke('downloadUpdate')}
            >
              Скачать обновление
            </Button>
          )}
          {view?.status === 'ready' && (
            <Button
              variant="contained"
              startIcon={<FolderOpenRounded />}
              disabled={busy}
              onClick={() => void invoke('openUpdateFolder')}
            >
              Открыть папку с обновлением
            </Button>
          )}
        </Stack>
      </Stack>
      <Dialog
        open={notesOpen}
        onClose={() => setNotesOpen(false)}
        maxWidth="md"
        fullWidth
        scroll="paper"
        aria-labelledby="update-notes-title"
      >
        <DialogTitle id="update-notes-title">
          Что нового{view?.version ? ` в версии ${view.version}` : ''}
        </DialogTitle>
        <DialogContent dividers>
          {notes === undefined ? (
            <Stack sx={{ alignItems: 'center', py: 4 }}>
              <CircularProgress aria-label="Загружаем описание" />
            </Stack>
          ) : notes === null ? (
            <Typography>
              Не удалось загрузить описание версии. Обновление можно скачать и
              без него.
            </Typography>
          ) : (
            <Box
              sx={{
                '& h1': { typography: 'h2', mt: 0 },
                '& h2, & h3': { typography: 'h3', mt: 3, mb: 1 },
                '& table': { borderCollapse: 'collapse', width: '100%' },
                '& th, & td': {
                  textAlign: 'left',
                  p: 1,
                  borderBottom: 1,
                  borderColor: 'divider',
                },
                '& code': { fontFamily: 'monospace' },
              }}
            >
              {/* Описание из сети не подписано: HTML не разбирается, ссылки и
                  изображения показываются текстом, без перехода и загрузки. */}
              <Markdown
                options={{
                  disableParsingRawHTML: true,
                  overrides: {
                    a: { component: 'span' },
                    img: { component: AltText },
                  },
                }}
              >
                {notes}
              </Markdown>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNotesOpen(false)}>Закрыть</Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}

function AltText({ alt }: { alt?: string }) {
  return alt ? <>{alt}</> : null;
}
