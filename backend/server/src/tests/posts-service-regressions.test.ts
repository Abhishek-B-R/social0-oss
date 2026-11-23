/**
 * services/posts.ts write paths: createPost / postAgain / deletePost /
 * updatePost.
 *
 * - An enqueue error after the post is committed must not read as "nothing
 *   happened": the user resubmits and the platforms the first fan-out reached
 *   get the post twice.
 * - Accounts switched off by the plan cap, and media ids hidden in metadata
 *   that are not the user's uploads, are refused before anything is written.
 * - postAgain writes its post and publications in one transaction.
 * - deletePost does not delete a post that is publishing right now.
 * - deletePost and postAgain also refuse a `partial` post while a
 *   per-network Retry is still uploading to one of its accounts.
 * - updatePost does not refund or report failure once its edit committed.
 * - Publish now always enqueues: no client flag leaves a due post for an
 *   inline publish the cron would race.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

const h = vi.hoisted(() => {
  class PublishNotDispatchedError extends Error {
    readonly postStatus: string | null;
    constructor(cause: unknown, postStatus: string | null) {
      super(cause instanceof Error ? cause.message : "Could not queue this post");
      this.postStatus = postStatus;
    }
  }

  /** A drizzle-ish builder: every method chains, awaiting yields `result`. */
  function chain(result: unknown | (() => unknown)): unknown {
    const proxy: unknown = new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === "then") {
            return (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
              Promise.resolve()
                .then(() => (typeof result === "function" ? (result as () => unknown)() : result))
                .then(res, rej);
          }
          return () => proxy;
        },
      },
    );
    return proxy;
  }

  return {
    PublishNotDispatchedError,
    chain,
    mockDb: {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      transaction: vi.fn(),
    },
    tx: {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    mockEnqueue: vi.fn(),
    mockReserve: vi.fn(),
    mockRelease: vi.fn(),
    mockDeletedWebhook: vi.fn(),
  };
});

// posts.ts imports through the `@/` tsconfig alias, which vitest does not
// resolve (the build rewrites it with tsc-alias). Mock those ids as-is.
vi.mock("@/db", () => ({ db: h.mockDb }));
vi.mock("../db/index.js", () => ({ db: h.mockDb }));
vi.mock("@/db/schema", () => import("../db/schema.js"));
vi.mock("@/lib/coerce-date.js", () => import("../lib/coerce-date.js"));
vi.mock("@/lib/stuck-publishing", () => import("../lib/stuck-publishing.js"));
vi.mock("@/lib/workspace/session", () => ({
  requireWorkspaceSession: vi.fn(async () => ({
    ok: true,
    ctx: {
      resourceUserId: "user-1",
      actorUserId: "user-1",
      workspaceId: null,
      permissions: new Set(["create_posts", "edit_posts", "delete_posts"]),
    },
  })),
}));
vi.mock("@/lib/workspace/context", () => ({
  connectionScopeCondition: () => undefined,
  postScopeCondition: () => undefined,
}));
vi.mock("@/lib/queue-slot-validation", () => ({
  userOwnsQueueSlot: vi.fn(async () => true),
}));
vi.mock("@/lib/posts-list/posts-list-data", () => ({
  getPostForEdit: vi.fn(),
  getPostMedia: vi.fn(),
  getQueuedSlotForPost: vi.fn(),
}));
vi.mock("@/lib/validation", () => import("@social0/shared/lib/validation"));
vi.mock("@/services/settings", () => ({ getUserSettingsSnapshot: vi.fn() }));
vi.mock("@/lib/bulk-auto-features-metadata", () => ({
  applyBulkAutoFeaturesToScheduledMetadata: vi.fn(),
}));
vi.mock("@/lib/post-metadata-sanitize", () => import("../lib/post-metadata-sanitize.js"));
// The real checks: these are what the tests are about.
vi.mock("@/lib/post-account-refs", () => import("../lib/post-account-refs.js"));
vi.mock("@/lib/post-media-refs", () => import("../lib/post-media-refs.js"));
vi.mock("@/lib/post-source", () => ({
  carryPostSource: vi.fn((m: unknown) => m),
  withPostSource: vi.fn((m: unknown) => m),
}));
vi.mock("@/lib/plan-limits", () => ({
  reserveFreePost: h.mockReserve,
  releaseFreePost: h.mockRelease,
}));
vi.mock("@/lib/post-lifecycle-webhooks", () => ({
  emitPostDeletedWebhook: h.mockDeletedWebhook,
  emitPostScheduledWebhook: vi.fn(),
}));
vi.mock("../services/enqueue.js", () => ({
  createPublishTrackingId: () => "track-1",
  enqueuePublishPostStandalone: h.mockEnqueue,
}));
vi.mock("../services/publish-enqueue.js", () => ({
  PublishNotDispatchedError: h.PublishNotDispatchedError,
}));

