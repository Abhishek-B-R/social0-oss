import type { PublishOptions, PublishResult } from "@/app/actions/publish";
import { getPostPublicationList, publishPost } from "@/app/actions/publish";

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

/**
 * One server action — executePublish runs all platforms in parallel via
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

  try {
    await pollOnce();
    return await publishPost(postId, options);
  } finally {
    if (pollTimer) clearInterval(pollTimer);
    await pollOnce();
  }
}
