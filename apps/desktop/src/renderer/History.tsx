import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Snackbar,
  CircularProgress,
  Avatar,
  IconButton,
  Link,
  Tooltip,
  TableSortLabel,
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
import type {
  JobFolderAvailability,
  DesktopApi,
} from '../contract/desktop-api.js';

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
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sort, setSort] = useState<
    'title' | 'kind' | 'count' | 'bytes' | 'date'
  >('date');
  const [direction, setDirection] = useState<'asc' | 'desc'>('desc');
  // Даты действуют только в режиме «Выбрать даты», чтобы два фильтра не спорили.
  const custom = period === 'custom';
  const invalidRange = custom && !!from && !!to && from > to;
  const [notice, setNotice] = useState('');
  const [folders, setFolders] = useState<Record<string, JobFolderAvailability>>(
    {},
  );
  const [opening, setOpening] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const revision = useRef(0);
  async function refresh() {
    const current = ++revision.current;
    const result = await api.history();
    if (current !== revision.current) return;
    if (result.kind === 'result') {
      setEntries(result.data);
      setFolders({});
      // локальная доступность не ждёт provider/обложки и не скрывает строки.
      for (const entry of result.data)
        void api
          .jobFolderAvailability({ jobId: entry.jobId })
          .then((value) => {
            if (current === revision.current)
              setFolders((previous) => ({
                ...previous,
                [entry.jobId]:
                  value.kind === 'result'
                    ? value.data
                    : {
                        available: false,
                        reason: 'Не удалось проверить папку.',
                      },
              }));
          })
          .catch(() => {
            if (current === revision.current)
              setFolders((previous) => ({
                ...previous,
                [entry.jobId]: {
                  available: false,
                  reason: 'Не удалось проверить папку.',
                },
              }));
          });
      // строки и действия доступны до завершения необязательных обложек.
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
  async function act(action: 'replay' | 'hideHistory', jobId: string) {
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
  async function clearHistory() {
    setClearOpen(false);
    setBusy(true);
    setNotice('');
    try {
      // Очищаем всю загруженную историю, а не только результат поиска; файлы не удаляются.
      // После частичной ошибки перечитываем записи без повторения неизвестной операции.
      for (const entry of entries) {
        const result = await api.hideHistory({ jobId: entry.jobId });
        if (result.kind === 'error') {
          setNotice(
            result.error.code === 'OUTCOME_UNKNOWN'
              ? 'Исход очистки неизвестен. История перечитана; проверьте оставшиеся записи.'
              : result.error.message,
          );
          break;
        }
      }
    } finally {
      try {
        await refresh();
      } finally {
        setBusy(false);
      }
    }
  }
  async function openFolder(jobId: string) {
    setOpening((previous) => new Set(previous).add(jobId));
    setNotice('');
    try {
      const result = await api.showItemInFolder({ jobId });
      if (result.kind === 'error') {
        setNotice(result.error.message);
        if (result.error.code === 'PERMISSION_DENIED')
          setFolders((previous) => ({
            ...previous,
            [jobId]: { available: false, reason: result.error.message },
          }));
      }
    } finally {
      setOpening((previous) => {
        const next = new Set(previous);
        next.delete(jobId);
        return next;
      });
    }
  }
  const filtered = entries
    .filter(
      (entry) =>
        !invalidRange &&
        (!custom ||
          !from ||
          Date.parse(entry.completedAt) >=
            new Date(`${from}T00:00:00`).getTime()) &&
        (!custom ||
          !to ||
          Date.parse(entry.completedAt) <=
            new Date(`${to}T23:59:59.999`).getTime()) &&
        (kind === 'all' || entry.source.kind === kind) &&
        (period === 'all' ||
          custom ||
          Date.parse(entry.completedAt) >=
            Date.now() - Number(period) * 86400000) &&
        `${entry.title} ${entry.artists.join(' ')} ${entry.source.id}`
          .toLocaleLowerCase()
          .includes(query.toLocaleLowerCase()),
    )
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => {
      const left =
        sort === 'title'
          ? a.entry.title
          : sort === 'kind'
            ? kinds[a.entry.source.kind]
            : sort === 'count'
              ? a.entry.count
              : sort === 'bytes'
                ? a.entry.bytes
                : Date.parse(a.entry.completedAt);
      const right =
        sort === 'title'
          ? b.entry.title
          : sort === 'kind'
            ? kinds[b.entry.source.kind]
            : sort === 'count'
              ? b.entry.count
              : sort === 'bytes'
                ? b.entry.bytes
                : Date.parse(b.entry.completedAt);
      // Неизвестный размер остаётся в конце при обоих направлениях; равенства стабильны.
      if (left === null) return right === null ? a.index - b.index : 1;
      if (right === null) return -1;
      const delta =
        typeof left === 'string'
          ? left.localeCompare(String(right), 'ru')
          : Number(left) - Number(right);
      return (direction === 'asc' ? delta : -delta) || a.index - b.index;
    })
    .map(({ entry }) => entry);
  return (
    <Stack spacing={3}>
      <Stack
        direction="row"
        spacing={2}
        sx={{ alignItems: 'center', justifyContent: 'space-between' }}
      >
        <Typography variant="h1">История загрузок</Typography>
        <Button
          color="error"
          startIcon={<DeleteOutlineRounded />}
          disabled={busy || entries.length === 0}
          onClick={() => setClearOpen(true)}
        >
          Очистить историю
        </Button>
      </Stack>
      <Dialog
        open={clearOpen}
        onClose={() => setClearOpen(false)}
        aria-labelledby="clear-history-title"
        aria-describedby="clear-history-description"
      >
        <DialogTitle id="clear-history-title">
          Очистить всю историю?
        </DialogTitle>
        <DialogContent>
          <DialogContentText id="clear-history-description">
            Будут убраны все записи: {entries.length}, включая скрытые
            фильтрами. Скачанные файлы останутся на диске.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setClearOpen(false)}>Отмена</Button>
          <Button color="error" onClick={() => void clearHistory()}>
            Очистить
          </Button>
        </DialogActions>
      </Dialog>
      <Typography color="text.secondary">
        Ваша коллекция загруженной музыки
      </Typography>
      <Snackbar
        open={!!notice}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        onClose={() => setNotice('')}
      >
        <Alert severity="warning" onClose={() => setNotice('')}>
          {notice}
        </Alert>
      </Snackbar>
      <TextField
        label="Поиск в истории"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        fullWidth
      />
      <Stack direction="row" spacing={2} sx={{ alignItems: 'flex-start' }}>
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
          <MenuItem value="custom">Выбрать даты</MenuItem>
        </TextField>
        {custom && (
          <>
            <TextField
              type="date"
              label="Дата с"
              slotProps={{ inputLabel: { shrink: true } }}
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              sx={{ minWidth: 160 }}
            />
            <TextField
              type="date"
              label="Дата по"
              slotProps={{ inputLabel: { shrink: true } }}
              value={to}
              onChange={(event) => setTo(event.target.value)}
              error={invalidRange}
              helperText={
                invalidRange ? 'Дата окончания раньше начала' : undefined
              }
              sx={{ minWidth: 160 }}
            />
          </>
        )}
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
        <Paper variant="outlined" sx={{ overflowX: 'auto' }}>
          <Box
            component="table"
            sx={{
              width: '100%',
              minWidth: 800,
              borderCollapse: 'collapse',
              // Первая колонка занимает остаток ширины; длинный текст не растягивает таблицу.
              '& th:first-of-type, & td:first-of-type': {
                width: '100%',
                maxWidth: 0,
              },
              '& th:not(:first-of-type), & td:not(:first-of-type)': {
                whiteSpace: 'nowrap',
              },
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
                {(
                  [
                    ['title', 'Название'],
                    ['kind', 'Тип'],
                    ['count', 'Треки'],
                    ['bytes', 'Размер'],
                    ['date', 'Дата'],
                  ] as const
                ).map(([key, label]) => (
                  <th key={key}>
                    <TableSortLabel
                      active={sort === key}
                      direction={sort === key ? direction : 'asc'}
                      onClick={() => {
                        setSort(key);
                        setDirection(
                          sort === key && direction === 'asc' ? 'desc' : 'asc',
                        );
                      }}
                    >
                      {label}
                    </TableSortLabel>
                  </th>
                ))}
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
                        sx={{ width: 48, height: 48, flexShrink: 0 }}
                      >
                        <HistoryRounded />
                      </Avatar>
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        {entry.publicUrl ? (
                          <Link
                            href={entry.publicUrl}
                            title={entry.title}
                            sx={{
                              fontWeight: 600,
                              display: 'block',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                            onClick={(event) => {
                              event.preventDefault();
                              void api.openExternal({ url: entry.publicUrl! });
                            }}
                          >
                            {entry.title}
                          </Link>
                        ) : (
                          <Typography
                            noWrap
                            title={entry.title}
                            sx={{ fontWeight: 600 }}
                          >
                            {entry.title}
                          </Typography>
                        )}
                        {entry.source.kind !== 'playlist' && (
                          <Tooltip title={entry.artists.join(', ')}>
                            <Typography
                              variant="body2"
                              color="text.secondary"
                              noWrap
                            >
                              {/* Сборник может содержать десятки исполнителей; полный список остаётся в подсказке и поиске. */}
                              {entry.artists.slice(0, 3).join(', ') ||
                                'Исполнитель не указан'}
                              {entry.artists.length > 3
                                ? ` и ещё ${entry.artists.length - 3}`
                                : ''}
                            </Typography>
                          </Tooltip>
                        )}
                      </Box>
                    </Stack>
                  </td>
                  <td>
                    <Chip size="small" label={kinds[entry.source.kind]} />
                  </td>
                  <td>{tracksQuantity(entry.count)}</td>
                  <td>
                    <Typography variant="body2" color="text.secondary">
                      {entry.bytes === null
                        ? 'Размер неизвестен'
                        : `${(entry.bytes / 1048576).toFixed(1)} МБ`}
                    </Typography>
                  </td>
                  <td>
                    {new Date(entry.completedAt).toLocaleString('ru-RU', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
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
                      <Tooltip
                        describeChild
                        title={
                          folders[entry.jobId]?.reason ??
                          (folders[entry.jobId]?.available
                            ? 'Открыть папку'
                            : 'Проверяем доступность папки…')
                        }
                      >
                        <span
                          tabIndex={
                            !folders[entry.jobId]?.available ? 0 : undefined
                          }
                        >
                          <IconButton
                            aria-label="Открыть папку"
                            disabled={
                              !folders[entry.jobId]?.available ||
                              opening.has(entry.jobId)
                            }
                            onClick={() => void openFolder(entry.jobId)}
                          >
                            {opening.has(entry.jobId) ? (
                              <CircularProgress
                                size={18}
                                aria-label="Открываем папку"
                              />
                            ) : (
                              <FolderOpenRounded />
                            )}
                          </IconButton>
                        </span>
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