import {
  createPost,
  deletePost,
  deletePosts,
  duplicatePosts,
  POSTS_BATCH_MAX,
  PARTIAL_FAN_OUT_WARNING,
  postAgain,
  postDeliveryInFlightSql,
  PUBLISH_DELAYED_WARNING,
  updatePost,
} from "../services/posts.js";
import { SELECTED_ACCOUNT_OVER_PLAN_LIMIT_ERROR } from "../lib/post-account-refs.js";

const ACC_X = "11111111-1111-4111-8111-111111111111";
const ACC_LI = "22222222-2222-4222-8222-222222222222";
const MEDIA_MINE = "33333333-3333-4333-8333-333333333333";
const MEDIA_FOREIGN = "44444444-4444-4444-8444-444444444444";
const POST_ID = "55555555-5555-4555-8555-555555555555";
const NEW_POST_ID = "66666666-6666-4666-8666-666666666666";

const reservation = { allowed: true, consumed: true };

const dialect = new PgDialect();
const render = (q: SQL) => dialect.sqlToQuery(q).sql;

/** `h.chain`, but records what `.where(...)` was called with. */
function whereRecordingChain(result: unknown, wheres: unknown[]): unknown {
  const proxy: unknown = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === "then") {
          return (res: (v: unknown) => unknown) => Promise.resolve(result).then(res);
        }
        return (...args: unknown[]) => {
          if (prop === "where") wheres.push(args[0]);
          return proxy;
        };
      },
    },
  );
  return proxy;
}

function activeAccounts(...ids: string[]) {
  return h.chain(ids.map((id) => ({ id, isActive: true })));
}

/** createPost's transaction: insert post → [{id}], insert publications. */
function wireCreateTransaction(postId = NEW_POST_ID) {
  h.tx.insert.mockImplementation(() => h.chain([{ id: postId }]));
  h.mockDb.transaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
    cb(h.tx),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // clearAllMocks keeps queued `mockReturnValueOnce` values: a test that
  // returns early would hand its leftovers to the next one.
  for (const fn of [...Object.values(h.mockDb), ...Object.values(h.tx), h.mockEnqueue]) {
    fn.mockReset();
  }
  h.mockReserve.mockResolvedValue(reservation);
  h.mockRelease.mockResolvedValue(undefined);
});

