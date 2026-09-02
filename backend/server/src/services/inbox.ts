/**
 * Social inbox - live comments on Social0-published posts + reply.
 * No DB writes.
 */

import { and, desc, eq, gte, inArray, isNotNull, lt, lte } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  connectedAccounts,
  mediaUploads,
  postPublications,
  posts,
} from "../db/schema.js";
import {
  postScopeCondition,
  connectionScopeCondition,
} from "../lib/workspace/context.js";
import { requireWorkspaceSession } from "../lib/workspace/session.js";
import type { WorkspacePermission } from "../lib/workspace/permissions.js";
import { rpcHttpError } from "../lib/rpc-http-error.js";
import { resolveAccountAccess } from "../lib/account-access.js";
import { listActiveConnectedAccounts } from "../lib/connected-accounts.js";
import { mapPool } from "../lib/map-pool.js";
import { PLATFORMS, type Platform } from "../lib/platforms.js";
import {
  fetchPublicationComments,
  fetchTwitterCommentsBatch,
  type CommentFetchInput,
  type CommentFetchResult,
} from "../lib/inbox/fetch-comments.js";
import { createHash } from "node:crypto";
import { replyOnPlatform } from "../lib/inbox/reply-comment.js";
import {
  inboxCommentLikeSupported,
  likeCommentOnPlatform,
} from "../lib/inbox/like-comment.js";
import {
  hideCommentOnPlatform,
  inboxCommentHideSupported,
} from "../lib/inbox/hide-comment.js";
import { fetchAccountDms, fetchDmMessages } from "../lib/inbox/fetch-dms.js";
import { replyToDmOnPlatform } from "../lib/inbox/reply-dm.js";
import { resolveInboxMedia } from "../lib/inbox/resolve-media.js";
import { verifyCommentOnPublication } from "../lib/inbox/verify-comment.js";
import { verifyDmConversationOnAccount } from "../lib/inbox/verify-dm.js";
import { isPlatformLive, livePlatformIds } from "../lib/live-platforms.js";
import { parseDateWindow, inDateWindow } from "../lib/date-window.js";
import { getUserTimezone } from "../lib/resolve-scheduled-at.js";
import { noteFetchError, noteFetchNotice, isInboxFetchNotice } from "../lib/inbox/fetch-errors.js";
import { createLiveRequestBudget, raceTimeout, LIVE_RPC_BUDGET_MS } from "../lib/live-request-budget.js";
import {
  PlatformApiCooldownError,
  platformCommentPageRounds,
  platformFetchConcurrency,
  platformInboxSampleLimit,
  withPlatformReadCache,
  type PlatformReadResult,
} from "../lib/platform-api-cache.js";
import {
  INBOX_UNSUPPORTED,
  isInboxDmPlatform,
  isWeakDmPeerName,
  mergeDmThreadIdentity,
  missingDmScopes,
  missingInboxScopes,
  reconnectScopesFromFetch,
  toInboxThreads,
  type InboxComment,
  type InboxDmListResult,
  type InboxDmThread,
  type InboxDmThreadResult,
  type InboxListResult,
  type InboxReconnectHint,
} from "../lib/inbox/types.js";

function parsePlatform(value: unknown): Platform | undefined {
  if (typeof value !== "string" || !value) return undefined;
  return PLATFORMS.find((p) => p.id === value)?.id;
}

/** Keep fan-out small enough to finish inside the live RPC budget. */
const SAMPLE_LIMIT = 12;
const CONCURRENCY = 2;
/** Posts published before the window can still receive in-window comments. */
const POST_PUBLISH_SLACK_MS = 90 * 24 * 60 * 60 * 1000;
const PAGE_LIMIT_MAX = 24;
const COMMENT_PAGE_ROUNDS_MAX = 2;

function filterThreadsByActivity(
  threads: ReturnType<typeof toInboxThreads>,
  since: Date,
  until: Date,
): ReturnType<typeof toInboxThreads> {
  const inWindow = (c: InboxComment) =>
    inDateWindow(c.createdAt, since, until);
  return threads.filter(
    (t) => inWindow(t.comment) || t.replies.some(inWindow),
  );
}

function recordPlatformMessage(
  fetchErrors: InboxListResult["fetchErrors"],
  notices: InboxListResult["notices"],
  item: { accountId: string; platform: string; error: string },
  status: string,
): void {
  if (!item.error) return;
  if (status === "ok" && isInboxFetchNotice(item.error)) {
    noteFetchNotice(notices, {
      platform: item.platform,
      message: item.error,
    });
    return;
  }
  if (status === "error" || status === "ok") {
    noteFetchError(fetchErrors, item);
  }
}

function parseBefore(value: unknown): Date | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function parsePageLimit(value: unknown, fallback: number): number {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(PAGE_LIMIT_MAX, Math.max(1, Math.floor(n)));
}

