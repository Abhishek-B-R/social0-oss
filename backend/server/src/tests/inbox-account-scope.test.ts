/**
 * Inbox comment reads/mutations and live analytics act as a publication's
 * connected account, so the account itself must still be in the caller's
 * scope, not just the post.
 *
 * Moving an account to another workspace or owner
 * (`moveConnectedAccountToWorkspace`) rewrites only `connected_accounts`; the
 * account's old posts and publications stay in the source workspace. Scoping
 * by the post alone let a member of the old workspace keep reading comments
 * and metrics, and reply / like / hide, as an account that now lives in the
 * owner's private pool or another tenant. The queries must also apply
 * `connectionScopeCondition` (the rule `loadDmAccounts` already used), and a
 * comment mutation must refuse an account the plan cap switched off, as
 * publish does.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

const {
  mockDb,
  mockVerifyComment,
  mockReplyOnPlatform,
  mockLikeOnPlatform,
  mockHideOnPlatform,
  mockResolveAccountAccess,
} = vi.hoisted(() => ({
  mockDb: { select: vi.fn(), query: { posts: { findFirst: vi.fn() } } },
  mockVerifyComment: vi.fn(),
  mockReplyOnPlatform: vi.fn(),
  mockLikeOnPlatform: vi.fn(),
  mockHideOnPlatform: vi.fn(),
  mockResolveAccountAccess: vi.fn(),
}));

vi.mock("../db/index.js", () => ({ db: mockDb }));
vi.mock("../lib/workspace/session.js", () => ({
  requireWorkspaceSession: vi.fn(),
}));
vi.mock("../lib/resolve-scheduled-at.js", () => ({
  getUserTimezone: vi.fn(async () => "UTC"),
}));
// Never reached (the queries under test stop the core first); stubbed so the
// test does not load the platform publish modules behind it.
vi.mock("../lib/analytics/fetch-platform-metrics.js", () => ({
  fetchPlatformPublicationMetrics: vi.fn(),
}));
vi.mock("../lib/account-access.js", () => ({
  resolveAccountAccess: mockResolveAccountAccess,
}));
vi.mock("../lib/inbox/verify-comment.js", () => ({
  verifyCommentOnPublication: mockVerifyComment,
}));
vi.mock("../lib/inbox/reply-comment.js", () => ({
  replyOnPlatform: mockReplyOnPlatform,
}));
vi.mock("../lib/inbox/reply-dm.js", () => ({
  replyToDmOnPlatform: vi.fn(),
}));
vi.mock("../lib/inbox/like-comment.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/inbox/like-comment.js")>()),
  likeCommentOnPlatform: mockLikeOnPlatform,
}));
vi.mock("../lib/inbox/hide-comment.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/inbox/hide-comment.js")>()),
  hideCommentOnPlatform: mockHideOnPlatform,
}));

const {
  hideInboxCommentForScope,
  likeInboxCommentForScope,
  listInboxCommentsForScope,
  replyToInboxCommentForScope,
  INBOX_ACCOUNT_OVER_PLAN_LIMIT_ERROR,
} = await import("../services/inbox.js");
const { analyticsOverviewForScope, postAnalyticsForScope } = await import(
  "../services/analytics.js"
);

type Captured = { where?: SQL };

/** Sentinel that stops a list/analytics core right after its first query. */
class StopAfterQuery extends Error {}

/**
 * Drizzle-style builder that records `.where(...)`; awaiting yields `rows`,
 * or rejects with `StopAfterQuery` when `rows` is null.
 */
function selectChain(rows: unknown[] | null, captured: Captured) {
  const chain: Record<string, unknown> = {};
  const self: Record<string, unknown> = new Proxy(chain, {
    get(_t, prop) {
      if (prop === "then") {
        return (
          resolve: (v: unknown) => void,
          reject: (e: unknown) => void,
        ) => (rows ? resolve(rows) : reject(new StopAfterQuery()));
      }
      return (...args: unknown[]) => {
        if (prop === "where") captured.where = args[0] as SQL;
        return self;
      };
    },
  });
  return self;
}

const dialect = new PgDialect();
const PUB = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
const POST = "11111111-2222-4333-8444-555555555555";
/** Team owner's context inside shared workspace W1. */
const W1 = { resourceUserId: "owner-1", workspaceId: "ws-1" };
const MAIN = { resourceUserId: "owner-1", workspaceId: null };

