import { and, asc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { publishJobEvents, posts } from "../db/schema.js";

export type PublishTimelineEvent = {
  id: string;
  phase: string;
  platform: string | null;
  message: string | null;
  createdAt: string;
};

export async function loadPublishTimelineForPost(
  postId: string,
  userId: string,
): Promise<PublishTimelineEvent[]> {
  try {
    const rows = await db
      .select({
        id: publishJobEvents.id,
        phase: publishJobEvents.phase,
        platform: publishJobEvents.platform,
        message: publishJobEvents.message,
        createdAt: publishJobEvents.createdAt,
      })
      .from(publishJobEvents)
      .where(
        and(
          eq(publishJobEvents.postId, postId),
          eq(publishJobEvents.userId, userId),
        ),
      )
      .orderBy(asc(publishJobEvents.createdAt))
      .limit(100);
    return rows.map((r) => ({
      id: r.id,
      phase: r.phase,
      platform: r.platform ?? null,
      message: r.message ?? null,
      createdAt: (r.createdAt ?? new Date()).toISOString(),
    }));
  } catch (e) {
    console.warn("[loadPublishTimelineForPost] skipped:", e);
    return [];
  }
}

/** Ensure the post belongs to the user before exposing events. */
export async function loadPublishTimelineForOwnedPost(
  postId: string,
  userId: string,
): Promise<PublishTimelineEvent[] | null> {
  const [row] = await db
    .select({ id: posts.id })
    .from(posts)
    .where(and(eq(posts.id, postId), eq(posts.userId, userId)))
    .limit(1);
  if (!row) return null;
  return loadPublishTimelineForPost(postId, userId);
}