type PubRow = {
  publicationId: string;
  postId: string;
  platformPostId: string | null;
  platformPostUrl: string | null;
  content: string | null;
  mediaIds: string[] | null;
  publishedAt: Date | null;
  account: {
    id: string;
    platform: string;
    platformUserId: string;
    platformUsername: string | null;
    profileImageUrl: string | null;
    scopes: string | null;
    encryptedAccessToken: string;
    encryptedRefreshToken: string | null;
  } | null;
};

async function requireUser(permission: WorkspacePermission = "view_inbox") {
  const ws = await requireWorkspaceSession(permission);
  if (!ws.ok) throw rpcHttpError(ws.error, ws.statusCode);
  return ws.ctx;
}

async function loadPubs(opts: {
  resourceUserId: string;
  workspaceId: string | null;
  since: Date;
  until: Date;
  accountId?: string;
  platform?: Platform;
  before?: Date;
  limit?: number;
}): Promise<PubRow[]> {
  const live = livePlatformIds("inboxComments");
  if (!opts.platform && !live.length) return [];
  const postFilter = postScopeCondition({
    resourceUserId: opts.resourceUserId,
    workspaceId: opts.workspaceId,
  });
  const limit = opts.limit ?? SAMPLE_LIMIT;
  const rows = await db
    .select({
      publicationId: postPublications.id,
      postId: posts.id,
      platformPostId: postPublications.platformPostId,
      platformPostUrl: postPublications.platformPostUrl,
      content: posts.finalContent,
      mediaIds: posts.mediaIds,
      publishedAt: postPublications.publishedAt,
      accountId: connectedAccounts.id,
      platform: connectedAccounts.platform,
      platformUserId: connectedAccounts.platformUserId,
      platformUsername: connectedAccounts.platformUsername,
      profileImageUrl: connectedAccounts.profileImageUrl,
      scopes: connectedAccounts.scopes,
      encryptedAccessToken: connectedAccounts.encryptedAccessToken,
      encryptedRefreshToken: connectedAccounts.encryptedRefreshToken,
    })
    .from(postPublications)
    .innerJoin(posts, eq(postPublications.postId, posts.id))
    .innerJoin(
      connectedAccounts,
      eq(postPublications.connectedAccountId, connectedAccounts.id),
    )
    .where(
      and(
        postFilter,
        eq(postPublications.status, "published"),
        isNotNull(postPublications.platformPostId),
        isNotNull(postPublications.publishedAt),
        eq(connectedAccounts.isActive, true),
        gte(
          postPublications.publishedAt,
          new Date(opts.since.getTime() - POST_PUBLISH_SLACK_MS),
        ),
        lte(postPublications.publishedAt, opts.until),
        opts.before
          ? lt(postPublications.publishedAt, opts.before)
          : undefined,
        opts.accountId
          ? eq(postPublications.connectedAccountId, opts.accountId)
          : undefined,
        opts.platform
          ? eq(connectedAccounts.platform, opts.platform)
          : inArray(connectedAccounts.platform, live),
      ),
    )
    .orderBy(desc(postPublications.publishedAt))
    .limit(limit);

  return rows.map((r) => ({
    publicationId: r.publicationId,
    postId: r.postId,
    platformPostId: r.platformPostId,
    platformPostUrl: r.platformPostUrl,
    content: r.content,
    mediaIds: r.mediaIds,
    publishedAt: r.publishedAt,
    account: r.accountId
      ? {
          id: r.accountId,
          platform: r.platform!,
          platformUserId: r.platformUserId!,
          platformUsername: r.platformUsername,
          profileImageUrl: r.profileImageUrl,
          scopes: r.scopes,
          encryptedAccessToken: r.encryptedAccessToken!,
          encryptedRefreshToken: r.encryptedRefreshToken,
        }
      : null,
  }));
}

async function resolvePostMediaUrls(
  pubs: PubRow[],
): Promise<Map<string, string>> {
  const ids = new Set<string>();
  for (const p of pubs) {
    for (const id of p.mediaIds ?? []) {
      if (id) ids.add(id);
    }
  }
  if (!ids.size) return new Map();
  const rows = await db
    .select({ id: mediaUploads.id, url: mediaUploads.url })
    .from(mediaUploads)
    .where(inArray(mediaUploads.id, [...ids]));
  const map = new Map<string, string>();
  for (const row of rows) {
    if (row.url?.trim()) map.set(row.id, row.url);
  }
  return map;
}

function firstPostMediaUrl(
  mediaIds: string[] | null | undefined,
  byId: Map<string, string>,
): string | null {
  for (const id of mediaIds ?? []) {
    const url = byId.get(id);
    if (url) return url;
  }
  return null;
}

function snippet(content: string | null): string {
  return content?.replace(/\s+/g, " ").trim().slice(0, 80) || "(No caption)";
}

type CommentMutationPub = {
  publicationId: string;
  platformPostId: string | null;
  platformPostUrl: string | null;
  postId: string;
  content: string | null;
  publishedAt: Date | null;
  accountId: string;
  platform: string;
  platformUserId: string | null;
  platformUsername: string | null;
  encryptedAccessToken: string;
  encryptedRefreshToken: string | null;
};