describe("createPost publish now: enqueue fails after the post is committed", () => {
  beforeEach(() => {
    h.mockDb.select.mockReturnValueOnce(activeAccounts(ACC_X, ACC_LI));
    wireCreateTransaction();
  });

  const publishNow = () => createPost("hello", [ACC_X, ACC_LI], "now", null);

  it("partial fan-out (X started, LinkedIn enqueue 5xx) is tracked, not reported as failed", async () => {
    h.mockEnqueue.mockRejectedValue(new Error("CF enqueue failed: 502"));

    const res = await publishNow();

    expect(res).toEqual({
      success: true,
      postId: NEW_POST_ID,
      queued: true,
      trackingId: "track-1",
      streamUrl: "/api/jobs/track-1/stream",
      warning: PARTIAL_FAN_OUT_WARNING,
    });
    // The charge stands: the post exists and is publishing.
    expect(h.mockRelease).not.toHaveBeenCalled();
  });

  it("a dispatch that never touched the post is left to the cron, still success", async () => {
    h.mockEnqueue.mockRejectedValue(
      new h.PublishNotDispatchedError(new Error("not configured"), "unchanged"),
    );

    const res = await publishNow();

    expect(res).toEqual({
      success: true,
      postId: NEW_POST_ID,
      queued: true,
      trackingId: undefined,
      streamUrl: undefined,
      warning: PUBLISH_DELAYED_WARNING,
    });
  });

  it("nothing dispatched and the post failed: failure that names the saved post", async () => {
    h.mockEnqueue.mockRejectedValue(
      new h.PublishNotDispatchedError(new Error("publish worker unreachable"), "failed"),
    );

    const res = await publishNow();

    expect(res).toEqual({
      success: false,
      error: "publish worker unreachable",
      postId: NEW_POST_ID,
    });
    expect(h.mockRelease).not.toHaveBeenCalled();
  });
});

describe("createPost publish now always enqueues", () => {
  // The post is committed as a due `scheduled` row. Skipping the enqueue and
  // leaving the client to publish inline let the cron claim it as well, and
  // publish it even when that inline call was refused.
  it("a TikTok photo post with auto music off (old client flag) still goes to the queue", async () => {
    h.mockDb.select.mockReturnValueOnce(activeAccounts(ACC_X));
    wireCreateTransaction();
    h.mockEnqueue.mockResolvedValue({
      trackingId: "track-1",
      streamUrl: "/api/jobs/track-1/stream",
    });

    const res = await createPost("hi", [ACC_X], "now", null, [], {
      contentType: "image",
      tiktokAutoAddMusic: false,
      __skipAutoPublish: true,
    });

    expect(h.mockEnqueue).toHaveBeenCalledTimes(1);
    expect(h.mockEnqueue).toHaveBeenCalledWith(
      { postId: NEW_POST_ID, userId: "user-1" },
      { trackingId: "track-1" },
    );
    expect(res).toEqual({
      success: true,
      postId: NEW_POST_ID,
      queued: true,
      trackingId: "track-1",
      streamUrl: "/api/jobs/track-1/stream",
    });
  });
});

