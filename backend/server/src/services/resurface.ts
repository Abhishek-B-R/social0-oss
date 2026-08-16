import { db } from "@/db";
import { checkAutoPlugAllowed, checkResurfaceAllowed } from "@/lib/plan-limits";
import {
  posts,
  postPublications,
  connectedAccounts,
  resurfaceSchedules,
  resurfaceEvents,
  autoPlugs,
} from "@/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import { requireWorkspaceSession } from "@/lib/workspace/session";
import { postScopeCondition } from "@/lib/workspace/context";
import { isPostOlderThanAutoFeaturesEditWindow } from "@social0/shared";

const PLATFORM_X = "x";
const MAX_RESURFACES_CAP = 10;

/**
 * Earliest X (Twitter) publish time for this post, scoped to the post owner.
 * Call only after verifying the caller owns the post (e.g. via posts.userId).
 */
async function assertPostAutoFeaturesEditable(
  postId: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const rows = await db
    .select({ publishedAt: postPublications.publishedAt })
    .from(postPublications)
    .innerJoin(posts, eq(postPublications.postId, posts.id))
    .innerJoin(
      connectedAccounts,
      eq(postPublications.connectedAccountId, connectedAccounts.id),
    )
    .where(
      and(
        eq(postPublications.postId, postId),
        eq(posts.userId, userId),
        eq(postPublications.status, "published"),
        eq(connectedAccounts.platform, "twitter_x"),
      ),
    );
  const times = rows
    .map((r) => r.publishedAt)
    .filter((d): d is Date => d != null)
    .map((d) => new Date(d).getTime());
  if (times.length === 0) {
    return {
      ok: false,
      error:
        "No published X (Twitter) publication - Auto-Plug and Auto-Repost can’t be changed.",
    };
  }
  const earliest = new Date(Math.min(...times));
  if (isPostOlderThanAutoFeaturesEditWindow(earliest)) {
    return {
      ok: false,
      error:
        "This post is older than 24 hours - Auto-Plug and Auto-Repost can no longer be edited.",
    };
  }
  return { ok: true };
}

export type AutoPlugConfig = {
  metricType: "likes" | "retweets";
  threshold: number;
  plugComment: string;
};

export type CreateAutoPlugResult =
  | { success: true; autoPlugId: string }
  | { success: false; error: string };

