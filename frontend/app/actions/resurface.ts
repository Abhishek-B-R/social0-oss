"use server";

import { auth } from "@/lib/auth";
import { db } from "@/db";
import {
  posts,
  postPublications,
  connectedAccounts,
  resurfaceSchedules,
  resurfaceEvents,
  autoPlugs,
} from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

const PLATFORM_X = "x";
const MAX_RESURFACES_CAP = 10;

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
  connectedAccountId: string,
  config: AutoPlugConfig,
): Promise<CreateAutoPlugResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return { success: false, error: "Unauthorized" };
  }

  const [post] = await db
    .select({ id: posts.id, userId: posts.userId, status: posts.status })
    .from(posts)
    .where(
      and(eq(posts.id, postId), eq(posts.userId, session.user.id)),
    );

  if (!post) {
    return { success: false, error: "Post not found" };
  }

  if (post.status !== "published") {
    return { success: false, error: "Post must be published first" };
  }

  const [pub] = await db
    .select({
      platformPostId: postPublications.platformPostId,
      connectedAccountUserId: connectedAccounts.userId,
    })
    .from(postPublications)
    .innerJoin(
      connectedAccounts,
      eq(postPublications.connectedAccountId, connectedAccounts.id),
    )
    .where(
      and(
        eq(postPublications.postId, postId),
        eq(postPublications.connectedAccountId, connectedAccountId),
        eq(connectedAccounts.platform, "twitter_x"),
        eq(postPublications.status, "published"),
      ),
    )
    .limit(1);

  if (!pub || pub.connectedAccountUserId !== session.user.id) {
    return { success: false, error: "Connected account not found for this post" };
  }

  if (!pub.platformPostId) {
    return {
      success: false,
      error: "Tweet ID not found — cannot set up auto-plug",
    };
  }

  const threshold = Math.max(1, Math.round(config.threshold));
  const metricType = config.metricType === "retweets" ? "retweets" : "likes";
  const plugComment = (config.plugComment ?? "").trim().slice(0, 280);
  if (!plugComment) {
    return { success: false, error: "Auto-Plug message is required" };
  }
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  try {
    const [plug] = await db
      .insert(autoPlugs)
      .values({
        postId,
        connectedAccountId,
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

    revalidatePath("/dashboard/posts");
    revalidatePath("/dashboard");
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
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return { success: false, error: "Unauthorized" };
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
    .where(
      and(eq(posts.id, postId), eq(posts.userId, session.user.id)),
    );

  if (!post) {
    return { success: false, error: "Post not found" };
  }

  if (post.status !== "published") {
    return { success: false, error: "Post must be published first" };
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
      return { success: false, error: "Auto-Repost is already set up for this post" };
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

    revalidatePath("/dashboard/posts");
    revalidatePath("/dashboard");
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
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return { success: false, error: "Unauthorized" };
  }

  const [schedule] = await db
    .select({
      id: resurfaceSchedules.id,
      postId: resurfaceSchedules.postId,
      userId: posts.userId,
    })
    .from(resurfaceSchedules)
    .innerJoin(posts, eq(resurfaceSchedules.postId, posts.id))
    .where(eq(resurfaceSchedules.id, scheduleId));

  if (!schedule || schedule.userId !== session.user.id) {
    return { success: false, error: "Schedule not found" };
  }

  try {
    await db
      .update(resurfaceSchedules)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(resurfaceSchedules.id, scheduleId));
    revalidatePath("/dashboard/posts");
    revalidatePath("/dashboard");
    return { success: true };
  } catch (e) {
    console.error("[disableResurfaceSchedule]", e);
    return {
      success: false,
      error: e instanceof Error ? e.message : "Failed to disable",
    };
  }
}