describe("createPost refuses what the publish engine must never see", () => {
  it("an account the plan cap switched off", async () => {
    h.mockDb.select.mockReturnValueOnce(
      h.chain([
        { id: ACC_X, isActive: true },
        { id: ACC_LI, isActive: false },
      ]),
    );

    const res = await createPost("hi", [ACC_X, ACC_LI], "now", null);

    expect(res).toEqual({ success: false, error: SELECTED_ACCOUNT_OVER_PLAN_LIMIT_ERROR });
    expect(h.mockReserve).not.toHaveBeenCalled();
    expect(h.mockDb.transaction).not.toHaveBeenCalled();
  });

  it("another user's upload in a thread part", async () => {
    h.mockDb.select
      .mockReturnValueOnce(activeAccounts(ACC_X))
      .mockReturnValueOnce(h.chain([{ id: MEDIA_MINE }]));

    const res = await createPost("hi", [ACC_X], "now", null, [MEDIA_MINE], {
      twitterThread: { parts: [{ text: "hi", mediaIds: [MEDIA_FOREIGN] }] },
    });

    expect(res).toEqual({
      success: false,
      error: "One or more media files are invalid or do not belong to you",
    });
    expect(h.mockDb.transaction).not.toHaveBeenCalled();
  });

  it("another user's upload in accountMedia", async () => {
    h.mockDb.select
      .mockReturnValueOnce(activeAccounts(ACC_X))
      .mockReturnValueOnce(h.chain([]));

    const res = await createPost("hi", [ACC_X], "scheduled", null, [], {
      accountMedia: { [ACC_X]: [MEDIA_FOREIGN] },
    });

    expect(res.success).toBe(false);
    expect(h.mockDb.transaction).not.toHaveBeenCalled();
  });

  it("a malformed thread-part media id (it threw 22P02 mid-publish)", async () => {
    h.mockDb.select.mockReturnValueOnce(activeAccounts(ACC_X));

    const res = await createPost("hi", [ACC_X], "now", null, [], {
      twitterThread: { parts: [{ text: "hi", mediaIds: ["x"] }] },
    });

    expect(res).toEqual({ success: false, error: "Invalid ID format" });
    expect(h.mockDb.transaction).not.toHaveBeenCalled();
  });

  // The publish engine used to be the first place that counted media, so an
  // oversized post was scheduled and charged, then failed at publish time.
  it("more media than any network takes, on save rather than at publish", async () => {
    h.mockDb.select.mockReturnValueOnce(activeAccounts(ACC_X));

    const res = await createPost("hi", [ACC_X], "now", null, mediaUuids(36));

    expect(res).toEqual({ success: false, error: "Maximum 35 media items per post." });
    // Refused before the ownership lookup and before any charge.
    expect(h.mockDb.select).toHaveBeenCalledTimes(1);
    expect(h.mockReserve).not.toHaveBeenCalled();
  });

  it("a thread is counted per part, not on its flattened media list", async () => {
    const ids = mediaUuids(24);
    h.mockDb.select
      .mockReturnValueOnce(activeAccounts(ACC_X))
      .mockReturnValueOnce(h.chain([]));

    const res = await createPost("hi", [ACC_X], "now", null, ids, {
      twitterThread: {
        parts: Array.from({ length: 6 }, (_, i) => ({
          text: `part ${i + 1}`,
          mediaIds: ids.slice(i * 4, i * 4 + 4),
        })),
      },
    });

    // Past the count check: it is the (mocked, empty) ownership lookup that refuses.
    expect(res).toEqual({
      success: false,
      error: "One or more media files are invalid or do not belong to you",
    });
  });
});

function mediaUuids(n: number): string[] {
  return Array.from(
    { length: n },
    (_, i) => `77777777-7777-4777-8777-${String(i).padStart(12, "0")}`,
  );
}

describe("postAgain", () => {
  function wireSource(accounts: unknown) {
    h.mockDb.select
      .mockReturnValueOnce(
        h.chain([
          {
            id: POST_ID,
            userId: "user-1",
            originalContent: "hi",
            finalContent: "hi",
            mediaIds: [],
            metadata: null,
            status: "published",
          },
        ]),
      )
      .mockReturnValueOnce(
        h.chain([{ connectedAccountId: ACC_X }, { connectedAccountId: ACC_LI }]),
      )
      .mockReturnValueOnce(accounts);
  }

  it("writes the post and its publications in one transaction", async () => {
    wireSource(activeAccounts(ACC_X, ACC_LI));
    h.mockDb.transaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
      cb(h.tx),
    );
    h.tx.insert
      .mockImplementationOnce(() => h.chain([{ id: NEW_POST_ID }]))
      .mockImplementationOnce(() =>
        h.chain(() => {
          throw new Error("insert or update violates foreign key constraint");
        }),
      );

    const res = await postAgain(POST_ID);

    expect(res.success).toBe(false);
    // Nothing was inserted outside the transaction, so the rollback takes the
    // post with it: no orphan `scheduled` post for the cron to fail.
    expect(h.mockDb.insert).not.toHaveBeenCalled();
    expect(h.tx.insert).toHaveBeenCalledTimes(2);
    expect(h.mockRelease).toHaveBeenCalledWith(reservation, "user-1");
    expect(h.mockEnqueue).not.toHaveBeenCalled();
  });

  it("a partial fan-out is tracked on the new post, not reported as failed", async () => {
    wireSource(activeAccounts(ACC_X, ACC_LI));
    wireCreateTransaction();
    h.mockEnqueue.mockRejectedValue(new Error("CF enqueue timed out"));

    const res = await postAgain(POST_ID);

    expect(res).toMatchObject({
      success: true,
      newPostId: NEW_POST_ID,
      queued: true,
      warning: PARTIAL_FAN_OUT_WARNING,
    });
    expect(h.mockRelease).not.toHaveBeenCalled();
  });

  it("refuses accounts the plan cap switched off", async () => {
    wireSource(
      h.chain([
        { id: ACC_X, isActive: true },
        { id: ACC_LI, isActive: false },
      ]),
    );

    const res = await postAgain(POST_ID);

    expect(res).toEqual({ success: false, error: SELECTED_ACCOUNT_OVER_PLAN_LIMIT_ERROR });
    expect(h.mockReserve).not.toHaveBeenCalled();
  });

  it("refuses a partial post while a per-network Retry is still uploading", async () => {
    // Retry of the failed YouTube row claims it (`publishing`) and leaves the
    // post `partial`. Posting again now would upload to YouTube twice.
    h.mockDb.select.mockReturnValueOnce(
      h.chain([
        {
          id: POST_ID,
          userId: "user-1",
          originalContent: "hi",
          finalContent: "hi",
          mediaIds: [],
          metadata: null,
          status: "partial",
          deliveryInFlight: true,
        },
      ]),
    );

    const res = await postAgain(POST_ID);

    expect(res).toEqual({
      success: false,
      error: "This post is publishing right now, so it can't be posted again yet.",
    });
    expect(h.mockReserve).not.toHaveBeenCalled();
    expect(h.mockDb.transaction).not.toHaveBeenCalled();
    expect(h.mockEnqueue).not.toHaveBeenCalled();
  });
});

