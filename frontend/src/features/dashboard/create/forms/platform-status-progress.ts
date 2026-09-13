import type {
  PlatformResult,
  PlatformStatus,
} from "@/components/UploadPublishOverlay";

/** The publication fields the publish progress feed reports. */
export type PublicationProgressRow = {
  connectedAccountId: string;
  publicationStatus: string;
  platformPostUrl: string | null;
  lastError: string | null;
};

/**
 * Fold a publish progress update into the overlay's per-platform rows.
 *
 * All five post forms passed the same reducer to
 * `publishPostWithParallelProgress`, seven copies in total. A row the update
 * does not mention keeps its current status, so a partial feed never resets a
 * platform that already finished.
 */
export function applyPublicationProgress(
  previous: PlatformResult[],
  rows: readonly PublicationProgressRow[],
): PlatformResult[] {
  return previous.map((p) => {
    const row = rows.find((r) => r.connectedAccountId === p.accountId);
    if (!row) return p;
    const status: PlatformStatus =
      row.publicationStatus === "published"
        ? "published"
        : row.publicationStatus === "failed"
          ? "failed"
          : row.publicationStatus === "publishing"
            ? "processing"
            : p.status;
    return {
      ...p,
      status,
      error:
        row.publicationStatus === "failed"
          ? (row.lastError ?? undefined)
          : undefined,
      postUrl:
        row.publicationStatus === "published"
          ? (row.platformPostUrl ?? undefined)
          : undefined,
    };
  });
}
