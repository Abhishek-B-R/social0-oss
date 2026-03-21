import type { PublishOptions, PublishResult } from "@/app/actions/publish";
import { publishSinglePublication } from "@/app/actions/publish";

/**
 * TikTok / Threads are slow; run them last so faster platforms finish first.
 * Stable: preserves original order within each group.
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

/**
 * Fire one server action per publication in parallel (UI was previously awaiting
 * each call in a loop, which made publishing look sequential).
 */
export async function publishEachPublicationInParallel(
  postId: string,
  orderedList: PublicationListRow[],
  options: PublishOptions | undefined,
  onStart: (connectedAccountId: string) => void,
  onDone: (connectedAccountId: string, result: PublishResult) => void,
): Promise<void> {
  await Promise.allSettled(
    orderedList.map((pub) => {
      onStart(pub.connectedAccountId);
      return publishSinglePublication(postId, pub.publicationId, options)
        .then((singleResult) => {
          onDone(pub.connectedAccountId, singleResult);
        })
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          onDone(pub.connectedAccountId, {
            success: false,
            error: message,
            results: [
              {
                platform: pub.platform,
                connectedAccountId: pub.connectedAccountId,
                status: "failed" as const,
                error: message,
              },
            ],
          });
        });
    }),
  );
}