async function loadCommentMutationPublication(
  ctx: { resourceUserId: string; workspaceId: string | null },
  publicationId: string,
): Promise<CommentMutationPub | null> {
  const postFilter = postScopeCondition({
    resourceUserId: ctx.resourceUserId,
    workspaceId: ctx.workspaceId,
  });
  const rows = await db
    .select({
      publicationId: postPublications.id,
      platformPostId: postPublications.platformPostId,
      platformPostUrl: postPublications.platformPostUrl,
      postId: posts.id,
      content: posts.finalContent,
      publishedAt: postPublications.publishedAt,
      accountId: connectedAccounts.id,
      platform: connectedAccounts.platform,
      platformUserId: connectedAccounts.platformUserId,
      platformUsername: connectedAccounts.platformUsername,
      encryptedAccessToken: connectedAccounts.encryptedAccessToken,
      encryptedRefreshToken: connectedAccounts.encryptedRefreshToken,
    })
    .from(postPublications)
    .innerJoin(posts, eq(postPublications.postId, posts.id))
    .leftJoin(
      connectedAccounts,
      eq(postPublications.connectedAccountId, connectedAccounts.id),
    )
    .where(and(postFilter, eq(postPublications.id, publicationId)))
    .limit(1);

  const row = rows[0];
  if (!row?.accountId || !row.platform) return null;
  return row as CommentMutationPub;
}

function commentFetchInputForMutation(
  row: CommentMutationPub,
  accessToken: string,
  accessSecret: string | null | undefined,
): CommentFetchInput {
  return {
    platform: row.platform,
    platformPostId: row.platformPostId!,
    platformPostUrl: row.platformPostUrl,
    platformUserId: row.platformUserId ?? "",
    accessToken,
    accessSecret,
    accountId: row.accountId,
    accountLabel: row.platformUsername,
    postId: row.postId,
    publicationId: row.publicationId,
    postSnippet: snippet(row.content),
    postContent: row.content?.trim() || snippet(row.content),
    postPublishedAt: row.publishedAt?.toISOString() ?? null,
  };
}

async function assertCommentOnPublication(
  row: CommentMutationPub,
  commentId: string,
  accessToken: string,
  accessSecret: string | null | undefined,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!row.platformPostId?.trim()) {
    return { ok: false, error: "Publication has no platform post id." };
  }
  return verifyCommentOnPublication(
    commentFetchInputForMutation(row, accessToken, accessSecret),
    commentId,
  );
}

