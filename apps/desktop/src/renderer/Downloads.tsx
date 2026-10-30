import { useState } from 'react';
import {
  Box,
  Avatar,
  IconButton,
  Menu,
  MenuItem,
  Tabs,
  Tab,
  Collapse,
  Link,
  Button,
  LinearProgress,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import MoreVertRounded from '@mui/icons-material/MoreVertRounded';
import MusicNoteRounded from '@mui/icons-material/MusicNoteRounded';
import type {
  ArtworkDto,
  JobSnapshot,
  JsonObject,
} from '@music-downloader/shared';
import { tracksQuantity } from './quantity.js';
import { allowed, numberField, statusLabels } from './useDownloads.js';

const actions = {
  pause: 'Приостановить',
  resume: 'Продолжить',
  cancel: 'Отменить',
  retry: 'Повторить',
  showItemInFolder: 'Показать в папке',
} as const;
export type DownloadAction = keyof typeof actions;
export function Downloads({
  jobs,
  artwork = {},
  progress,
  trackProgress,
  pending,
  connected,
  command,
  batch,
  clearCompleted,
  openFolder,
  openSource,
}: {
  jobs: readonly JobSnapshot[];
  artwork?: Record<string, ArtworkDto>;
  progress: Record<string, JsonObject>;
  trackProgress: Record<string, JsonObject>;
  pending: Record<string, boolean>;
  connected: boolean;
  command(job: JobSnapshot, action: DownloadAction): Promise<void>;
  batch(action: 'pause' | 'resume'): Promise<void>;
  clearCompleted(): Promise<void>;
  openFolder(): Promise<void>;
  openSource(url: string): Promise<void>;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [tab, setTab] = useState(1);
  const [menu, setMenu] = useState<{ anchor: HTMLElement; job: JobSnapshot }>();
  // Один predicate определяет и список, и счётчик: скрытые задания сюда не поступают.
  const groups = [
    ['queued', 'paused', 'interrupted'],
    ['running'],
    ['completed', 'cancelled'],
    ['failed', 'completed_with_errors'],
  ];
  const visible = jobs.filter((job) => groups[tab]!.includes(job.status));
  const anyPending = Object.values(pending).some(Boolean);
  return (
    <Stack spacing={2}>
      <Typography variant="h1">Загрузки</Typography>
      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
        <Button
          aria-label="Приостановить все"
          disabled={
            !connected ||
            anyPending ||
            !jobs.some((job) => allowed(job, 'pause'))
          }
          onClick={() => void batch('pause')}
        >
          Приостановить
        </Button>
        <Button
          aria-label="Продолжить все"
          disabled={
            !connected ||
            anyPending ||
            !jobs.some((job) => allowed(job, 'resume'))
          }
          onClick={() => void batch('resume')}
        >
          Продолжить
        </Button>
        <Button disabled={!connected} onClick={() => void openFolder()}>
          Открыть папку
        </Button>
        <Button
          disabled={
            !connected ||
            anyPending ||
            !jobs.some((job) =>
              [
                'completed',
                'completed_with_errors',
                'failed',
                'cancelled',
              ].includes(job.status),
            )
          }
          onClick={() => void clearCompleted()}
        >
          Убрать завершённые
        </Button>
      </Stack>
      <Tabs
        value={tab}
        onChange={(_, next: number) => setTab(next)}
        aria-label="Состояния загрузок"
        sx={{ borderBottom: 1, borderColor: 'divider' }}
      >
        {['Очередь', 'Активные', 'Завершённые', 'Ошибки'].map(
          (label, index) => (
            <Tab
              key={label}
              value={index}
              label={`${label} (${jobs.filter((job) => groups[index]!.includes(job.status)).length})`}
            />
          ),
        )}
      </Tabs>
      {visible.length === 0 && (
        <Paper variant="outlined" sx={{ p: 5, textAlign: 'center' }}>
          Здесь появятся ваши загрузки. Добавьте ссылку на Главной.
        </Paper>
      )}
      {visible.map((job) => {
        const payload = progress[job.jobId];
        const completed =
          numberField(payload, 'completed') ??
          job.tracks.filter((track) =>
            ['completed', 'skipped'].includes(track.status),
          ).length;
        const total = numberField(payload, 'total') ?? job.tracks.length;
        const fraction = Math.min(
          1,
          numberField(payload, 'fraction') ?? (total ? completed / total : 0),
        );
        return (
          <Paper
            component="article"
            variant="outlined"
            key={job.jobId}
            sx={{ p: 2 }}
          >
            <Stack spacing={1}>
              <Stack
                direction="row"
                spacing={2}
                sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 1 }}
              >
                <Avatar
                  variant="rounded"
                  src={
                    artwork[job.jobId]
                      ? `data:${artwork[job.jobId]!.mimeType};base64,${artwork[job.jobId]!.base64}`
                      : undefined
                  }
                  sx={{ width: 56, height: 56 }}
                >
                  <MusicNoteRounded />
                </Avatar>
                <Button
                  aria-label={`Подробности ${job.source.id}`}
                  aria-expanded={!!expanded[job.jobId]}
                  aria-controls={`details-${job.jobId}`}
                  onClick={() =>
                    setExpanded((previous) => ({
                      ...previous,
                      [job.jobId]: !previous[job.jobId],
                    }))
                  }
                >
                  {expanded[job.jobId] ? '▾' : '▸'}{' '}
                  {job.source.kind === 'track'
                    ? 'Трек'
                    : job.source.kind === 'album'
                      ? 'Альбом'
                      : 'Плейлист'}
                </Button>
                {job.publicUrl ? (
                  <Link
                    component="a"
                    href={job.publicUrl}
                    onClick={(event) => {
                      event.preventDefault();
                      void openSource(job.publicUrl!);
                    }}
                  >
                    {job.title || job.source.id}
                  </Link>
                ) : (
                  <Typography>{job.title || job.source.id}</Typography>
                )}
                {job.author && (
                  <Typography variant="body2" color="text.secondary">
                    {job.author}
                  </Typography>
                )}
                <Typography sx={{ ml: 'auto' }}>
                  {statusLabels[job.status]}
                </Typography>
                <Typography sx={{ whiteSpace: 'nowrap' }}>
                  {completed} / {tracksQuantity(total)} ·{' '}
                  {Math.round(fraction * 100)}%
                </Typography>
                <Stack
                  direction="row"
                  spacing={1}
                  sx={{ flexWrap: 'wrap', gap: 0.5, ml: 'auto' }}
                >
                  {(['pause', 'resume'] as const)
                    .filter((action) => allowed(job, action))
                    .map((action) => (
                      <Button
                        key={action}
                        variant="outlined"
                        size="small"
                        disabled={!connected || pending[job.jobId]}
                        onClick={() => void command(job, action)}
                      >
                        {actions[action]}
                      </Button>
                    ))}
                  <IconButton
                    aria-label={`Действия ${job.title || job.source.id}`}
                    aria-haspopup="menu"
                    onClick={(event) =>
                      setMenu({ anchor: event.currentTarget, job })
                    }
                  >
                    <MoreVertRounded />
                  </IconButton>
                </Stack>
              </Stack>
              <LinearProgress
                variant="determinate"
                value={fraction * 100}
                aria-label="Прогресс задания"
              />
              {job.pauseReason && (
                <Typography color="warning.main">
                  Причина паузы: {job.pauseReason}
                </Typography>
              )}
              <Collapse in={!!expanded[job.jobId]} unmountOnExit>
                <Box id={`details-${job.jobId}`}>
                  {job.tracks.map((track, index) => {
                    const data =
                      trackProgress[`${job.jobId}:${track.trackKey}`];
                    const part = numberField(data, 'fraction');
                    const bytes = numberField(data, 'bytes');
                    const speed =
                      job.status === 'running' && track.status === 'downloading'
                        ? numberField(data, 'speed')
                        : undefined;
                    const eta =
                      job.status === 'running' && track.status === 'downloading'
                        ? numberField(data, 'eta')
                        : undefined;
                    return (
                      <Box
                        key={track.trackKey}
                        sx={{ py: 1, borderBottom: 1, borderColor: 'divider' }}
                      >
                        <Typography>
                          Трек {index + 1} ·{' '}
                          {statusLabels[track.status] ?? track.status}
                          {part !== undefined
                            ? ` · ${Math.round(Math.min(1, part) * 100)}%`
                            : ''}
                        </Typography>
                        {part !== undefined && (
                          <LinearProgress
                            variant="determinate"
                            value={Math.min(1, part) * 100}
                            aria-label={`Прогресс трека ${index + 1}`}
                          />
                        )}
                        {bytes !== undefined && (
                          <Typography variant="caption">
                            {bytes.toLocaleString('ru-RU')} байт{' '}
                          </Typography>
                        )}
                        {speed !== undefined && speed > 0 && (
                          <Typography variant="caption">
                            Скорость: {(speed / 1048576).toFixed(1)} МБ/с{' '}
                          </Typography>
                        )}
                        {eta !== undefined && (
                          <Typography variant="caption">
                            Осталось: {Math.ceil(eta / 1000)} с
                          </Typography>
                        )}
                      </Box>
                    );
                  })}
                </Box>
              </Collapse>
            </Stack>
          </Paper>
        );
      })}
      <Menu
        open={!!menu}
        anchorEl={menu?.anchor}
        onClose={() => setMenu(undefined)}
      >
        {menu &&
          (Object.keys(actions) as DownloadAction[]).map((action) => (
            <MenuItem
              key={action}
              disabled={
                !connected ||
                pending[menu.job.jobId] ||
                (action === 'showItemInFolder'
                  ? !menu.job.tracks.some((track) => track.resultPath)
                  : !allowed(menu.job, action))
              }
              onClick={() => {
                const current = menu.job;
                setMenu(undefined);
                void command(current, action);
              }}
            >
              {actions[action]}
            </MenuItem>
          ))}
      </Menu>
    </Stack>
  );
}
