/** Построение неизменяемого DownloadPlan и выбор качества (REQ-010, REQ-011). */
export const plannerCorePackage = '@music-downloader/core-planner';

export { createTrackJobs, withSelectedVariant } from './jobs.js';
export { buildAlbumPlan, buildPlaylistPlan, buildTrackPlan } from './plan.js';
export {
  resolvePlanVariants,
  resolveVariant,
  matchesVariant,
  type PlanVariantResult,
  type QualityOptions,
  type VariantResult,
} from './quality.js';