export async function listInboxComments(input: {
  accountId?: unknown;
  platform?: unknown;
  range?: unknown;
  since?: unknown;
  until?: unknown;
  before?: unknown;
  limit?: unknown;
  fresh?: unknown;
}): Promise<InboxListResult> {
  const ctx = await requireUser();
  const timeZone = await getUserTimezone(ctx.resourceUserId);
  const { range, since, until } = parseDateWindow(input, timeZone);
  const accountId =
    typeof input.accountId === "string" && input.accountId
      ? input.accountId
      : undefined;
  const platform = parsePlatform(input.platform);
  const before = parseBefore(input.before);
  const fresh = input.fresh === true;
  const limit = parsePageLimit(
    input.limit,
    platformInboxSampleLimit(platform, SAMPLE_LIMIT, {
      allAccounts: !accountId,
    }),
  );
  const pageRounds = platformCommentPageRounds(platform, COMMENT_PAGE_ROUNDS_MAX);
  const fetchConcurrency = platform
    ? platformFetchConcurrency(platform, CONCURRENCY)
    : 1;

  const reconnect = new Map<string, InboxReconnectHint>();
  /** Accounts that returned comments/OK this request - do not nag from stale DB scopes. */
  const fetchOkAccounts = new Set<string>();
  const unsupported = new Set<string>();
  const fetchErrors: InboxListResult["fetchErrors"] = [];
  const notices: InboxListResult["notices"] = [];
  const allComments: InboxComment[] = [];
  const budget = createLiveRequestBudget();
  let budgetHit = false;

  let cursorBefore = before;
  let hasMore = false;
  let nextBefore: string | null = null;

  for (let round = 0; round < pageRounds; round++) {
    if (budget.isExpired()) {
      budgetHit = true;
      break;
    }
    const pubs = await loadPubs({
      resourceUserId: ctx.resourceUserId,
      workspaceId: ctx.workspaceId,
      since,
      until,
      accountId,
      platform,
      before: cursorBefore,
      limit,
    });
    if (!pubs.length) {
      hasMore = false;
      nextBefore = null;
      break;
    }

    const mediaById = await resolvePostMediaUrls(pubs);

    const fetchInputFor = (
      row: PubRow,
      accessToken: string,
      accessSecret: string | null | undefined,
    ): CommentFetchInput => ({
      platform: row.account!.platform,
      platformPostId: row.platformPostId!,
      platformPostUrl: row.platformPostUrl,
      platformUserId: row.account!.platformUserId,
      accessToken,
      accessSecret,
      accountId: row.account!.id,
      accountLabel: row.account!.platformUsername,
      postId: row.postId,
      publicationId: row.publicationId,
      postSnippet: snippet(row.content),
      postContent: row.content?.trim() || snippet(row.content),
      postMediaUrl: firstPostMediaUrl(row.mediaIds, mediaById),
      postPublishedAt: row.publishedAt?.toISOString() ?? null,
      postAccountImageUrl: row.account!.profileImageUrl,
      since: since.toISOString(),
    });

    // X Recent Search is the scarcest API we call: batch every X post on
    // this page into ONE cached search per account instead of one per post.
    const xBatches = new Map<
      string,
      Promise<PlatformReadResult<Record<string, CommentFetchResult>>>
    >();
    const xAccountBatch = (account: NonNullable<PubRow["account"]>) => {
      let batch = xBatches.get(account.id);
      if (!batch) {
        batch = (async () => {
          const { accessToken, accessSecret } =
            await resolveAccountAccess(account);
          const rows = pubs.filter(
            (r) => r.account?.id === account.id && r.platformPostId,
          );
          const inputs = rows.map((r) =>
            fetchInputFor(r, accessToken, accessSecret),
          );
          const idsKey = createHash("sha1")
            .update(rows.map((r) => r.platformPostId).sort().join(","))
            .digest("hex")
            .slice(0, 16);
          return withPlatformReadCache({
            platform: account.platform,
            accountId: account.id,
            kind: "inbox_comments",
            suffix: `batch:${idsKey}:${since.toISOString()}`,
            fresh,
            fetch: () => fetchTwitterCommentsBatch(inputs),
          });
        })();
        xBatches.set(account.id, batch);
      }
      return batch;
    };

    await mapPool(
      pubs,
      fetchConcurrency,
      async (row) => {
      if (!row.platformPostId || !row.account) return;
      if (INBOX_UNSUPPORTED.has(row.account.platform)) {
        unsupported.add(row.account.platform);
        return;
      }
      const missing = missingInboxScopes(row.account.platform, row.account.scopes);
      try {
        let result: CommentFetchResult;
        try {
          let rateLimited = false;
          if (row.account.platform === "twitter_x") {
            const cached = await xAccountBatch(row.account);
            result =
              cached.data[row.publicationId] ??
              ({ comments: [], status: "ok" } satisfies CommentFetchResult);
            rateLimited = Boolean(cached.rateLimited);
          } else {
            const { accessToken, accessSecret } =
              await resolveAccountAccess(row.account);
            const cached = await withPlatformReadCache({
              platform: row.account.platform,
              accountId: row.account.id,
              kind: "inbox_comments",
              suffix: `${row.publicationId}:${since.toISOString()}`,
              fresh,
              fetch: () =>
                fetchPublicationComments(
                  fetchInputFor(row, accessToken, accessSecret),
                ),
            });
            result = cached.data;
            rateLimited = Boolean(cached.rateLimited);
          }
          if (rateLimited) {
            noteFetchNotice(notices, {
              platform: row.account.platform,
              message: "Showing cached comments - platform rate limit reached.",
            });
          }
        } catch (e) {
          if (e instanceof PlatformApiCooldownError) {
            noteFetchNotice(notices, {
              platform: row.account.platform,
              message:
                "Platform rate limit reached - wait a few minutes before refreshing.",
            });
            return;
          }
          throw e;
        }
        allComments.push(...result.comments);
        if (result.status === "ok" || result.comments.length > 0) {
          fetchOkAccounts.add(row.account.id);
        }
        const scopes = reconnectScopesFromFetch(result);
        if (scopes.length) {
          reconnect.set(row.account.id, {
            accountId: row.account.id,
            platform: row.account.platform,
            username: row.account.platformUsername,
            missingScopes: scopes,
          });
        }
        if (result.status === "unsupported") {
          unsupported.add(row.account.platform);
        }
        if (result.error) {
          recordPlatformMessage(
            fetchErrors,
            notices,
            {
              accountId: row.account.id,
              platform: row.account.platform,
              error: result.error,
            },
            result.status,
          );
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : "Comment fetch failed";
        noteFetchError(fetchErrors, {
          accountId: row.account.id,
          platform: row.account.platform,
          error: message,
        });
        if (missing.length) {
          reconnect.set(row.account.id, {
            accountId: row.account.id,
            platform: row.account.platform,
            username: row.account.platformUsername,
            missingScopes: missing,
          });
        }
      }
    },
      {
        shouldContinue: () => {
          if (budget.isExpired()) {
            budgetHit = true;
            return false;
          }
          return true;
        },
      },
    );

    const threads = filterThreadsByActivity(
      toInboxThreads(allComments),
      since,
      until,
    );
    hasMore = pubs.length >= limit;
    const lastPub = pubs[pubs.length - 1];
    nextBefore = hasMore ? lastPub?.publishedAt?.toISOString() ?? null : null;

    if (threads.length > 0 || !hasMore || budgetHit) break;
    cursorBefore = lastPub?.publishedAt ?? undefined;
    if (!cursorBefore) break;
  }

  if (budgetHit) {
    noteFetchNotice(notices, {
      platform: "all",
      message:
        "Partial results - request budget reached. Scroll or refresh for more.",
    });
  }

  const accountRows = await listActiveConnectedAccounts(ctx);
  for (const a of accountRows) {
    if (!isPlatformLive("inboxComments", a.platform)) continue;
    // Skip accounts that already worked this request (stale scopes column).
    if (fetchOkAccounts.has(a.id)) continue;
    const missing = missingInboxScopes(a.platform, a.scopes);
    if (missing.length && !reconnect.has(a.id)) {
      reconnect.set(a.id, {
        accountId: a.id,
        platform: a.platform,
        username: a.username,
        missingScopes: missing,
      });
    }
  }

  const filteredThreads = filterThreadsByActivity(
    toInboxThreads(allComments),
    since,
    until,
  );

  return {
    range,
    since: since.toISOString(),
    until: until.toISOString(),
    threads: filteredThreads,
    accountsNeedingReconnect: [...reconnect.values()],
    unsupported: [...unsupported],
    fetchErrors,
    notices,
    fetchedAt: new Date().toISOString(),
    sampled: hasMore,
    sampleLimit: limit,
    hasMore,
    nextBefore,
  };
}

export async function replyToInboxComment(input: {
  publicationId?: unknown;
  commentId?: unknown;
  text?: unknown;
  mediaId?: unknown;
}): Promise<{ ok: true; replyId?: string } | { ok: false; error: string }> {
  const ctx = await requireUser("reply_comments");
  if (typeof input.publicationId !== "string" || !input.publicationId) {
    return { ok: false, error: "publicationId required" };
  }
  if (typeof input.commentId !== "string" || !input.commentId) {
    return { ok: false, error: "commentId required" };
  }
  const text = typeof input.text === "string" ? input.text : "";
  const mediaId = typeof input.mediaId === "string" ? input.mediaId : undefined;
  if (!text.trim() && !mediaId) {
    return { ok: false, error: "text or mediaId required" };
  }

  const row = await loadCommentMutationPublication(ctx, input.publicationId);
  if (!row) {
    return { ok: false, error: "Publication not found." };
  }
  if (INBOX_UNSUPPORTED.has(row.platform) || row.platform === "linkedin") {
    return { ok: false, error: `Replies are not supported for ${row.platform} yet.` };
  }

  const account = {
    id: row.accountId,
    platform: row.platform,
    platformUserId: row.platformUserId ?? "",
    platformUsername: row.platformUsername,
    scopes: null,
    encryptedAccessToken: row.encryptedAccessToken,
    encryptedRefreshToken: row.encryptedRefreshToken,
  };

  try {
    const { accessToken, accessSecret } = await resolveAccountAccess(account);
    const bound = await assertCommentOnPublication(
      row,
      input.commentId,
      accessToken,
      accessSecret,
    );
    if (!bound.ok) return bound;
    let mediaUrl: string | null = null;
    let mediaMimeType: string | null = null;
    if (mediaId) {
      const resolved = await resolveInboxMedia(ctx.resourceUserId, mediaId);
      if ("error" in resolved) return { ok: false, error: resolved.error };
      mediaUrl = resolved.url;
      mediaMimeType = resolved.mimeType;
    }
    return await replyOnPlatform({
      platform: row.platform,
      commentId: input.commentId,
      text,
      mediaUrl,
      mediaMimeType,
      accessToken,
      accessSecret,
      accountId: row.accountId,
      platformUserId: row.platformUserId ?? "me",
      platformPostId: row.platformPostId ?? undefined,
      accountHandle: row.platformUsername,
    });
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Reply failed",
    };
  }
}