export async function createAutoPlug(
  postId: string,
  connectedAccountId: string | null,
  config: AutoPlugConfig,
): Promise<CreateAutoPlugResult> {
  const ws = await requireWorkspaceSession("edit_posts");
  if (!ws.ok) {
    return { success: false, error: ws.error };
  }
  const userId = ws.ctx.resourceUserId;

  const autoPlugAllowed = await checkAutoPlugAllowed(userId);
  if (!autoPlugAllowed) {
    return {
      success: false,
      error:
        "Auto-plug is available on the Growth plan. Upgrade to use this feature.",
    };
  }

  const [post] = await db
    .select({ id: posts.id, userId: posts.userId, status: posts.status })
    .from(posts)
    .where(and(eq(posts.id, postId), postScopeCondition(ws.ctx)));

  if (!post) {
    return { success: false, error: "Post not found" };
  }

  if (post.status !== "published" && post.status !== "partial") {
    return { success: false, error: "Post must be published first" };
  }

  const editablePlug = await assertPostAutoFeaturesEditable(postId, userId);
  if (!editablePlug.ok) {
    return { success: false, error: editablePlug.error };
  }

  const xPublications = await db
    .select({
      autoPlugId: autoPlugs.id,
      connectedAccountId: postPublications.connectedAccountId,
      platformPostId: postPublications.platformPostId,
      connectedAccountUserId: connectedAccounts.userId,
    })
    .from(postPublications)
    .innerJoin(
      connectedAccounts,
      eq(postPublications.connectedAccountId, connectedAccounts.id),
    )
    .leftJoin(
      autoPlugs,
      and(
        eq(autoPlugs.postId, postId),
        eq(autoPlugs.connectedAccountId, postPublications.connectedAccountId),
        inArray(autoPlugs.status, ["watching", "triggered"]),
      ),
    )
    .where(
      and(
        eq(postPublications.postId, postId),
        eq(connectedAccounts.platform, "twitter_x"),
        eq(postPublications.status, "published"),
      ),
    )
    .orderBy(
      desc(postPublications.publishedAt),
      desc(postPublications.createdAt),
    );

  const pub =
    (connectedAccountId
      ? xPublications.find(
          (row) => row.connectedAccountId === connectedAccountId,
        )
      : null) ?? xPublications[0];

  if (!pub || pub.connectedAccountUserId !== userId) {
    return { success: false, error: "No published X post found for this post" };
  }

  if (!pub.connectedAccountId) {
    return {
      success: false,
      error: "Published X post is missing account metadata",
    };
  }

  if (!pub.platformPostId) {
    return {
      success: false,
      error: "Tweet ID not found - cannot set up auto-plug",
    };
  }

  const threshold = Math.max(1, Math.round(config.threshold));
  const metricType = config.metricType === "retweets" ? "retweets" : "likes";
  const plugComment = (config.plugComment ?? "").trim().slice(0, 280);
  if (!plugComment) {
    return { success: false, error: "Auto-Plug message is required" };
  }

  if (pub.autoPlugId) {
    return {
      success: false,
      error: "Auto-Plug is already set up for this X post",
    };
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  try {
    const [plug] = await db
      .insert(autoPlugs)
      .values({
        postId,
        connectedAccountId: pub.connectedAccountId,
        platform: PLATFORM_X,
        metricType,
        metricThreshold: threshold,
        plugComment,
        status: "watching",
        platformPostId: pub.platformPostId,
        plugTweetId: null,
        expiresAt,
        updatedAt: now,
      })
      .returning({ id: autoPlugs.id });

    if (!plug) {
      return { success: false, error: "Failed to create auto-plug" };
    }

    return { success: true, autoPlugId: plug.id };
  } catch (e) {
    console.error("[createAutoPlug]", e);
    const msg = e instanceof Error ? e.message : String(e);
    const hint =
      msg.includes("relation") || msg.includes("does not exist")
        ? " Run database migrations (npm run db:migrate) to enable Auto-Plug."
        : "";
    return {
      success: false,
      error: (msg + hint).trim() || "Failed to create auto-plug",
    };
  }
}

export type CreateResurfaceResult =
  | { success: true; scheduleId: string }
  | { success: false; error: string };

export async function createResurfaceSchedule(
  postId: string,
  platform: string,
  intervalHours: number,
  maxResurfaces: number,
  plugComment: string | null,
): Promise<CreateResurfaceResult> {
  const ws = await requireWorkspaceSession("edit_posts");
  if (!ws.ok) {
    return { success: false, error: ws.error };
  }
  const userId = ws.ctx.resourceUserId;

  const resurfaceAllowed = await checkResurfaceAllowed(userId);
  if (!resurfaceAllowed) {
    return {
      success: false,
      error:
        "Resurface / auto-repost is available on the Growth plan. Upgrade to use this feature.",
    };
  }

  if (platform !== PLATFORM_X) {
    return { success: false, error: "Only X (Twitter) is supported for now" };
  }

  const capped = Math.min(
    Math.max(1, Math.round(maxResurfaces)),
    MAX_RESURFACES_CAP,
  );
  // Allow fractional hours (e.g. 0.5 = 30 min), minimum 0.5
  const interval = Math.max(0.5, Math.round(intervalHours * 10) / 10);

  const [post] = await db
    .select({ id: posts.id, userId: posts.userId, status: posts.status })
    .from(posts)
    .where(and(eq(posts.id, postId), postScopeCondition(ws.ctx)));

  if (!post) {
    return { success: false, error: "Post not found" };
  }

  if (post.status !== "published" && post.status !== "partial") {
    return { success: false, error: "Post must be published first" };
  }

  const editableResurface = await assertPostAutoFeaturesEditable(
    postId,
    userId,
  );
  if (!editableResurface.ok) {
    return { success: false, error: editableResurface.error };
  }

  const xPublication = await db
    .select({
      publicationId: postPublications.id,
      platformPostId: postPublications.platformPostId,
      connectedAccountId: postPublications.connectedAccountId,
    })
    .from(postPublications)
    .innerJoin(
      connectedAccounts,
      eq(postPublications.connectedAccountId, connectedAccounts.id),
    )
    .where(
      and(
        eq(postPublications.postId, postId),
        eq(connectedAccounts.platform, "twitter_x"),
        eq(postPublications.status, "published"),
      ),
    )
    .limit(1);

  if (xPublication.length === 0 || !xPublication[0].platformPostId) {
    return {
      success: false,
      error: "No published X (Twitter) publication found for this post",
    };
  }

  try {
    const existing = await db
      .select({ id: resurfaceSchedules.id })
      .from(resurfaceSchedules)
      .where(eq(resurfaceSchedules.postId, postId));

    if (existing.length > 0) {
      return {
        success: false,
        error: "Auto-Repost is already set up for this post",
      };
    }

    const now = new Date();
    const nextAt = new Date(now.getTime() + interval * 60 * 60 * 1000);

    const [schedule] = await db
      .insert(resurfaceSchedules)
      .values({
        postId,
        platform: PLATFORM_X,
        intervalHours: interval,
        maxResurfaces: capped,
        plugComment: plugComment?.trim() || null,
        isActive: true,
        resurfacesDone: 0,
        updatedAt: now,
      })
      .returning({ id: resurfaceSchedules.id });

    if (!schedule) {
      return { success: false, error: "Failed to create schedule" };
    }

    await db.insert(resurfaceEvents).values({
      scheduleId: schedule.id,
      status: "pending",
      nextExecuteAt: nextAt,
    });

    return { success: true, scheduleId: schedule.id };
  } catch (e) {
    console.error("[createResurfaceSchedule]", e);
    const msg = e instanceof Error ? e.message : String(e);
    const hint =
      msg.includes("relation") || msg.includes("does not exist")
        ? " Run database migrations (npm run db:migrate) to enable Auto-Repost."
        : "";
    return {
      success: false,
      error: (msg + hint).trim() || "Failed to create schedule",
    };
  }
}

export type DisableResurfaceResult =
  | { success: true }
  | { success: false; error: string };

export async function disableResurfaceSchedule(
  scheduleId: string,
): Promise<DisableResurfaceResult> {
  const ws = await requireWorkspaceSession("edit_posts");
  if (!ws.ok) {
    return { success: false, error: ws.error };
  }
  const userId = ws.ctx.resourceUserId;

  const [schedule] = await db
    .select({
      id: resurfaceSchedules.id,
      postId: resurfaceSchedules.postId,
      userId: posts.userId,
    })
    .from(resurfaceSchedules)
    .innerJoin(posts, eq(resurfaceSchedules.postId, posts.id))
    .where(
      and(eq(resurfaceSchedules.id, scheduleId), postScopeCondition(ws.ctx)),
    );

  if (!schedule || schedule.userId !== userId) {
    return { success: false, error: "Schedule not found" };
  }

  try {
    await db
      .update(resurfaceSchedules)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(resurfaceSchedules.id, scheduleId));
    return { success: true };
  } catch (e) {
    console.error("[disableResurfaceSchedule]", e);
    return {
      success: false,
      error: e instanceof Error ? e.message : "Failed to disable",
    };
  }
}

