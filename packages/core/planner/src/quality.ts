import {
  QualityUnavailableError,
  type AudioVariant,
  type DownloadPlan,
  type QualityPreference,
  type VariantSelection,
} from '@music-downloader/shared';

export interface QualityOptions {
  readonly variantSelection?: VariantSelection;
  /** Внедряемый фильтр поддерживаемых вариантов; по умолчанию принимает все. */
  readonly supports?: (variant: AudioVariant) => boolean;
  /** Внедряемое ранжирование codec (больше — лучше); по умолчанию порядок provider. */
  readonly codecRank?: (codec: string) => number;
}

export type VariantResult =
  | { readonly ok: true; readonly variant: AudioVariant }
  | { readonly ok: false; readonly error: QualityUnavailableError };

type Pick = 'highest' | 'lowest';

function unavailable(): VariantResult {
  return { ok: false, error: new QualityUnavailableError() };
}

/** Группы сравнения — один codec, в порядке появления у provider либо по codecRank. */
function groupByCodec(
  variants: readonly AudioVariant[],
  codecRank?: (codec: string) => number,
): AudioVariant[][] {
  const groups = new Map<string, AudioVariant[]>();
  for (const variant of variants) {
    const group = groups.get(variant.codec);
    if (group) group.push(variant);
    else groups.set(variant.codec, [variant]);
  }
  const ordered = [...groups.entries()];
  if (codecRank) {
    // Устойчивая сортировка: равный ранг сохраняет порядок provider.
    ordered.sort(([a], [b]) => codecRank(b) - codecRank(a));
  }
  return ordered.map(([, group]) => group);
}

/** Bitrate сравнивается только среди известных; без известных — первый у provider. */
function pickFromGroup(
  group: readonly AudioVariant[],
  pick: Pick,
): AudioVariant {
  const known = group.filter((variant) => variant.bitrate !== undefined);
  const candidates = known.length > 0 ? known : group;
  let chosen = candidates[0] as AudioVariant;
  for (const variant of candidates) {
    const current = chosen.bitrate ?? 0;
    const next = variant.bitrate ?? 0;
    if (pick === 'highest' ? next > current : next < current) chosen = variant;
  }
  return chosen;
}

function pickVariant(
  variants: readonly AudioVariant[],
  pick: Pick,
  codecRank?: (codec: string) => number,
): VariantResult {
  const [group] = groupByCodec(variants, codecRank);
  return group
    ? { ok: true, variant: pickFromGroup(group, pick) }
    : unavailable();
}

/**
 * Выбор variant по фактическим вариантам provider (REQ-010, OQ-011): без тихого
 * снижения качества; preview исключает provider и в AudioVariant не попадает.
 */
export function resolveVariant(
  variants: readonly AudioVariant[],
  quality: QualityPreference,
  options: QualityOptions = {},
): VariantResult {
  const supports = options.supports ?? (() => true);
  const usable = variants.filter((variant) => supports(variant));
  // REQ-058: exact selector имеет приоритет над preset; undefined bitrate не wildcard.
  if (options.variantSelection !== undefined) {
    const selected = usable.find((item) =>
      matchesVariant(item, options.variantSelection!),
    );
    return selected ? { ok: true, variant: selected } : unavailable();
  }
  const lossless = usable.filter((variant) => variant.lossless);
  const lossy = usable.filter((variant) => !variant.lossless);
  switch (quality) {
    case 'lossless':
      return pickVariant(lossless, 'highest', options.codecRank);
    case 'best':
      return lossless.length > 0
        ? pickVariant(lossless, 'highest', options.codecRank)
        : pickVariant(lossy, 'highest', options.codecRank);
    case 'high':
      return pickVariant(lossy, 'highest', options.codecRank);
    case 'normal':
      return pickVariant(lossy, 'lowest', options.codecRank);
  }
}

export interface PlanVariantResult {
  readonly position: number;
  readonly trackKey: string;
  readonly result: VariantResult;
}

/**
 * Выбор по каждой позиции плана; ошибка одного трека не прерывает остальные.
 * Позиция без записи вариантов получает QualityUnavailableError.
 */
export function resolvePlanVariants(
  plan: DownloadPlan,
  variantsByPosition: ReadonlyMap<number, readonly AudioVariant[]>,
  quality: QualityPreference,
  options: QualityOptions = {},
): PlanVariantResult[] {
  return plan.tracks.map((planned) => {
    const variants = variantsByPosition.get(planned.position);
    return {
      position: planned.position,
      trackKey: planned.trackKey,
      result: variants
        ? resolveVariant(variants, quality, options)
        : unavailable(),
    };
  });
}

export function matchesVariant(
  variant: AudioVariant,
  selection: VariantSelection,
): boolean {
  return (
    variant.codec === selection.codec &&
    variant.container === selection.container &&
    variant.lossless === selection.lossless &&
    variant.bitrate === selection.bitrate
  );
}
