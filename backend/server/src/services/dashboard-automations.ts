import { and, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  autoPlugs,
  connectedAccounts,
  posts,
  resurfaceEvents,
  resurfaceSchedules,
} from "@/db/schema";
import { getPlanLimits } from "@social0/shared";
import { getSubscriptionForUser } from "@/lib/subscription";
import { requireWorkspaceSession } from "@/lib/workspace/session";
import { postScopeCondition } from "@/lib/workspace/context";

/**
 * `dashboard.listAutomations`: read-only rows for the Automations page.
 *
 * Automations are per post today (no rule table): Auto-Plug rows, Auto-Repost
 * (resurface) schedules, and scheduled posts carrying
 * `metadata.bulkAutoFeatures` that will set those up once X publishes.
 * Toggles use the existing mutations:
 * - Auto-Plug: `resurface.cancelAutoPlug(postId)` / `resurface.updateAutoPlug(postId, config)`
 * - Auto-Repost: `resurface.updateResurfaceSchedule(scheduleId, { isActive })`
 *   or `resurface.disableResurfaceSchedule(scheduleId)`
 * - Pending (scheduled post): `posts.updateScheduledPostAutoFeatures(postId, { autoPlugConfig, resurfaceConfig })`
 */

const ROW_LIMIT = 100;
const SNIPPET_LENGTH = 120;