export type UpdateAutoPlugResult =
  | { success: true }
  | { success: false; error: string };

/** Update Auto-Plug while status is `watching`. */
export async function updateAutoPlug(
  postId: string,
  config: AutoPlugConfig,
): Promise<UpdateAutoPlugResult> {
  const ws = await requireWorkspaceSession("edit_posts");
  if (!ws.ok) {
    return { success: false, error: ws.error };
  }
  const userId = ws.ctx.resourceUserId;

  const autoPlugAllowed = await checkAutoPlugAllowed(userId);
  if (!autoPlugAllowed) {
    return {
      success: false,
      error:
        "Auto-plug is available on the Growth plan. Upgrade to use this feature.",
    };
  }

  const threshold = Math.max(1, Math.round(config.threshold));
  const metricType = config.metricType === "retweets" ? "retweets" : "likes";
  const plugComment = (config.plugComment ?? "").trim().slice(0, 280);
  if (!plugComment) {
    return { success: false, error: "Auto-Plug message is required" };
  }

  const editableUpdatePlug = await assertPostAutoFeaturesEditable(
    postId,
    userId,
  );
  if (!editableUpdatePlug.ok) {
    return { success: false, error: editableUpdatePlug.error };
  }

  const [row] = await db
    .select({ id: autoPlugs.id, status: autoPlugs.status })
    .from(autoPlugs)
    .innerJoin(posts, eq(autoPlugs.postId, posts.id))
    .where(and(eq(autoPlugs.postId, postId), postScopeCondition(ws.ctx)))
    .orderBy(desc(autoPlugs.createdAt))
    .limit(1);

  if (!row) {
    return { success: false, error: "Auto-Plug not found for this post" };
  }
  if (row.status !== "watching") {
    return {
      success: false,
      error:
        "Auto-Plug can’t be edited anymore (already triggered or finished).",
    };
  }

  try {
    await db
      .update(autoPlugs)
      .set({
        metricType,
        metricThreshold: threshold,
        plugComment,
        updatedAt: new Date(),
      })
      .where(eq(autoPlugs.id, row.id));
    return { success: true };
  } catch (e) {
    console.error("[updateAutoPlug]", e);
    return {
      success: false,
      error: e instanceof Error ? e.message : "Failed to update auto-plug",
    };
  }
}

