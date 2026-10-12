/** Состояния заданий: переходы, control и агрегация статуса job (ADR-003/ADR-006). */
export const downloaderCorePackage = '@music-downloader/core-downloader';

export {
  ProgressReporter,
  type ProgressReporterOptions,
  type ProgressSnapshot,
} from './progress.js';

export { createDownloadManager, DownloadManager } from './manager.js';
export { JobOwner, requestJobControl } from './job-owner.js';
export type {
  DownloadManagerDependencies,
  DownloadManagerOptions,
  DownloadFiles,
  EventPublisher,
  MetadataProcessingContext,
  SchedulerPort,
  ProcessingHooks,
  ArtworkCache,
} from './ports.js';

export { aggregateJobStatus, type AggregateInput } from './state/aggregate.js';
export {
  pauseJobOnFatalError,
  resumeJob,
  transitionJobControl,
  type JobControlCommand,
  type JobControlState,
  type JobPauseReason,
  type ResumeResult,
} from './state/control.js';
export {
  recoverTrack,
  trackEvents,
  transitionRules,
  transitionTrack,
  type RetryPhase,
  type TrackEvent,
  type TrackState,
  type TransitionContext,
  type TransitionResult,
  type TransitionRule,
} from './state/transitions.js';
