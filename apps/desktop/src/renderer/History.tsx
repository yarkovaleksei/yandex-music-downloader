import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Avatar,
  IconButton,
  Link,
  Tooltip,
  Box,
  Chip,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import ReplayRounded from '@mui/icons-material/ReplayRounded';
import FolderOpenRounded from '@mui/icons-material/FolderOpenRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import { tracksQuantity } from './quantity.js';
import HistoryRounded from '@mui/icons-material/HistoryRounded';
import type { HistoryEntry } from '@music-downloader/shared';
import type { DesktopApi } from '../contract/desktop-api.js';

const kinds = { track: 'Трек', album: 'Альбом', playlist: 'Плейлист' };
/** REQ-051: скрытие истории не удаляет файлы; legacy replay объясняется явно. */
export function History({
  api,
  onReplay,
}: {
  api: DesktopApi;
  onReplay: (succeeded: boolean) => void;
}) {
  const [entries, setEntries] = useState<readonly HistoryEntry[]>([]);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('all');
  const [period, setPeriod] = useState('all');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const revision = useRef(0);
  async function refresh() {
    const current = ++revision.current;
    const result = await api.history();
    if (current !== revision.current) return;
    if (result.kind === 'result') {
      setEntries(result.data);
      // F-001 STEP-056: строки и действия доступны до завершения необязательных обложек.
      // Ошибка/таймаут оставляет fallback, а поздний ответ не возвращает удалённую строку.
      for (const entry of result.data) {
        if (entry.artwork) continue;
        void api
          .historyArtwork({ jobId: entry.jobId })
          .then((image) => {
            if (
              current !== revision.current ||
              image.kind !== 'result' ||
              !image.data
            )
              return;
            setEntries((previous) =>
              previous.map((item) =>
                item.jobId === entry.jobId
                  ? { ...item, artwork: image.data! }
                  : item,
              ),
            );
          })
          .catch(() => {});
      }
    } else setNotice(result.error.message);
  }
  useEffect(() => {
    void refresh();
    return () => {
      revision.current++;
    };
  }, [api]);
  async function act(
    action: 'replay' | 'hideHistory' | 'showItemInFolder',
    jobId: string,
  ) {
    setBusy(true);
    setNotice('');
    try {
      const result = await api[action]({ jobId });
      if (result.kind === 'error')
        setNotice(
          result.error.code === 'OUTCOME_UNKNOWN'
            ? 'Исход операции неизвестен. Состояние перечитано; проверьте загрузки перед повторным запуском.'
            : result.error.message,
        );
      // F-002: reconciliation нужен и при ошибке, но переход не должен скрывать предупреждение.
      if (action === 'replay') onReplay(result.kind === 'result');
      await refresh();
    } finally {
      setBusy(false);
    }
  }
  const filtered = entries.filter(
    (entry) =>
      (kind === 'all' || entry.source.kind === kind) &&
      (period === 'all' ||
        Date.parse(entry.completedAt) >=
          Date.now() - Number(period) * 86400000) &&
      `${entry.title} ${entry.artists.join(' ')} ${entry.source.id}`
        .toLocaleLowerCase()
        .includes(query.toLocaleLowerCase()),
  );
  return (
    <Stack spacing={3}>
      <Typography variant="h1">История загрузок</Typography>
      <Typography color="text.secondary">
        Ваша коллекция загруженной музыки
      </Typography>
      {notice && <Alert severity="warning">{notice}</Alert>}
      <Stack direction="row" spacing={2}>
        <TextField
          label="Поиск в истории"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          fullWidth
        />
        <TextField
          select
          label="Тип"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          sx={{ minWidth: 160 }}
        >
          <MenuItem value="all">Все типы</MenuItem>
          {Object.entries(kinds).map(([key, label]) => (
            <MenuItem key={key} value={key}>
              {label}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          label="Период"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          sx={{ minWidth: 180 }}
        >
          <MenuItem value="all">За всё время</MenuItem>
          <MenuItem value="7">Последние 7 дней</MenuItem>
          <MenuItem value="30">Последние 30 дней</MenuItem>
        </TextField>
      </Stack>
      <Typography color="text.secondary">Найдено: {filtered.length}</Typography>
      {filtered.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 7, textAlign: 'center' }}>
          <HistoryRounded sx={{ fontSize: 48, color: 'primary.main' }} />
          <Typography variant="h2">Пока ничего не найдено</Typography>
          <Typography color="text.secondary">
            Завершённые загрузки появятся здесь
          </Typography>
        </Paper>
      ) : (
        <Paper variant="outlined">
          <Box
            component="table"
            sx={{
              width: '100%',
              borderCollapse: 'collapse',
              '& th, & td': {
                textAlign: 'left',
                p: 2,
                borderBottom: 1,
                borderColor: 'divider',
              },
            }}
          >
            <thead>
              <tr>
                <th>Название</th>
                <th>Тип</th>
                <th>Треки / размер</th>
                <th>Дата</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((entry) => (
                <tr key={entry.jobId}>
                  <td>
                    <Stack
                      direction="row"
                      spacing={2}
                      sx={{ alignItems: 'center' }}
                    >
                      <Avatar
                        variant="rounded"
                        src={
                          entry.artwork
                            ? `data:${entry.artwork.mimeType};base64,${entry.artwork.base64}`
                            : undefined
                        }
                        alt=""
                        sx={{ width: 48, height: 48 }}
                      >
                        <HistoryRounded />
                      </Avatar>
                      <Box sx={{ minWidth: 0 }}>
                        {entry.publicUrl ? (
                          <Link
                            href={entry.publicUrl}
                            sx={{ fontWeight: 600 }}
                            onClick={(event) => {
                              event.preventDefault();
                              void api.openExternal({ url: entry.publicUrl! });
                            }}
                          >
                            {entry.title}
                          </Link>
                        ) : (
                          <Typography sx={{ fontWeight: 600 }}>
                            {entry.title}
                          </Typography>
                        )}
                        {entry.source.kind !== 'playlist' && (
                          <Typography variant="body2" color="text.secondary">
                            {entry.artists.join(', ') ||
                              'Исполнитель не указан'}
                          </Typography>
                        )}
                      </Box>
                    </Stack>
                  </td>
                  <td>
                    <Chip size="small" label={kinds[entry.source.kind]} />
                  </td>
                  <td>
                    {tracksQuantity(entry.count)}
                    <Typography variant="body2" color="text.secondary">
                      {entry.bytes === null
                        ? 'Размер неизвестен'
                        : `${(entry.bytes / 1048576).toFixed(1)} МБ`}
                    </Typography>
                  </td>
                  <td>
                    {new Date(entry.completedAt).toLocaleDateString('ru-RU')}
                  </td>
                  <td>
                    <Stack
                      direction="row"
                      spacing={1}
                      sx={{ whiteSpace: 'nowrap' }}
                    >
                      <Tooltip
                        describeChild
                        title={
                          entry.replayAvailable
                            ? 'Скачать снова'
                            : entry.replayReason ||
                              'Откройте источник на Главной и создайте новую загрузку.'
                        }
                      >
                        <span
                          tabIndex={!entry.replayAvailable ? 0 : undefined}
                          aria-label={
                            !entry.replayAvailable
                              ? `Скачать снова: ${entry.replayReason}`
                              : undefined
                          }
                        >
                          <IconButton
                            aria-label="Скачать снова"
                            disabled={busy || !entry.replayAvailable}
                            onClick={() => void act('replay', entry.jobId)}
                          >
                            <ReplayRounded />
                          </IconButton>
                        </span>
                      </Tooltip>
                      <Tooltip title="Открыть папку">
                        <IconButton
                          aria-label="Открыть папку"
                          disabled={busy}
                          onClick={() =>
                            void act('showItemInFolder', entry.jobId)
                          }
                        >
                          <FolderOpenRounded />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Убрать из истории">
                        <IconButton
                          aria-label="Убрать из истории"
                          color="error"
                          disabled={busy}
                          onClick={() => void act('hideHistory', entry.jobId)}
                        >
                          <DeleteOutlineRounded />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  </td>
                </tr>
              ))}
            </tbody>
          </Box>
        </Paper>
      )}
      <Typography variant="caption" color="text.secondary">
        Удаление записи из истории сохраняет аудиофайлы на диске.
      </Typography>
    </Stack>
  );
}
