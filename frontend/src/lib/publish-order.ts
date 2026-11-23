import { getPostPublicationList } from "@/api/publish";

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
const POLL_UNTIL_DONE_MAX_MS = 90_000;

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
