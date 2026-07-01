import type { PublishOptions, PublishResult } from "@/api/publish";
import { getPostPublicationList, publishPost } from "@/api/publish";
import type {
  PlatformResult,
  PlatformStatus,
} from "@/components/UploadPublishOverlay";
import { PLATFORMS } from "@/lib/platforms";

/**
 * TikTok / Threads are slow; list them last in the progress UI only.
 * Server-side publish runs all platforms in parallel regardless of order.
 */
export function sortKeyForSlowPlatformsLast(platform: string): number {
  if (platform === "tiktok") return 1;
  if (platform === "threads") return 2;
  return 0;
}

export function sortBySlowPlatformsLast<T extends { platform: string }>(
  rows: T[],
): T[] {
  return [...rows]
    .map((row, i) => ({ row, i }))
    .sort((a, b) => {
      const d =
        sortKeyForSlowPlatformsLast(a.row.platform) -
        sortKeyForSlowPlatformsLast(b.row.platform);
      if (d !== 0) return d;
      return a.i - b.i;
    })
    .map(({ row }) => row);
}

export type PublicationListRow = {
  publicationId: string;
  connectedAccountId: string;
  platform: string;
};

export type PublicationProgressRow = PublicationListRow & {
  platformUsername?: string | null;
  publicationStatus: string;
  platformPostUrl: string | null;
  lastError: string | null;
};

const PROGRESS_POLL_MS = 1200;
/** Client safety net when an RPC call hangs (e.g. platform API stall). */
const PUBLISH_SERVER_ACTION_TIMEOUT_MS = 90_000;
const POLL_UNTIL_DONE_MAX_MS = 90_000;

function publicationStatusToPlatformStatus(
  publicationStatus: string,
  fallback: PlatformStatus = "waiting",
): PlatformStatus {
  if (publicationStatus === "published") return "published";
  if (publicationStatus === "failed") return "failed";
  if (publicationStatus === "publishing") return "processing";
  return fallback;
}

export function publicationRowsToPlatformStatuses(
  rows: PublicationProgressRow[],
): PlatformResult[] {
  return sortBySlowPlatformsLast(rows).map((pub) => ({
    platform: pub.platform,
    accountId: pub.connectedAccountId,
    accountName: pub.platformUsername
      ? `@${pub.platformUsername}`
      : (PLATFORMS.find((p) => p.id === pub.platform)?.name ?? pub.platform),
    status: publicationStatusToPlatformStatus(pub.publicationStatus),
    error:
      pub.publicationStatus === "failed"
        ? (pub.lastError ?? undefined)
        : undefined,
    postUrl:
      pub.publicationStatus === "published"
        ? (pub.platformPostUrl ?? undefined)
        : undefined,
  }));
}

export function mergePublicationProgressIntoPlatformStatuses(
  prev: PlatformResult[],
  rows: PublicationProgressRow[],
): PlatformResult[] {
  return prev.map((p) => {
    const row = rows.find((r) => r.connectedAccountId === p.accountId);
    if (!row) return p;
    return {
      ...p,
      status: publicationStatusToPlatformStatus(row.publicationStatus, p.status),
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

function allPublicationsResolved(rows: PublicationProgressRow[]): boolean {
  return (
    rows.length > 0 &&
    rows.every(
      (r) =>
        r.publicationStatus === "published" ||
        r.publicationStatus === "failed",
    )
  );
}

/** Poll publication rows until every platform is published or failed (publish already queued). */
export async function pollPublicationProgressUntilDone(
  postId: string,
  onPoll: (rows: PublicationProgressRow[]) => void,
): Promise<void> {
  const pollOnce = async () => {
    const rows = await getPostPublicationList(postId);
    onPoll(rows);
    return allPublicationsResolved(rows);
  };

  if (await pollOnce()) return;

  const started = Date.now();
  return new Promise((resolve) => {
    const timer = setInterval(() => {
      void (async () => {
        try {
          const done = await pollOnce();
          if (done || Date.now() - started > POLL_UNTIL_DONE_MAX_MS) {
            clearInterval(timer);
            resolve();
          }
        } catch {
          if (Date.now() - started > POLL_UNTIL_DONE_MAX_MS) {
            clearInterval(timer);
            resolve();
          }
        }
      })();
    }, PROGRESS_POLL_MS);
  });
}

/**
 * Single RPC publish call — executePublish runs all platforms in parallel via
 * Promise.allSettled. Polls publication rows for per-platform progress UI.
 */
export async function publishPostWithParallelProgress(
  postId: string,
  options: PublishOptions | undefined,
  onPoll: (rows: PublicationProgressRow[]) => void,
): Promise<PublishResult> {
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  const pollOnce = async () => {
    try {
      const rows = await getPostPublicationList(postId);
      onPoll(rows);
    } catch {
      // ignore transient poll errors
    }
  };

  pollTimer = setInterval(() => {
    void pollOnce();
  }, PROGRESS_POLL_MS);

  const publishWithTimeout = async (): Promise<PublishResult> => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        publishPost(postId, options),
        new Promise<PublishResult>((resolve) => {
          timeoutId = setTimeout(() => {
            console.warn(
              "[publishPostWithParallelProgress] publish timed out on client",
              { postId },
            );
            resolve({
              success: true,
              results: [],
            });
          }, PUBLISH_SERVER_ACTION_TIMEOUT_MS);
        }),
      ]);
    } catch (err) {
      console.error("[publishPostWithParallelProgress] publish failed:", err);
      return {
        success: false,
        error:
          err instanceof Error ? err.message : "Publish failed unexpectedly",
        results: [],
      };
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  };

  try {
    await pollOnce();
    return await publishWithTimeout();
  } finally {
    if (pollTimer) clearInterval(pollTimer);
    await pollOnce();
  }
}