/** Remove a watching Auto-Plug before it triggers (turn feature off). */
export async function cancelAutoPlug(
  postId: string,
): Promise<UpdateAutoPlugResult> {
  const ws = await requireWorkspaceSession("edit_posts");
  if (!ws.ok) {
    return { success: false, error: ws.error };
  }
  const userId = ws.ctx.resourceUserId;

  // Allow turning off even if the user downgraded - no Growth plan check.

  const [row] = await db
    .select({ id: autoPlugs.id })
    .from(autoPlugs)
    .innerJoin(posts, eq(autoPlugs.postId, posts.id))
    .where(
      and(
        eq(autoPlugs.postId, postId),
        postScopeCondition(ws.ctx),
        eq(autoPlugs.status, "watching"),
      ),
    )
    .orderBy(desc(autoPlugs.createdAt))
    .limit(1);

  if (!row) {
    return { success: false, error: "No active Auto-Plug to turn off" };
  }

  try {
    await db.delete(autoPlugs).where(eq(autoPlugs.id, row.id));
    return { success: true };
  } catch (e) {
    console.error("[cancelAutoPlug]", e);
    return {
      success: false,
      error: e instanceof Error ? e.message : "Failed to turn off Auto-Plug",
    };
  }
}

export type UpdateResurfaceScheduleResult =
  | { success: true }
  | { success: false; error: string };