describe("postDeliveryInFlightSql", () => {
  it("is a live `publishing` delivery of this post, idle rows excluded", () => {
    const text = render(postDeliveryInFlightSql);
    expect(text).toMatch(/^exists \(/);
    expect(text).toContain('from "post_publications" pp');
    expect(text).toContain('pp.post_id = "posts"."id"');
    expect(text).toContain("pp.status = 'publishing'");
    // The engine's idle rule: a dead run's row does not block anything.
    expect(text).toContain("and not coalesce(pp.updated_at, pp.created_at) <");
  });
});

describe("deletePosts (one request for a bulk delete)", () => {
  it("deletes each post and reports the ones that could not go", async () => {
    h.mockDb.transaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
      cb(h.tx),
    );
    h.tx.delete.mockImplementation(() => h.chain(undefined));
    // First post deletes; the second is publishing right now.
    h.tx.select.mockReturnValueOnce(h.chain([{ id: POST_ID }])).mockReturnValueOnce(h.chain([]));
    h.mockDb.select.mockReturnValueOnce(h.chain([{ status: "publishing" }]));
    const other = "99999999-9999-4999-8999-999999999999";

    const res = await deletePosts([POST_ID, other, POST_ID]);

    expect(res.ok).toEqual([POST_ID]);
    expect(res.failed).toEqual([
      { id: other, error: "This post is publishing right now, so it can't be deleted yet." },
    ]);
  });

  it.each([[[]], [Array.from({ length: POSTS_BATCH_MAX + 1 }, () => POST_ID)]])(
    "answers 400 for an empty or oversized batch",
    async (ids) => {
      await expect(deletePosts(ids)).rejects.toMatchObject({ statusCode: 400 });
      expect(h.mockDb.transaction).not.toHaveBeenCalled();
    },
  );
});

describe("duplicatePosts", () => {
  it("answers 400 for an oversized batch and fails a malformed item without creating it", async () => {
    await expect(
      duplicatePosts(
        Array.from({ length: POSTS_BATCH_MAX + 1 }, () => ({
          sourceId: POST_ID,
          content: "x",
          accountIds: [],
        })),
      ),
    ).rejects.toMatchObject({ statusCode: 400 });

    const res = await duplicatePosts([
      { sourceId: POST_ID, content: "hi", accountIds: "nope" as unknown as string[] },
    ]);
    expect(res).toEqual({ ok: [], failed: [{ id: POST_ID, error: "Invalid post" }], createdIds: [] });
  });
});

