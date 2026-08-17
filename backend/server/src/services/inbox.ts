/**
 * Social inbox — live comments on Social0-published posts + reply.
 * No DB writes.
 */

import { and, desc, eq, gte, inArray, isNotNull, lte, notInArray } from "drizzle-orm";
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
import { fetchAccountDms, fetchDmMessages } from "../lib/inbox/fetch-dms.js";
import { replyToDmOnPlatform } from "../lib/inbox/reply-dm.js";
import { parseDateWindow } from "../lib/date-window.js";
import {
  INBOX_DM_PLATFORMS,
  INBOX_UNSUPPORTED,
  isInboxDmPlatform,
  missingDmScopes,
  missingInboxScopes,
  toInboxThreads,
  type InboxComment,
  type InboxDmListResult,
  type InboxDmThread,
  type InboxDmThreadResult,
  type InboxListResult,
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

type TokenAccount = {
  id: string;
  platform: string;
  encryptedAccessToken: string;
  encryptedRefreshToken: string | null;
};

async function resolveAccess(account: TokenAccount) {
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
  since?: unknown;
  until?: unknown;
}): Promise<InboxListResult> {
  const ctx = await requireUser();
  const { range, since, until } = parseDateWindow(input);
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
}): Promise<{ ok: true; replyId?: string } | { ok: false; error: string }> {
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

type DmAccountRow = {
  id: string;
  platform: string;
  platformUserId: string;
  platformUsername: string | null;
  scopes: string | null;
  encryptedAccessToken: string;
  encryptedRefreshToken: string | null;
};

async function loadDmAccounts(
  ctx: { resourceUserId: string; workspaceId: string | null },
  accountId?: string,
): Promise<DmAccountRow[]> {
  return db
    .select({
      id: connectedAccounts.id,
      platform: connectedAccounts.platform,
      platformUserId: connectedAccounts.platformUserId,
      platformUsername: connectedAccounts.platformUsername,
      scopes: connectedAccounts.scopes,
      encryptedAccessToken: connectedAccounts.encryptedAccessToken,
      encryptedRefreshToken: connectedAccounts.encryptedRefreshToken,
    })
    .from(connectedAccounts)
    .where(
      and(
        connectionScopeCondition(ctx),
        eq(connectedAccounts.isActive, true),
        inArray(connectedAccounts.platform, [...INBOX_DM_PLATFORMS]),
        accountId ? eq(connectedAccounts.id, accountId) : undefined,
      ),
    );
}

const DM_CONCURRENCY = 3;
const DM_SAMPLE_LIMIT = 80;

export async function listInboxDms(input: {
  accountId?: unknown;
  range?: unknown;
  since?: unknown;
  until?: unknown;
}): Promise<InboxDmListResult> {
  const ctx = await requireUser();
  const { range, since, until } = parseDateWindow(input);
  const accountId =
    typeof input.accountId === "string" && input.accountId
      ? input.accountId
      : undefined;

  const accounts = await loadDmAccounts(ctx, accountId);
  const reconnect = new Map<string, InboxReconnectHint>();
  const unsupported = new Set<string>();
  const threads: InboxDmThread[] = [];

  await mapPool(accounts, DM_CONCURRENCY, async (row) => {
    if (!isInboxDmPlatform(row.platform)) {
      unsupported.add(row.platform);
      return;
    }
    const missing = missingDmScopes(row.platform, row.scopes);
    if (missing.length) {
      reconnect.set(row.id, {
        accountId: row.id,
        platform: row.platform,
        username: row.platformUsername,
        missingScopes: missing,
      });
      return;
    }
    try {
      const { accessToken, accessSecret } = await resolveAccess(row);
      const result = await fetchAccountDms(
        {
          id: row.id,
          platform: row.platform,
          platformUserId: row.platformUserId,
          platformUsername: row.platformUsername,
          accessToken,
          accessSecret,
        },
        since,
        until,
      );
      threads.push(...result.threads);
      const scopes = result.missingScopes?.length ? result.missingScopes : missing;
      if (scopes.length) {
        reconnect.set(row.id, {
          accountId: row.id,
          platform: row.platform,
          username: row.platformUsername,
          missingScopes: scopes,
        });
      }
      if (result.status === "unsupported") unsupported.add(row.platform);
    } catch {
      if (missing.length) {
        reconnect.set(row.id, {
          accountId: row.id,
          platform: row.platform,
          username: row.platformUsername,
          missingScopes: missing,
        });
      }
    }
  });

  threads.sort((a, b) =>
    (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""),
  );
  const sampled = threads.length > DM_SAMPLE_LIMIT;
  return {
    range,
    since: since.toISOString(),
    until: until.toISOString(),
    threads: threads.slice(0, DM_SAMPLE_LIMIT),
    accountsNeedingReconnect: [...reconnect.values()],
    unsupported: [...unsupported],
    fetchedAt: new Date().toISOString(),
    sampled,
    sampleLimit: DM_SAMPLE_LIMIT,
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
}): Promise<InboxDmThreadResult> {
  const ctx = await requireUser();
  if (typeof input.accountId !== "string" || !input.accountId) {
    throw new Error("accountId required");
  }
  if (typeof input.conversationId !== "string" || !input.conversationId) {
    throw new Error("conversationId required");
  }
  const peerId = typeof input.peerId === "string" ? input.peerId : "";

  const row = await loadDmAccount(ctx, input.accountId);
  if (!row) throw new Error("Account not found");
  if (!isInboxDmPlatform(row.platform)) {
    throw new Error(`DMs are not supported for ${row.platform}.`);
  }

  const { accessToken, accessSecret } = await resolveAccess(row);
  const result = await fetchDmMessages(
    {
      id: row.id,
      platform: row.platform,
      platformUserId: row.platformUserId,
      platformUsername: row.platformUsername,
      accessToken,
      accessSecret,
    },
    input.conversationId,
    peerId,
  );
  if (result.status !== "ok") {
    throw new Error(result.error ?? "Failed to load conversation");
  }
  const fallback: InboxDmThread = {
    conversationId: input.conversationId,
    platform: row.platform,
    accountId: row.id,
    accountLabel: row.platformUsername,
    peerId,
    peerName: "Conversation",
    peerHandle: null,
    lastMessageAt: result.messages.at(-1)?.createdAt ?? null,
    snippet: result.messages.at(-1)?.text ?? "",
    canReply: true,
  };
  return {
    conversationId: input.conversationId,
    thread: result.thread ?? fallback,
    messages: result.messages,
    fetchedAt: new Date().toISOString(),
  };
}

export async function replyToInboxDm(input: {
  accountId?: unknown;
  conversationId?: unknown;
  peerId?: unknown;
  text?: unknown;
}): Promise<{ ok: true; messageId?: string } | { ok: false; error: string }> {
  const ctx = await requireUser();
  if (typeof input.accountId !== "string" || !input.accountId) {
    return { ok: false, error: "accountId required" };
  }
  if (typeof input.conversationId !== "string" || !input.conversationId) {
    return { ok: false, error: "conversationId required" };
  }
  if (typeof input.text !== "string") {
    return { ok: false, error: "text required" };
  }
  const peerId = typeof input.peerId === "string" ? input.peerId : "";

  const row = await loadDmAccount(ctx, input.accountId);
  if (!row) return { ok: false, error: "Account not found." };
  if (!isInboxDmPlatform(row.platform)) {
    return { ok: false, error: `DMs are not supported for ${row.platform}.` };
  }

  try {
    const { accessToken, accessSecret } = await resolveAccess(row);
    return await replyToDmOnPlatform({
      platform: row.platform,
      conversationId: input.conversationId,
      peerId,
      text: input.text,
      accessToken,
      accessSecret,
      platformUserId: row.platformUserId,
      accountHandle: row.platformUsername,
    });
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "DM failed",
    };
  }
}
