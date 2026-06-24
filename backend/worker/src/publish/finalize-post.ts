import { and, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  connectedAccounts,
  postPublications,
  posts,
} from "../db/schema.js";
import { maybeSendPostFailureEmail } from "../lib/post-failure-email.js";

/** After per-platform jobs finish, update aggregate post status and notify user. */
export async function maybeFinalizePostPublish(
  postId: string,
  userId: string,
): Promise<void> {
  const pubs = await db
    .select({
      status: postPublications.status,
      platform: connectedAccounts.platform,
      platformUsername: connectedAccounts.platformUsername,
      connectedAccountId: connectedAccounts.id,
      lastError: postPublications.lastError,
    })
    .from(postPublications)
    .innerJoin(
      connectedAccounts,
      eq(postPublications.connectedAccountId, connectedAccounts.id),
    )
    .where(eq(postPublications.postId, postId));

  if (
    pubs.some(
      (p) => p.status === "pending" || p.status === "publishing",
    )
  ) {
    return;
  }

  const succeeded = pubs.filter((p) => p.status === "published").length;
  const failed = pubs.filter((p) => p.status === "failed").length;
  if (pubs.length === 0) return;

  const overallStatus =
    succeeded === 0 ? "failed" : failed === 0 ? "published" : "partial";

  await db
    .update(posts)
    .set({ status: overallStatus, updatedAt: new Date() })
    .where(and(eq(posts.id, postId), eq(posts.userId, userId)));

  const failedList = pubs.filter((p) => p.status === "failed");
  if (failedList.length > 0) {
    await maybeSendPostFailureEmail({
      userId,
      postId,
      failures: failedList.map((f) => ({
        platform: f.platform,
        platformUsername: f.platformUsername,
        error: f.lastError,
      })),
    });
  }
}
