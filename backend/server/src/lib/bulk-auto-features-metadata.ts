import type {
  AutoPlugConfig,
  AutoResurfaceConfig,
} from "@/lib/auto-features-types";

/**
 * Stored on scheduled/queued posts so executePublish can run setupBulkAutoFeaturesIfPresent
 * after Twitter publishes (same shape as bulk tools).
 */
export function applyBulkAutoFeaturesToScheduledMetadata(
  metadata: Record<string, unknown>,
  opts: {
    hasTwitterXSelected: boolean;
    resurfaceConfig: AutoResurfaceConfig | null;
    autoPlugConfig: AutoPlugConfig | null;
  },
): void {
  if (!opts.hasTwitterXSelected) {
    delete metadata.bulkAutoFeatures;
    return;
  }

  const autoRepost = opts.resurfaceConfig
    ? {
        intervalHours: opts.resurfaceConfig.intervalHours,
        maxResurfaces: opts.resurfaceConfig.maxResurfaces,
        plugComment:
          typeof opts.resurfaceConfig.plugComment === "string"
            ? opts.resurfaceConfig.plugComment.trim() || undefined
            : undefined,
      }
    : null;

  // `plugComment` arrives from RPC input, so it is not necessarily a string.
  const plugComment =
    typeof opts.autoPlugConfig?.plugComment === "string"
      ? opts.autoPlugConfig.plugComment.trim()
      : "";
  const autoPlug =
    opts.autoPlugConfig && plugComment.length > 0
      ? {
          metricType: opts.autoPlugConfig.metricType,
          threshold: opts.autoPlugConfig.threshold,
          plugComment,
        }
      : null;

  if (!autoRepost && !autoPlug) {
    delete metadata.bulkAutoFeatures;
    return;
  }

  metadata.bulkAutoFeatures = {
    autoRepostConfig: autoRepost,
    autoPlugConfig: autoPlug,
  };
}