export async function likeInboxComment(input: {
  publicationId?: unknown;
  commentId?: unknown;
  unlike?: unknown;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await requireUser("reply_comments");
  if (typeof input.publicationId !== "string" || !input.publicationId) {
    return { ok: false, error: "publicationId required" };
  }
  if (typeof input.commentId !== "string" || !input.commentId) {
    return { ok: false, error: "commentId required" };
  }
  const unlike = input.unlike === true;

  const row = await loadCommentMutationPublication(ctx, input.publicationId);
  if (!row) {
    return { ok: false, error: "Publication not found." };
  }
  if (!inboxCommentLikeSupported(row.platform)) {
    return {
      ok: false,
      error: `${unlike ? "Unliking" : "Liking"} comments is not supported for ${row.platform} yet.`,
    };
  }

  const account = {
    id: row.accountId,
    platform: row.platform,
    platformUserId: row.platformUserId ?? "",
    platformUsername: row.platformUsername,
    scopes: null,
    encryptedAccessToken: row.encryptedAccessToken,
    encryptedRefreshToken: row.encryptedRefreshToken,
  };

  try {
    const { accessToken, accessSecret } = await resolveAccountAccess(account);
    const bound = await assertCommentOnPublication(
      row,
      input.commentId,
      accessToken,
      accessSecret,
    );
    if (!bound.ok) return bound;
    return await likeCommentOnPlatform({
      platform: row.platform,
      commentId: input.commentId,
      accessToken,
      accessSecret,
      platformUserId: row.platformUserId ?? "me",
      accountId: row.accountId,
      accountHandle: row.platformUsername,
      unlike,
    });
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : unlike ? "Unlike failed" : "Like failed",
    };
  }
}

