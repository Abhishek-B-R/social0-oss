/**
 * `/v1` post actions the dashboard already had: bulk delete, duplicate,
 * post again, Auto-Plug and Auto-Repost. Each one reuses the dashboard core
 * (`*ForScope`) or the `/v1` core, so behaviour matches every surface.
 */
import { and, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { posts, postPublications, resurfaceSchedules } from "../db/schema.js";
import { isValidUUID } from "../lib/validation.js";
import type { V1Scope } from "../lib/v1-workspace.js";
import { postScopeCondition, type WorkspaceContext } from "../lib/workspace/context.js";
import { postAgainForScope, POSTS_BATCH_MAX } from "./posts.js";
import {
  cancelAutoPlugForScope,
  createAutoPlugForScope,
  createResurfaceScheduleForScope,
  disableResurfaceScheduleForScope,
  updateAutoPlugForScope,
  updateResurfaceScheduleForScope,
} from "./resurface.js";
import { v1CreateDraft, v1DeletePost, type V1CreateOptions } from "./v1-posts.js";

type Fail = { ok: false; error: string };
type Ok<T> = { ok: true } & T;

/** Deletes each draft or scheduled post; others are reported, not deleted (same rule as `DELETE /v1/posts/:id`). */
export async function v1BulkDeletePosts(
  scope: V1Scope,
  ids: string[],
): Promise<{ deleted: string[]; failed: { id: string; error: string }[] }> {
  const out = { deleted: [] as string[], failed: [] as { id: string; error: string }[] };
  for (const id of new Set(ids.slice(0, POSTS_BATCH_MAX))) {
    const res = await v1DeletePost(scope, id);
    if (res.ok) out.deleted.push(id);
    else out.failed.push({ id, error: res.error });
  }
  return out;
}

/** Copy a post (content, accounts, media, settings) into a new draft. */
export async function v1DuplicatePost(
  scope: V1Scope,
  postId: string,
  opts: V1CreateOptions = {},
): Promise<Ok<{ id: string }> | Fail> {
  if (!isValidUUID(postId)) return { ok: false, error: "Post not found" };
  const [post] = await db
    .select({ content: posts.originalContent, mediaIds: posts.mediaIds, metadata: posts.metadata })
    .from(posts)
    .where(
      and(
        eq(posts.id, postId),
        postScopeCondition({ resourceUserId: scope.userId, workspaceId: scope.workspaceId }),
      ),
    )
    .limit(1);
  if (!post) return { ok: false, error: "Post not found" };

  const pubs = await db
    .select({ accountId: postPublications.connectedAccountId })
    .from(postPublications)
    .where(eq(postPublications.postId, postId));
  const platforms = [...new Set(pubs.map((p) => p.accountId).filter((id): id is string => !!id))];

  return v1CreateDraft(
    scope,
    {
      content: post.content ?? "",
      platforms,
      media: post.mediaIds ?? [],
      metadata:
        post.metadata && typeof post.metadata === "object"
          ? (post.metadata as Record<string, unknown>)
          : undefined,
    },
    opts,
  );
}

/** Publish a published or partial post again as a new post. */
export async function v1PostAgain(
  ctx: WorkspaceContext,
  postId: string,
): Promise<Ok<{ post_id: string; tracking_id: string | null; stream_url: string | null; warning?: string }> | Fail> {
  const res = await postAgainForScope({ ok: true, ctx }, postId);
  if (!res.success) return { ok: false, error: res.error };
  return {
    ok: true,
    post_id: res.newPostId,
    tracking_id: res.trackingId ?? null,
    stream_url: res.trackingId ? `/v1/jobs/${res.trackingId}/stream` : null,
    ...(res.warning ? { warning: res.warning } : {}),
  };
}

export type V1AutoPlugInput = {
  metric: "likes" | "retweets";
  threshold: number;
  message: string;
  account_id?: string;
};

/** Turn on Auto-Plug for the post's X publication, or change the one that is watching. */
export async function v1SetAutoPlug(
  ctx: WorkspaceContext,
  postId: string,
  input: V1AutoPlugInput,
): Promise<Ok<{ created: boolean }> | Fail> {
  const config = { metricType: input.metric, threshold: input.threshold, plugComment: input.message };
  const ws = { ok: true as const, ctx };
  const updated = await updateAutoPlugForScope(ws, postId, config);
  if (updated.success) return { ok: true, created: false };
  if (updated.error !== "Auto-Plug not found for this post") return { ok: false, error: updated.error };
  const created = await createAutoPlugForScope(ws, postId, input.account_id ?? null, config);
  return created.success ? { ok: true, created: true } : { ok: false, error: created.error };
}

export async function v1CancelAutoPlug(ctx: WorkspaceContext, postId: string): Promise<Ok<object> | Fail> {
  const res = await cancelAutoPlugForScope({ ok: true, ctx }, postId);
  return res.success ? { ok: true } : { ok: false, error: res.error };
}

async function scheduleIdFor(ctx: WorkspaceContext, postId: string): Promise<string | null> {
  if (!isValidUUID(postId)) return null;
  const [row] = await db
    .select({ id: resurfaceSchedules.id })
    .from(resurfaceSchedules)
    .innerJoin(posts, eq(resurfaceSchedules.postId, posts.id))
    .where(and(eq(resurfaceSchedules.postId, postId), postScopeCondition(ctx)))
    .limit(1);
  return row?.id ?? null;
}

export type V1AutoRepostInput = {
  interval_hours?: number;
  max_reposts?: number;
  message?: string | null;
  active?: boolean;
};

/** Turn on Auto-Repost (X only) for a published post, or change / resume the existing schedule. */
export async function v1SetAutoRepost(
  ctx: WorkspaceContext,
  postId: string,
  input: V1AutoRepostInput,
): Promise<Ok<{ schedule_id: string; created: boolean }> | Fail> {
  const ws = { ok: true as const, ctx };
  const existing = await scheduleIdFor(ctx, postId);
  if (!existing) {
    const created = await createResurfaceScheduleForScope(
      ws,
      postId,
      "x",
      input.interval_hours ?? 4,
      input.max_reposts ?? 1,
      input.message ?? null,
    );
    return created.success
      ? { ok: true, schedule_id: created.scheduleId, created: true }
      : { ok: false, error: created.error };
  }
  const updated = await updateResurfaceScheduleForScope(ws, existing, {
    ...(input.interval_hours !== undefined ? { intervalHours: input.interval_hours } : {}),
    ...(input.max_reposts !== undefined ? { maxResurfaces: input.max_reposts } : {}),
    ...(input.message !== undefined ? { plugComment: input.message } : {}),
    ...(input.active !== undefined ? { isActive: input.active } : {}),
  });
  return updated.success
    ? { ok: true, schedule_id: existing, created: false }
    : { ok: false, error: updated.error };
}

export async function v1DisableAutoRepost(ctx: WorkspaceContext, postId: string): Promise<Ok<object> | Fail> {
  const id = await scheduleIdFor(ctx, postId);
  if (!id) return { ok: false, error: "No Auto-Repost for this post" };
  const res = await disableResurfaceScheduleForScope({ ok: true, ctx }, id);
  return res.success ? { ok: true } : { ok: false, error: res.error };
}
