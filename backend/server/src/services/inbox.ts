/**
 * Social inbox — live comments on Social0-published posts + reply.
 * No DB writes.
 */

import { and, desc, eq, gte, isNotNull, lte, notInArray } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  connectedAccounts,
  postPublications,
  posts,
} from "../db/schema.js";
import { decryptToken } from "@social0/shared";
import {
  resolveWorkspaceContext,
  postScopeCondition,
  connectionScopeCondition,
} from "../lib/workspace/context.js";
import { getValidToken, REFRESHABLE_PLATFORMS } from "../lib/token-refresh.js";
import { PLATFORMS, type Platform } from "../lib/platforms.js";
import { fetchPublicationComments } from "../lib/inbox/fetch-comments.js";
import { replyOnPlatform } from "../lib/inbox/reply-comment.js";
import {
  INBOX_UNSUPPORTED,
  inboxRangeToMs,
  isInboxRange,
  missingInboxScopes,
  toInboxThreads,
  type InboxComment,
  type InboxListResult,
  type InboxRange,
  type InboxReconnectHint,
} from "../lib/inbox/types.js";

const INBOX_SKIP_PLATFORMS = ["tiktok", "pinterest"] as const;

function parsePlatform(value: unknown): Platform | undefined {
  if (typeof value !== "string" || !value) return undefined;
  return PLATFORMS.find((p) => p.id === value)?.id;
}

const SAMPLE_LIMIT = 24;
const CONCURRENCY = 4;

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!);
    }
  }
  const n = Math.min(concurrency, Math.max(items.length, 1));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}

type PubRow = {
  publicationId: string;
  postId: string;
  platformPostId: string | null;
  platformPostUrl: string | null;
  content: string | null;
  account: {
    id: string;
    platform: string;
    platformUserId: string;
    platformUsername: string | null;
    scopes: string | null;
    encryptedAccessToken: string;
    encryptedRefreshToken: string | null;
  } | null;
};

async function requireUser() {
  const { auth } = await import("../lib/auth.js");
  const { headers } = await import("../lib/http/request-cookies.js");
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) throw new Error("Unauthorized");
  return resolveWorkspaceContext(session.user.id);
}

async function loadPubs(opts: {
  resourceUserId: string;
  workspaceId: string | null;
  since: Date;
  until: Date;
  accountId?: string;
  platform?: Platform;
}): Promise<PubRow[]> {
  const postFilter = postScopeCondition({
    resourceUserId: opts.resourceUserId,
    workspaceId: opts.workspaceId,
  });
  const rows = await db
    .select({
      publicationId: postPublications.id,
      postId: posts.id,
      platformPostId: postPublications.platformPostId,
      platformPostUrl: postPublications.platformPostUrl,
      content: posts.finalContent,
      accountId: connectedAccounts.id,
      platform: connectedAccounts.platform,
      platformUserId: connectedAccounts.platformUserId,
      platformUsername: connectedAccounts.platformUsername,
      scopes: connectedAccounts.scopes,
      encryptedAccessToken: connectedAccounts.encryptedAccessToken,
      encryptedRefreshToken: connectedAccounts.encryptedRefreshToken,
    })
    .from(postPublications)
    .innerJoin(posts, eq(postPublications.postId, posts.id))
    .leftJoin(
      connectedAccounts,
      eq(postPublications.connectedAccountId, connectedAccounts.id),
    )
    .where(
      and(
        postFilter,
        eq(postPublications.status, "published"),
        isNotNull(postPublications.platformPostId),
        isNotNull(postPublications.publishedAt),
        gte(postPublications.publishedAt, opts.since),
        lte(postPublications.publishedAt, opts.until),
        opts.accountId
          ? eq(postPublications.connectedAccountId, opts.accountId)
          : undefined,
        opts.platform
          ? eq(connectedAccounts.platform, opts.platform)
          : notInArray(connectedAccounts.platform, [
              ...INBOX_SKIP_PLATFORMS,
            ]),
      ),
    )
    .orderBy(desc(postPublications.publishedAt))
    .limit(SAMPLE_LIMIT);

  return rows.map((r) => ({
    publicationId: r.publicationId,
    postId: r.postId,
    platformPostId: r.platformPostId,
    platformPostUrl: r.platformPostUrl,
    content: r.content,
    account: r.accountId
      ? {
          id: r.accountId,
          platform: r.platform!,
          platformUserId: r.platformUserId!,
          platformUsername: r.platformUsername,
          scopes: r.scopes,
          encryptedAccessToken: r.encryptedAccessToken!,
          encryptedRefreshToken: r.encryptedRefreshToken,
        }
      : null,
  }));
}

async function resolveAccess(account: NonNullable<PubRow["account"]>) {
  let accessToken: string;
  if (REFRESHABLE_PLATFORMS.has(account.platform)) {
    accessToken = await getValidToken(account.id, account.platform);
  } else {
    accessToken = decryptToken(account.encryptedAccessToken, account.id);
  }
  let accessSecret: string | null = null;
  if (
    (account.platform === "twitter_x" || account.platform === "bluesky") &&
    account.encryptedRefreshToken
  ) {
    accessSecret = decryptToken(account.encryptedRefreshToken, account.id);
  }
  return { accessToken, accessSecret };
}