export async function hideInboxComment(input: {
  publicationId?: unknown;
  commentId?: unknown;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await requireUser("reply_comments");
  if (typeof input.publicationId !== "string" || !input.publicationId) {
    return { ok: false, error: "publicationId required" };
  }
  if (typeof input.commentId !== "string" || !input.commentId) {
    return { ok: false, error: "commentId required" };
  }

  const row = await loadCommentMutationPublication(ctx, input.publicationId);
  if (!row) {
    return { ok: false, error: "Publication not found." };
  }
  if (!inboxCommentHideSupported(row.platform)) {
    return {
      ok: false,
      error: `Hiding comments is not supported for ${row.platform} yet.`,
    };
  }

  const account = {
    id: row.accountId,
    platform: row.platform,
    platformUserId: row.platformUserId ?? "",
    platformUsername: row.platformUsername,
    scopes: null,
    encryptedAccessToken: row.encryptedAccessToken,
    encryptedRefreshToken: row.encryptedRefreshToken,
  };

  try {
    const { accessToken, accessSecret } = await resolveAccountAccess(account);
    const bound = await assertCommentOnPublication(
      row,
      input.commentId,
      accessToken,
      accessSecret,
    );
    if (!bound.ok) return bound;
    return await hideCommentOnPlatform({
      platform: row.platform,
      commentId: input.commentId,
      accessToken,
    });
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Hide failed",
    };
  }
}

type DmAccountRow = {
  id: string;
  platform: string;
  platformUserId: string;
  platformUsername: string | null;
  profileImageUrl: string | null;
  scopes: string | null;
  platformMetadata: Record<string, unknown> | null;
  encryptedAccessToken: string;
  encryptedRefreshToken: string | null;
};

async function loadDmAccounts(
  ctx: { resourceUserId: string; workspaceId: string | null },
  accountId?: string,
): Promise<DmAccountRow[]> {
  const live = livePlatformIds("inboxDms");
  if (!live.length) return [];
  return db
    .select({
      id: connectedAccounts.id,
      platform: connectedAccounts.platform,
      platformUserId: connectedAccounts.platformUserId,
      platformUsername: connectedAccounts.platformUsername,
      profileImageUrl: connectedAccounts.profileImageUrl,
      scopes: connectedAccounts.scopes,
      platformMetadata: connectedAccounts.platformMetadata,
      encryptedAccessToken: connectedAccounts.encryptedAccessToken,
      encryptedRefreshToken: connectedAccounts.encryptedRefreshToken,
    })
    .from(connectedAccounts)
    .where(
      and(
        connectionScopeCondition(ctx),
        eq(connectedAccounts.isActive, true),
        inArray(connectedAccounts.platform, live),
        accountId ? eq(connectedAccounts.id, accountId) : undefined,
      ),
    );
}

const DM_CONCURRENCY = 1;
const DM_SAMPLE_LIMIT = 8;

