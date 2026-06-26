import type { PublishOptions, PublishResult } from "@/actions/publish";
import { getPostPublicationList, publishPost } from "@/actions/publish";

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
  publicationStatus: string;
  platformPostUrl: string | null;
  lastError: string | null;
};

const PROGRESS_POLL_MS = 1200;
/** Client safety net when a server action hangs (e.g. platform API stall). */
const PUBLISH_SERVER_ACTION_TIMEOUT_MS = 90_000;

/**
 * One server action - executePublish runs all platforms in parallel via
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