function publicationRow(isActive: boolean | null = true) {
  return {
    publicationId: PUB,
    platformPostId: "at://did:plc:me/app.bsky.feed.post/abc",
    platformPostUrl: null,
    postId: "post-1",
    content: "hello world",
    publishedAt: new Date("2026-03-01T00:00:00Z"),
    accountId: "acc-1",
    platform: "bluesky",
    platformUserId: "did:plc:me",
    platformUsername: "me.bsky.social",
    encryptedAccessToken: "enc",
    encryptedRefreshToken: null,
    isActive,
  };
}

/** Asserts the WHERE scopes connected_accounts to `ctx`, not just posts. */
function expectAccountScoped(
  where: SQL | undefined,
  ctx: { resourceUserId: string; workspaceId: string | null },
) {
  expect(where).toBeDefined();
  const { sql: text, params } = dialect.sqlToQuery(where!);
  expect(text).toContain('"connected_accounts"."user_id" = $');
  if (ctx.workspaceId) {
    expect(text).toContain('"connected_accounts"."workspace_id" = $');
    expect(params).toContain(ctx.workspaceId);
  } else {
    expect(text).toContain('"connected_accounts"."workspace_id" is null');
  }
  expect(params).toContain(ctx.resourceUserId);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockResolveAccountAccess.mockResolvedValue({
    accessToken: "token",
    accessSecret: null,
  });
  mockVerifyComment.mockResolvedValue({ ok: true });
});

describe("comment mutations require the account to be in scope", () => {
  const mutations = [
    [
      "reply",
      () =>
        replyToInboxCommentForScope(W1, {
          publicationId: PUB,
          commentId: "c1",
          text: "thanks",
        }),
      mockReplyOnPlatform,
    ],
    [
      "like",
      () => likeInboxCommentForScope(W1, { publicationId: PUB, commentId: "c1" }),
      mockLikeOnPlatform,
    ],
    [
      "hide",
      () => hideInboxCommentForScope(W1, { publicationId: PUB, commentId: "c1" }),
      mockHideOnPlatform,
    ],
  ] as const;

  for (const [name, run, platformCall] of mutations) {
    it(`${name}: account moved out of the workspace is not found`, async () => {
      const captured: Captured = {};
      // The scoped query filters the moved account out.
      mockDb.select.mockReturnValueOnce(selectChain([], captured));

      expect(await run()).toEqual({ ok: false, error: "Publication not found." });
      expectAccountScoped(captured.where, W1);
      expect(mockResolveAccountAccess).not.toHaveBeenCalled();
      expect(mockVerifyComment).not.toHaveBeenCalled();
      expect(platformCall).not.toHaveBeenCalled();
    });

    it(`${name}: account switched off by the plan cap is refused`, async () => {
      mockDb.select.mockReturnValueOnce(selectChain([publicationRow(false)], {}));

      expect(await run()).toEqual({
        ok: false,
        error: INBOX_ACCOUNT_OVER_PLAN_LIMIT_ERROR,
      });
      expect(mockResolveAccountAccess).not.toHaveBeenCalled();
      expect(platformCall).not.toHaveBeenCalled();
    });
  }

  it("a null isActive still counts as active", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([publicationRow(null)], {}));
    mockReplyOnPlatform.mockResolvedValue({ ok: true, replyId: "r1" });

    const res = await replyToInboxCommentForScope(MAIN, {
      publicationId: PUB,
      commentId: "c1",
      text: "thanks",
    });

    expect(res).not.toEqual({
      ok: false,
      error: INBOX_ACCOUNT_OVER_PLAN_LIMIT_ERROR,
    });
    expect(res).not.toEqual({ ok: false, error: "Publication not found." });
    expect(mockResolveAccountAccess).toHaveBeenCalledTimes(1);
  });
});

describe("live reads require the account to be in scope", () => {
  it("inbox comment list scopes connected_accounts", async () => {
    const captured: Captured = {};
    mockDb.select.mockReturnValueOnce(selectChain(null, captured));

    await expect(listInboxCommentsForScope(W1, {})).rejects.toBeInstanceOf(
      StopAfterQuery,
    );
    expectAccountScoped(captured.where, W1);
  });

  it("analytics overview scopes connected_accounts", async () => {
    const captured: Captured = {};
    mockDb.select.mockReturnValueOnce(selectChain(null, captured));

    await expect(analyticsOverviewForScope(MAIN, {})).rejects.toBeInstanceOf(
      StopAfterQuery,
    );
    expectAccountScoped(captured.where, MAIN);
  });

  it("post analytics scopes connected_accounts", async () => {
    const captured: Captured = {};
    mockDb.select.mockReturnValueOnce(selectChain(null, captured));

    await expect(
      postAnalyticsForScope(W1, { postId: POST }),
    ).rejects.toBeInstanceOf(StopAfterQuery);
    expectAccountScoped(captured.where, W1);
  });
});