export async function listInboxDms(input: {
  accountId?: unknown;
  range?: unknown;
  since?: unknown;
  until?: unknown;
  before?: unknown;
  limit?: unknown;
  fresh?: unknown;
}): Promise<InboxDmListResult> {
  const ctx = await requireUser();
  const timeZone = await getUserTimezone(ctx.resourceUserId);
  const { range, since, until } = parseDateWindow(input, timeZone);
  const fresh = input.fresh === true;
  const accountId =
    typeof input.accountId === "string" && input.accountId
      ? input.accountId
      : undefined;
  const beforeMs = parseBefore(input.before)?.getTime();
  const limit = parsePageLimit(input.limit, DM_SAMPLE_LIMIT);
  // When paging older DMs, we must constrain the platform fetchers by an
  // effective `until` derived from `before`. Otherwise each "older page"
  // re-fetches the same since..until set and the client-side slice quickly
  // runs out.
  const untilForFetch = beforeMs != null ? new Date(beforeMs) : until;

  const accounts = await loadDmAccounts(ctx, accountId);
  const dmAccounts = accountId ? accounts : accounts.slice(0, DM_SAMPLE_LIMIT);
  const reconnect = new Map<string, InboxReconnectHint>();
  const unsupported = new Set<string>();
  const fetchErrors: InboxDmListResult["fetchErrors"] = [];
  const notices: InboxDmListResult["notices"] = [];
  const threads: InboxDmThread[] = [];
  const budget = createLiveRequestBudget();
  let budgetHit = false;

  await mapPool(
    dmAccounts,
    DM_CONCURRENCY,
    async (row) => {
    if (!isInboxDmPlatform(row.platform)) {
      unsupported.add(row.platform);
      return;
    }
    const missing = missingDmScopes(row.platform, row.scopes);
    try {
      const { accessToken, accessSecret } = await resolveAccountAccess(row);
      let result;
      try {
        const cached = await withPlatformReadCache({
          platform: row.platform,
          accountId: row.id,
          kind: "inbox_dms",
          suffix: `${since.toISOString()}:${untilForFetch.toISOString()}`,
          fresh,
          fetch: () =>
            fetchAccountDms(
              {
                id: row.id,
                platform: row.platform,
                platformUserId: row.platformUserId,
                platformUsername: row.platformUsername,
                ownerUserId: ctx.resourceUserId,
                profileImageUrl: row.profileImageUrl,
                accessToken,
                accessSecret,
              },
              since,
              untilForFetch,
            ),
        });
        result = cached.data;
        if (cached.rateLimited) {
          noteFetchNotice(notices, {
            platform: row.platform,
            message: "Showing cached DMs - platform rate limit reached.",
          });
        }
      } catch (e) {
        if (e instanceof PlatformApiCooldownError) {
          noteFetchNotice(notices, {
            platform: row.platform,
            message:
              "Platform rate limit reached - wait a few minutes before refreshing.",
          });
          return;
        }
        throw e;
      }
      threads.push(...result.threads);
      const scopes = reconnectScopesFromFetch(result);
      if (scopes.length) {
        reconnect.set(row.id, {
          accountId: row.id,
          platform: row.platform,
          username: row.platformUsername,
          missingScopes: scopes,
        });
      }
      if (result.status === "unsupported") unsupported.add(row.platform);
      if (result.error) {
        recordPlatformMessage(
          fetchErrors,
          notices,
          {
            accountId: row.id,
            platform: row.platform,
            error: result.error,
          },
          result.status,
        );
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "DM fetch failed";
      noteFetchError(fetchErrors, {
        accountId: row.id,
        platform: row.platform,
        error: message,
      });
      if (missing.length) {
        reconnect.set(row.id, {
          accountId: row.id,
          platform: row.platform,
          username: row.platformUsername,
          missingScopes: missing,
        });
      }
    }
  },
    {
      shouldContinue: () => {
        if (budget.isExpired()) {
          budgetHit = true;
          return false;
        }
        return true;
      },
    },
  );

  if (budgetHit) {
    noteFetchNotice(notices, {
      platform: "all",
      message:
        "Partial results - request budget reached. Refresh for more conversations.",
    });
  }

  threads.sort((a, b) =>
    (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""),
  );
  const older =
    beforeMs == null
      ? threads
      : threads.filter((t) => {
          const tms = t.lastMessageAt ? Date.parse(t.lastMessageAt) : 0;
          return Number.isFinite(tms) && tms <= beforeMs;
        });
  const hasMore = older.length > limit;
  const page = older.slice(0, limit);
  const nextBefore = page[page.length - 1]?.lastMessageAt ?? null;
  return {
    range,
    since: since.toISOString(),
    until: until.toISOString(),
    threads: page,
    accountsNeedingReconnect: [...reconnect.values()],
    unsupported: [...unsupported],
    fetchErrors,
    notices,
    fetchedAt: new Date().toISOString(),
    sampled: hasMore,
    sampleLimit: limit,
    hasMore,
    nextBefore,
  };
}

async function loadDmAccount(
  ctx: { resourceUserId: string; workspaceId: string | null },
  accountId: string,
): Promise<DmAccountRow | null> {
  const rows = await loadDmAccounts(ctx, accountId);
  return rows[0] ?? null;
}

export async function getInboxDmThread(input: {
  accountId?: unknown;
  conversationId?: unknown;
  peerId?: unknown;
  fresh?: unknown;
}): Promise<InboxDmThreadResult | { error: string }> {
  const ctx = await requireUser();
  if (typeof input.accountId !== "string" || !input.accountId) {
    return { error: "accountId required" };
  }
  if (typeof input.conversationId !== "string" || !input.conversationId) {
    return { error: "conversationId required" };
  }
  const peerId = typeof input.peerId === "string" ? input.peerId : "";
  const fresh = input.fresh === true;

  const row = await loadDmAccount(ctx, input.accountId);
  if (!row) return { error: "Account not found" };
  if (!isInboxDmPlatform(row.platform)) {
    return { error: `DMs are not supported for ${row.platform}.` };
  }

  try {
    const { accessToken, accessSecret } = await resolveAccountAccess(row);
    const cached = await raceTimeout(
      withPlatformReadCache({
        platform: row.platform,
        accountId: row.id,
        kind: "inbox_dm_thread",
        suffix: input.conversationId,
        fresh,
        fetch: () =>
          fetchDmMessages(
            {
              id: row.id,
              platform: row.platform,
              platformUserId: row.platformUserId,
              platformUsername: row.platformUsername,
              ownerUserId: ctx.resourceUserId,
              profileImageUrl: row.profileImageUrl,
              accessToken,
              accessSecret,
            },
            input.conversationId as string,
            peerId,
          ),
      }),
      LIVE_RPC_BUDGET_MS,
      "inbox DM thread",
    );
    const result = cached.data;
    if (result.status !== "ok") {
      return { error: result.error ?? "Failed to load conversation" };
    }
    const fallback: InboxDmThread = {
      conversationId: input.conversationId,
      platform: row.platform,
      accountId: row.id,
      accountLabel: row.platformUsername,
      accountProfileImageUrl: row.profileImageUrl,
      peerId,
      peerName: "Conversation",
      peerHandle: null,
      lastMessageAt: result.messages.at(-1)?.createdAt ?? null,
      snippet: result.messages.at(-1)?.text ?? "",
      canReply: true,
    };
    const thread = result.thread
      ? mergeDmThreadIdentity(result.thread, fallback)
      : fallback;
    // Prefer a non-placeholder author on the latest inbound message when thread
    // identity is still weak (common when X/Bluesky omit participant expands).
    if (isWeakDmPeerName(thread.peerName)) {
      const inbound = [...result.messages].reverse().find((m) => !m.isOwn);
      if (inbound && !isWeakDmPeerName(inbound.authorName)) {
        thread.peerName = inbound.authorName;
        thread.peerHandle = inbound.authorHandle ?? thread.peerHandle;
        thread.peerAvatarUrl =
          inbound.authorAvatarUrl ?? thread.peerAvatarUrl ?? null;
      }
    }
    return {
      conversationId: input.conversationId,
      thread,
      messages: result.messages,
      fetchedAt: new Date().toISOString(),
    };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Failed to load conversation",
    };
  }
}