describe("deletePost", () => {
  it("the locked read refuses a post with a delivery in flight", async () => {
    h.mockDb.transaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
      cb(h.tx),
    );
    const wheres: unknown[] = [];
    h.tx.select.mockReturnValueOnce(whereRecordingChain([{ id: POST_ID }], wheres));
    h.tx.delete.mockImplementation(() => h.chain(undefined));

    await deletePost(POST_ID);

    expect(wheres).toHaveLength(1);
    expect(render(wheres[0] as SQL)).toContain(
      `not ${render(postDeliveryInFlightSql)}`,
    );
  });

  it("does not delete a partial post while a per-network Retry is uploading", async () => {
    h.mockDb.transaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
      cb(h.tx),
    );
    // The locked read excludes it: one delivery is `publishing` right now.
    h.tx.select.mockReturnValueOnce(h.chain([]));
    h.mockDb.select.mockReturnValueOnce(
      h.chain([{ status: "partial", deliveryInFlight: true }]),
    );

    const res = await deletePost(POST_ID);

    expect(res).toEqual({
      success: false,
      error: "This post is publishing right now, so it can't be deleted yet.",
    });
    expect(h.tx.delete).not.toHaveBeenCalled();
    expect(h.mockDb.delete).not.toHaveBeenCalled();
    expect(h.mockDeletedWebhook).not.toHaveBeenCalled();
  });

  it("does not delete a post that is publishing right now", async () => {
    h.mockDb.transaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
      cb(h.tx),
    );
    // The locked read excludes a live `publishing` post.
    h.tx.select.mockReturnValueOnce(h.chain([]));
    h.mockDb.select.mockReturnValueOnce(h.chain([{ status: "publishing" }]));

    const res = await deletePost(POST_ID);

    expect(res).toEqual({
      success: false,
      error: "This post is publishing right now, so it can't be deleted yet.",
    });
    expect(h.tx.delete).not.toHaveBeenCalled();
    expect(h.mockDb.delete).not.toHaveBeenCalled();
    expect(h.mockDeletedWebhook).not.toHaveBeenCalled();
  });

  it("deletes publications and post together", async () => {
    h.mockDb.transaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
      cb(h.tx),
    );
    h.tx.select.mockReturnValueOnce(h.chain([{ id: POST_ID }]));
    h.tx.delete.mockImplementation(() => h.chain(undefined));

    const res = await deletePost(POST_ID);

    expect(res).toEqual({ success: true });
    expect(h.tx.delete).toHaveBeenCalledTimes(2);
    expect(h.mockDb.delete).not.toHaveBeenCalled();
    expect(h.mockDeletedWebhook).toHaveBeenCalledWith("user-1", POST_ID);
  });
});

describe("updatePost after its transaction committed", () => {
  it("a failing shared-media lookup neither refunds nor reports failure", async () => {
    const at = new Date(Date.now() + 60 * 60 * 1000);
    h.mockDb.select
      // accounts
      .mockReturnValueOnce(activeAccounts(ACC_X))
      // the draft being scheduled, which drops one media item
      .mockReturnValueOnce(
        h.chain([{ id: POST_ID, status: "draft", mediaIds: [MEDIA_MINE], metadata: null }]),
      )
      // mediaIdsUsedByOtherPosts: the DB is slow
      .mockReturnValueOnce(
        h.chain(() => {
          throw new Error("canceling statement due to statement timeout");
        }),
      );
    h.mockDb.transaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
      cb(h.tx),
    );
    h.tx.update.mockImplementation(() => h.chain([{ id: POST_ID }]));
    h.tx.delete.mockImplementation(() => h.chain(undefined));
    h.tx.insert.mockImplementation(() => h.chain(undefined));

    const res = await updatePost(POST_ID, "hello", [ACC_X], at, []);

    expect(res).toEqual({ success: true });
    // Scheduling a draft charged a free post; the post is now scheduled, so
    // the charge stands.
    expect(h.mockReserve).toHaveBeenCalledTimes(1);
    expect(h.mockRelease).not.toHaveBeenCalled();
    expect(h.mockDb.delete).not.toHaveBeenCalled();
  });
});