export type AutomationAutoPlug = {
  id: string;
  postId: string;
  postSnippet: string;
  /** watching | triggered | expired | failed */
  status: string;
  metricType: string;
  metricThreshold: number;
  plugComment: string;
  connectedAccountId: string;
  platformUsername: string | null;
  expiresAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type AutomationResurface = {
  id: string;
  postId: string;
  postSnippet: string;
  platform: string;
  isActive: boolean;
  intervalHours: number;
  maxResurfaces: number;
  resurfacesDone: number;
  plugComment: string | null;
  runsDone: number;
  runsFailed: number;
  lastRunAt: string | null;
  lastRunStatus: "done" | "failed" | null;
  nextRunAt: string | null;
  createdAt: string | null;
};

export type AutomationPending = {
  postId: string;
  postSnippet: string;
  scheduledAt: string | null;
  autoPlug: { metricType: string; threshold: number; plugComment: string } | null;
  autoRepost: {
    intervalHours: number;
    maxResurfaces: number;
    plugComment: string | null;
  } | null;
};

export type ListAutomationsResult =
  | {
      ok: true;
      data: {
        autoPlugs: AutomationAutoPlug[];
        resurfaces: AutomationResurface[];
        pending: AutomationPending[];
        stats: {
          autoPlugsWatching: number;
          autoPlugsTriggered: number;
          autoPlugsFailed: number;
          resurfacesActive: number;
          resurfaceRunsDone: number;
          resurfaceRunsFailed: number;
          pending: number;
        };
        plan: {
          allowAutoPlug: boolean;
          allowResurface: boolean;
          allowBulkTools: boolean;
        };
        canEdit: boolean;
      };
    }
  | { ok: false; error: string };

function snippetOf(content: string | null): string {
  const line = (content ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find(Boolean);
  if (!line) return "";
  return line.length > SNIPPET_LENGTH ? `${line.slice(0, SNIPPET_LENGTH - 1)}…` : line;
}

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readPending(metadata: unknown): Pick<AutomationPending, "autoPlug" | "autoRepost"> | null {
  const bulk = asRecord(asRecord(metadata)?.bulkAutoFeatures);
  if (!bulk) return null;
  const plug = asRecord(bulk.autoPlugConfig);
  const repost = asRecord(bulk.autoRepostConfig);
  const autoPlug =
    plug && typeof plug.plugComment === "string" && num(plug.threshold) !== null
      ? {
          metricType: typeof plug.metricType === "string" ? plug.metricType : "likes",
          threshold: num(plug.threshold)!,
          plugComment: plug.plugComment,
        }
      : null;
  const autoRepost =
    repost && num(repost.intervalHours) !== null && num(repost.maxResurfaces) !== null
      ? {
          intervalHours: num(repost.intervalHours)!,
          maxResurfaces: num(repost.maxResurfaces)!,
          plugComment: typeof repost.plugComment === "string" ? repost.plugComment : null,
        }
      : null;
  if (!autoPlug && !autoRepost) return null;
  return { autoPlug, autoRepost };
}

export async function listAutomations(): Promise<ListAutomationsResult> {
  const ws = await requireWorkspaceSession("view_posts");
  if (!ws.ok) return { ok: false, error: ws.error };
  const ctx = ws.ctx;
  const scope = postScopeCondition(ctx);

  const [plugRows, scheduleRows, pendingRows, subscription] = await Promise.all([
    db
      .select({
        id: autoPlugs.id,
        postId: autoPlugs.postId,
        content: posts.originalContent,
        status: autoPlugs.status,
        metricType: autoPlugs.metricType,
        metricThreshold: autoPlugs.metricThreshold,
        plugComment: autoPlugs.plugComment,
        connectedAccountId: autoPlugs.connectedAccountId,
        platformUsername: connectedAccounts.platformUsername,
        expiresAt: autoPlugs.expiresAt,
        createdAt: autoPlugs.createdAt,
        updatedAt: autoPlugs.updatedAt,
      })
      .from(autoPlugs)
      .innerJoin(posts, eq(autoPlugs.postId, posts.id))
      .leftJoin(connectedAccounts, eq(autoPlugs.connectedAccountId, connectedAccounts.id))
      .where(scope)
      .orderBy(desc(autoPlugs.createdAt))
      .limit(ROW_LIMIT),
    db
      .select({
        id: resurfaceSchedules.id,
        postId: resurfaceSchedules.postId,
        content: posts.originalContent,
        platform: resurfaceSchedules.platform,
        isActive: resurfaceSchedules.isActive,
        intervalHours: resurfaceSchedules.intervalHours,
        maxResurfaces: resurfaceSchedules.maxResurfaces,
        resurfacesDone: resurfaceSchedules.resurfacesDone,
        plugComment: resurfaceSchedules.plugComment,
        createdAt: resurfaceSchedules.createdAt,
      })
      .from(resurfaceSchedules)
      .innerJoin(posts, eq(resurfaceSchedules.postId, posts.id))
      .where(scope)
      .orderBy(desc(resurfaceSchedules.createdAt))
      .limit(ROW_LIMIT),
    db
      .select({
        id: posts.id,
        content: posts.originalContent,
        scheduledAt: posts.scheduledAt,
        metadata: posts.metadata,
      })
      .from(posts)
      .where(
        and(
          scope,
          eq(posts.status, "scheduled"),
          sql`(${posts.metadata} -> 'bulkAutoFeatures') is not null`,
        ),
      )
      .orderBy(posts.scheduledAt)
      .limit(ROW_LIMIT),
    getSubscriptionForUser(ctx.resourceUserId),
  ]);

  const scheduleIds = scheduleRows.map((s) => s.id);
  // When a run happened. Failed runs written before the repost cron stamped
  // `executed_at` only carry the time they were due; without the fallback they
  // sort behind every success and the rule reads as healthy (same fallback as
  // the post timeline in lib/publish-timeline.ts).
  const ranAt = sql`coalesce(${resurfaceEvents.executedAt}, ${resurfaceEvents.nextExecuteAt}, ${resurfaceEvents.createdAt})`;
  const eventRows =
    scheduleIds.length > 0
      ? await db
          .select({
            scheduleId: resurfaceEvents.scheduleId,
            done: sql<number>`(count(*) filter (where ${resurfaceEvents.status} = 'done'))::int`,
            failed: sql<number>`(count(*) filter (where ${resurfaceEvents.status} = 'failed'))::int`,
            // Timestamps decode through the column (zone-less = UTC); a raw
            // sql string would be parsed in the server's local zone.
            lastRunAt: sql`max(${ranAt}) filter (where ${resurfaceEvents.status} in ('done', 'failed'))`.mapWith(
              resurfaceEvents.executedAt,
            ) as SQL<Date | null>,
            nextRunAt: sql`min(${resurfaceEvents.nextExecuteAt}) filter (where ${resurfaceEvents.status} = 'pending')`.mapWith(
              resurfaceEvents.nextExecuteAt,
            ) as SQL<Date | null>,
            lastStatus: sql<string | null>`(array_agg(${resurfaceEvents.status} order by ${ranAt} desc nulls last) filter (where ${resurfaceEvents.status} in ('done', 'failed')))[1]`,
          })
          .from(resurfaceEvents)
          .where(inArray(resurfaceEvents.scheduleId, scheduleIds))
          .groupBy(resurfaceEvents.scheduleId)
      : [];
  const eventsBySchedule = new Map(eventRows.map((e) => [e.scheduleId, e]));

  const limits = getPlanLimits(subscription.tier);

  const autoPlugList: AutomationAutoPlug[] = plugRows.map((p) => ({
    id: p.id,
    postId: p.postId,
    postSnippet: snippetOf(p.content),
    status: p.status,
    metricType: p.metricType,
    metricThreshold: p.metricThreshold,
    plugComment: p.plugComment,
    connectedAccountId: p.connectedAccountId,
    platformUsername: p.platformUsername ?? null,
    expiresAt: iso(p.expiresAt),
    createdAt: iso(p.createdAt),
    updatedAt: iso(p.updatedAt),
  }));

  const resurfaceList: AutomationResurface[] = scheduleRows.map((s) => {
    const ev = eventsBySchedule.get(s.id);
    const lastStatus = ev?.lastStatus;
    return {
      id: s.id,
      postId: s.postId,
      postSnippet: snippetOf(s.content),
      platform: s.platform === "x" ? "twitter_x" : s.platform,
      isActive: s.isActive,
      intervalHours: s.intervalHours,
      maxResurfaces: s.maxResurfaces,
      resurfacesDone: s.resurfacesDone,
      plugComment: s.plugComment,
      runsDone: ev?.done ?? 0,
      runsFailed: ev?.failed ?? 0,
      lastRunAt: iso(ev?.lastRunAt),
      lastRunStatus: lastStatus === "done" || lastStatus === "failed" ? lastStatus : null,
      nextRunAt: s.isActive ? iso(ev?.nextRunAt) : null,
      createdAt: iso(s.createdAt),
    };
  });

  const pendingList: AutomationPending[] = [];
  for (const row of pendingRows) {
    const parsed = readPending(row.metadata);
    if (!parsed) continue;
    pendingList.push({
      postId: row.id,
      postSnippet: snippetOf(row.content),
      scheduledAt: iso(row.scheduledAt),
      ...parsed,
    });
  }

  return {
    ok: true,
    data: {
      autoPlugs: autoPlugList,
      resurfaces: resurfaceList,
      pending: pendingList,
      stats: {
        autoPlugsWatching: autoPlugList.filter((p) => p.status === "watching").length,
        autoPlugsTriggered: autoPlugList.filter((p) => p.status === "triggered").length,
        autoPlugsFailed: autoPlugList.filter((p) => p.status === "failed").length,
        resurfacesActive: resurfaceList.filter((r) => r.isActive).length,
        resurfaceRunsDone: resurfaceList.reduce((n, r) => n + r.runsDone, 0),
        resurfaceRunsFailed: resurfaceList.reduce((n, r) => n + r.runsFailed, 0),
        pending: pendingList.length,
      },
      plan: {
        allowAutoPlug: limits.allowAutoPlug,
        allowResurface: limits.allowResurface,
        allowBulkTools: limits.allowBulkTools,
      },
      canEdit: ctx.permissions.has("edit_posts"),
    },
  };
}