export async function replyToInboxDm(input: {
  accountId?: unknown;
  conversationId?: unknown;
  peerId?: unknown;
  text?: unknown;
  mediaId?: unknown;
}): Promise<{ ok: true; messageId?: string } | { ok: false; error: string }> {
  const ctx = await requireUser("reply_dms");
  if (typeof input.accountId !== "string" || !input.accountId) {
    return { ok: false, error: "accountId required" };
  }
  if (typeof input.conversationId !== "string" || !input.conversationId) {
    return { ok: false, error: "conversationId required" };
  }
  const text = typeof input.text === "string" ? input.text : "";
  const mediaId = typeof input.mediaId === "string" ? input.mediaId : undefined;
  if (!text.trim() && !mediaId) {
    return { ok: false, error: "text or mediaId required" };
  }
  const peerId = typeof input.peerId === "string" ? input.peerId : "";

  const row = await loadDmAccount(ctx, input.accountId);
  if (!row) return { ok: false, error: "Account not found." };
  if (!isInboxDmPlatform(row.platform)) {
    return { ok: false, error: `DMs are not supported for ${row.platform}.` };
  }

  try {
    const { accessToken, accessSecret } = await resolveAccountAccess(row);
    const bound = await verifyDmConversationOnAccount(
      {
        id: row.id,
        platform: row.platform,
        platformUserId: row.platformUserId,
        platformUsername: row.platformUsername,
        ownerUserId: ctx.resourceUserId,
        profileImageUrl: row.profileImageUrl,
        accessToken,
        accessSecret,
      },
      input.conversationId,
    );
    if (!bound.ok) return bound;
    const sendPeerId = peerId || bound.peerId;
    let mediaUrl: string | null = null;
    let mediaMimeType: string | null = null;
    if (mediaId) {
      const resolved = await resolveInboxMedia(ctx.resourceUserId, mediaId);
      if ("error" in resolved) return { ok: false, error: resolved.error };
      mediaUrl = resolved.url;
      mediaMimeType = resolved.mimeType;
    }
    return await replyToDmOnPlatform({
      platform: row.platform,
      conversationId: input.conversationId,
      peerId: sendPeerId,
      text,
      mediaUrl,
      mediaMimeType,
      accessToken,
      accessSecret,
      platformUserId: row.platformUserId,
      accountId: row.id,
      accountHandle: row.platformUsername,
    });
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "DM failed",
    };
  }
}

/** Connected accounts for inbox filter chips (comments or DMs). */
export async function listInboxAccounts(input: {
  mode?: unknown;
}): Promise<
  Array<{
    id: string;
    platform: string;
    username: string | null;
    profileImageUrl: string | null;
    missingScopes: string[];
  }>
> {
  const ws = await requireWorkspaceSession("view_inbox");
  if (!ws.ok) throw rpcHttpError(ws.error, ws.statusCode);

  const feature =
    input.mode === "dms" ? ("inboxDms" as const) : ("inboxComments" as const);
  const rows = await listActiveConnectedAccounts(ws.ctx);

  return rows
    .filter((r) => isPlatformLive(feature, r.platform))
    .map((r) => ({
      id: r.id,
      platform: r.platform,
      username: r.username,
      profileImageUrl: r.profileImageUrl,
      missingScopes:
        feature === "inboxDms"
          ? missingDmScopes(r.platform, r.scopes)
          : missingInboxScopes(r.platform, r.scopes),
    }));
}