export async function updateResurfaceSchedule(
  scheduleId: string,
  updates: {
    intervalHours?: number;
    maxResurfaces?: number;
    plugComment?: string | null;
    isActive?: boolean;
  },
): Promise<UpdateResurfaceScheduleResult> {
  const ws = await requireWorkspaceSession("edit_posts");
  if (!ws.ok) {
    return { success: false, error: ws.error };
  }
  const userId = ws.ctx.resourceUserId;

  const resurfaceAllowed = await checkResurfaceAllowed(userId);
  if (!resurfaceAllowed) {
    return {
      success: false,
      error:
        "Resurface / auto-repost is available on the Growth plan. Upgrade to use this feature.",
    };
  }

  const [schedule] = await db
    .select({
      id: resurfaceSchedules.id,
      postId: resurfaceSchedules.postId,
      intervalHours: resurfaceSchedules.intervalHours,
      maxResurfaces: resurfaceSchedules.maxResurfaces,
      resurfacesDone: resurfaceSchedules.resurfacesDone,
      isActive: resurfaceSchedules.isActive,
      userId: posts.userId,
    })
    .from(resurfaceSchedules)
    .innerJoin(posts, eq(resurfaceSchedules.postId, posts.id))
    .where(
      and(eq(resurfaceSchedules.id, scheduleId), postScopeCondition(ws.ctx)),
    );

  if (!schedule || schedule.userId !== userId) {
    return { success: false, error: "Schedule not found" };
  }

  const requiresFreshPostWindow =
    updates.intervalHours !== undefined ||
    updates.maxResurfaces !== undefined ||
    updates.plugComment !== undefined;

  if (requiresFreshPostWindow) {
    const editableUpdateSchedule = await assertPostAutoFeaturesEditable(
      schedule.postId,
      userId,
    );
    if (!editableUpdateSchedule.ok) {
      return { success: false, error: editableUpdateSchedule.error };
    }
  }

  const done = schedule.resurfacesDone ?? 0;
  const nextInterval =
    updates.intervalHours !== undefined
      ? Math.max(0.5, Math.round(updates.intervalHours * 10) / 10)
      : (schedule.intervalHours ?? 4);
  const nextMax =
    updates.maxResurfaces !== undefined
      ? Math.min(
          Math.max(1, Math.round(updates.maxResurfaces)),
          MAX_RESURFACES_CAP,
        )
      : (schedule.maxResurfaces ?? 1);

  if (nextMax < done) {
    return {
      success: false,
      error: `Number of reshares can’t be lower than already completed (${done}).`,
    };
  }

  const plugComment =
    updates.plugComment !== undefined
      ? updates.plugComment === null
        ? null
        : updates.plugComment.trim() || null
      : undefined;

  const intervalChanged =
    updates.intervalHours !== undefined &&
    nextInterval !== schedule.intervalHours;
  const maxIncreased =
    updates.maxResurfaces !== undefined &&
    nextMax > (schedule.maxResurfaces ?? 0);

  const hitCapIncrease =
    maxIncreased && done >= (schedule.maxResurfaces ?? 0) && done < nextMax;

  const effectiveIsActive = hitCapIncrease
    ? true
    : updates.isActive !== undefined
      ? updates.isActive
      : schedule.isActive;

  const now = new Date();

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(resurfaceSchedules)
        .set({
          ...(updates.intervalHours !== undefined
            ? { intervalHours: nextInterval }
            : {}),
          ...(updates.maxResurfaces !== undefined
            ? { maxResurfaces: nextMax }
            : {}),
          ...(plugComment !== undefined ? { plugComment } : {}),
          ...(updates.isActive !== undefined || hitCapIncrease
            ? { isActive: effectiveIsActive }
            : {}),
          updatedAt: now,
        })
        .where(eq(resurfaceSchedules.id, scheduleId));

      if (intervalChanged) {
        const nextAt = new Date(now.getTime() + nextInterval * 60 * 60 * 1000);
        await tx
          .update(resurfaceEvents)
          .set({ nextExecuteAt: nextAt })
          .where(
            and(
              eq(resurfaceEvents.scheduleId, scheduleId),
              eq(resurfaceEvents.status, "pending"),
            ),
          );
      }

      if (effectiveIsActive && done < nextMax) {
        const [pending] = await tx
          .select({ id: resurfaceEvents.id })
          .from(resurfaceEvents)
          .where(
            and(
              eq(resurfaceEvents.scheduleId, scheduleId),
              eq(resurfaceEvents.status, "pending"),
            ),
          )
          .limit(1);
        if (!pending) {
          const nextAt = new Date(
            now.getTime() + nextInterval * 60 * 60 * 1000,
          );
          await tx.insert(resurfaceEvents).values({
            scheduleId,
            status: "pending",
            nextExecuteAt: nextAt,
          });
        }
      }
    });

    return { success: true };
  } catch (e) {
    console.error("[updateResurfaceSchedule]", e);
    return {
      success: false,
      error: e instanceof Error ? e.message : "Failed to update schedule",
    };
  }
}
