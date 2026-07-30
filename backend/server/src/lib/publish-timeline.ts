import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  autoPlugs,
  posts,
  publishJobEvents,
  resurfaceEvents,
  resurfaceSchedules,
} from "../db/schema.js";

export type PublishTimelineEvent = {
  id: string;
  phase: string;
  platform: string | null;
  message: string | null;
  createdAt: string;
};

const TIMELINE_LIMIT = 100;

function mapPlatform(platform: string | null | undefined): string | null {
  if (!platform) return null;
  if (platform === "x") return "twitter_x";
  return platform;
}

async function loadAutoFeatureTimelineEvents(
  postId: string,
): Promise<PublishTimelineEvent[]> {
  const extras: PublishTimelineEvent[] = [];

  const schedules = await db
    .select({
      id: resurfaceSchedules.id,
      platform: resurfaceSchedules.platform,
    })
    .from(resurfaceSchedules)
    .where(eq(resurfaceSchedules.postId, postId));

  if (schedules.length > 0) {
    const scheduleIds = schedules.map((s) => s.id);
    const platformBySchedule = new Map(
      schedules.map((s) => [s.id, mapPlatform(s.platform)]),
    );

    const events = await db
      .select({
        id: resurfaceEvents.id,
        scheduleId: resurfaceEvents.scheduleId,
        status: resurfaceEvents.status,
        executedAt: resurfaceEvents.executedAt,
        nextExecuteAt: resurfaceEvents.nextExecuteAt,
        createdAt: resurfaceEvents.createdAt,
      })
      .from(resurfaceEvents)
      .where(
        and(
          inArray(resurfaceEvents.scheduleId, scheduleIds),
          inArray(resurfaceEvents.status, ["done", "failed"]),
        ),
      )
      .orderBy(asc(resurfaceEvents.executedAt), asc(resurfaceEvents.createdAt));

    let doneIndex = 0;
    for (const ev of events) {
      const when = ev.executedAt ?? ev.nextExecuteAt ?? ev.createdAt;
      if (!when) continue;
      const platform = platformBySchedule.get(ev.scheduleId) ?? "twitter_x";
      if (ev.status === "done") {
        doneIndex += 1;
        extras.push({
          id: `resurface:${ev.id}`,
          phase: "resurface_done",
          platform,
          message: `Auto-repost #${doneIndex} completed`,
          createdAt: when.toISOString(),
        });
      } else {
        extras.push({
          id: `resurface:${ev.id}`,
          phase: "resurface_failed",
          platform,
          message: "Auto-repost failed",
          createdAt: when.toISOString(),
        });
      }
    }
  }

  const plugs = await db
    .select({
      id: autoPlugs.id,
      platform: autoPlugs.platform,
      status: autoPlugs.status,
      metricType: autoPlugs.metricType,
      metricThreshold: autoPlugs.metricThreshold,
      createdAt: autoPlugs.createdAt,
      updatedAt: autoPlugs.updatedAt,
    })
    .from(autoPlugs)
    .where(eq(autoPlugs.postId, postId));

  for (const plug of plugs) {
    const platform = mapPlatform(plug.platform) ?? "twitter_x";
    const metricLabel =
      plug.metricType === "retweets" ? "retweets" : "likes";

    if (plug.createdAt) {
      extras.push({
        id: `autoplug-watch:${plug.id}`,
        phase: "autoplug_watching",
        platform,
        message: `Auto-plug watching for ${plug.metricThreshold} ${metricLabel}`,
        createdAt: plug.createdAt.toISOString(),
      });
    }

    if (plug.status === "watching") continue;

    const when = plug.updatedAt ?? plug.createdAt;
    if (!when) continue;

    if (plug.status === "triggered") {
      extras.push({
        id: `autoplug:${plug.id}`,
        phase: "autoplug_triggered",
        platform,
        message: "Auto-plug reply posted",
        createdAt: when.toISOString(),
      });
    } else if (plug.status === "failed") {
      extras.push({
        id: `autoplug:${plug.id}`,
        phase: "autoplug_failed",
        platform,
        message: "Auto-plug failed",
        createdAt: when.toISOString(),
      });
    } else if (plug.status === "expired") {
      extras.push({
        id: `autoplug:${plug.id}`,
        phase: "autoplug_expired",
        platform,
        message: "Auto-plug expired (milestone not reached)",
        createdAt: when.toISOString(),
      });
    }
  }

  return extras;
}

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
      .limit(TIMELINE_LIMIT);

    const publishEvents: PublishTimelineEvent[] = rows.map((r) => ({
      id: r.id,
      phase: r.phase,
      platform: r.platform ?? null,
      message: r.message ?? null,
      createdAt: (r.createdAt ?? new Date()).toISOString(),
    }));

    let autoEvents: PublishTimelineEvent[] = [];
    try {
      autoEvents = await loadAutoFeatureTimelineEvents(postId);
    } catch (e) {
      console.warn("[loadPublishTimelineForPost] auto features skipped:", e);
    }

    const merged = [...publishEvents, ...autoEvents].sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );

    return merged.slice(0, TIMELINE_LIMIT);
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