function snippet(content: string | null): string {
  return content?.replace(/\s+/g, " ").trim().slice(0, 80) || "(No caption)";
}

export async function listInboxComments(input: {
  accountId?: unknown;
  platform?: unknown;
  range?: unknown;
}): Promise<InboxListResult> {
  const ctx = await requireUser();
  const range: InboxRange = isInboxRange(input.range) ? input.range : "7d";
  const until = new Date();
  const since = new Date(until.getTime() - inboxRangeToMs(range));
  const accountId =
    typeof input.accountId === "string" && input.accountId
      ? input.accountId
      : undefined;
  const platform = parsePlatform(input.platform);

  const pubs = await loadPubs({
    resourceUserId: ctx.resourceUserId,
    workspaceId: ctx.workspaceId,
    since,
    until,
    accountId,
    platform,
  });

  const reconnect = new Map<string, InboxReconnectHint>();
  const unsupported = new Set<string>();
  const allComments: InboxComment[] = [];

  await mapPool(pubs, CONCURRENCY, async (row) => {
    if (!row.platformPostId || !row.account) return;
    if (INBOX_UNSUPPORTED.has(row.account.platform)) {
      unsupported.add(row.account.platform);
      return;
    }
    const missing = missingInboxScopes(row.account.platform, row.account.scopes);
    try {
      const { accessToken, accessSecret } = await resolveAccess(row.account);
      const result = await fetchPublicationComments({
        platform: row.account.platform,
        platformPostId: row.platformPostId,
        platformPostUrl: row.platformPostUrl,
        platformUserId: row.account.platformUserId,
        accessToken,
        accessSecret,
        accountId: row.account.id,
        accountLabel: row.account.platformUsername,
        postId: row.postId,
        publicationId: row.publicationId,
        postSnippet: snippet(row.content),
      });
      allComments.push(...result.comments);
      const scopes = result.missingScopes?.length
        ? result.missingScopes
        : missing;
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
    } catch (e) {
      if (missing.length) {
        reconnect.set(row.account.id, {
          accountId: row.account.id,
          platform: row.account.platform,
          username: row.account.platformUsername,
          missingScopes: missing,
        });
      }
      void e;
    }
  });

  // Also flag connected accounts that never appeared in this sample.
  for (const row of pubs) {
    if (!row.account) continue;
    const missing = missingInboxScopes(row.account.platform, row.account.scopes);
    if (missing.length && !reconnect.has(row.account.id)) {
      reconnect.set(row.account.id, {
        accountId: row.account.id,
        platform: row.account.platform,
        username: row.account.platformUsername,
        missingScopes: missing,
      });
    }
  }

  const accountRows = await db
    .select({
      id: connectedAccounts.id,
      platform: connectedAccounts.platform,
      username: connectedAccounts.platformUsername,
      scopes: connectedAccounts.scopes,
    })
    .from(connectedAccounts)
    .where(
      and(connectionScopeCondition(ctx), eq(connectedAccounts.isActive, true)),
    );
  for (const a of accountRows) {
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

  return {
    range,
    since: since.toISOString(),
    until: until.toISOString(),
    threads: toInboxThreads(allComments),
    accountsNeedingReconnect: [...reconnect.values()],
    unsupported: [...unsupported],
    fetchedAt: new Date().toISOString(),
    sampled: pubs.length >= SAMPLE_LIMIT,
    sampleLimit: SAMPLE_LIMIT,
  };
}

export async function replyToInboxComment(input: {
  publicationId?: unknown;
  commentId?: unknown;
  text?: unknown;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await requireUser();
  if (typeof input.publicationId !== "string" || !input.publicationId) {
    return { ok: false, error: "publicationId required" };
  }
  if (typeof input.commentId !== "string" || !input.commentId) {
    return { ok: false, error: "commentId required" };
  }
  if (typeof input.text !== "string") {
    return { ok: false, error: "text required" };
  }

  const postFilter = postScopeCondition({
    resourceUserId: ctx.resourceUserId,
    workspaceId: ctx.workspaceId,
  });
  const rows = await db
    .select({
      publicationId: postPublications.id,
      platformPostId: postPublications.platformPostId,
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
    .where(and(postFilter, eq(postPublications.id, input.publicationId)))
    .limit(1);

  const row = rows[0];
  if (!row?.accountId || !row.platform) {
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
    encryptedAccessToken: row.encryptedAccessToken!,
    encryptedRefreshToken: row.encryptedRefreshToken,
  };

  try {
    const { accessToken, accessSecret } = await resolveAccess(account);
    return await replyOnPlatform({
      platform: row.platform,
      commentId: input.commentId,
      text: input.text,
      accessToken,
      accessSecret,
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
