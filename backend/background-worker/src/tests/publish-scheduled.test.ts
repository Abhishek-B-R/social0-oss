import { beforeEach, describe, expect, it, vi } from "vitest";

type Applied = {
  status?: unknown;
  failureReason?: unknown;
  scheduledFor?: unknown;
  lastError?: unknown;
  metadata?: unknown;
  /** Which table the write went to; set by the mock, not the code under test. */
  table?: unknown;
};

const { mockDb, dispatch, finalize, fixture, updates } = vi.hoisted(() => ({
  mockDb: { select: vi.fn(), update: vi.fn() },
  dispatch: vi.fn(),
  finalize: vi.fn(),
  /** Rows the two scans return, and what the claims are allowed to win. */
  fixture: {
    scheduledPosts: [] as {
      id: string;
      userId: string;
      scheduledAt: Date | null;
    }[],
    queuedSlots: [] as {
      id: string;
      postId: string;
      userId: string;
      scheduledFor: Date | null;
    }[],
    /** Post ids whose `scheduled` → `publishing` claim should match a row. */
    claimablePostIds: new Set<string>(),
    /** Row `reconcileUnclaimedSlot` reads back for the post. */
    postRow: null as { status: string; scheduledAt: Date | null } | null,
    /** Post ids the stale-`publishing` sweep matches. */
    stalePostIds: [] as string[],
    /** Publication rows the sweep reads back after failing the unfinished ones. */
    stalePubRows: [] as { postId: string; status: string }[],
    /** `metadata->>'_dispatchFirstFailedAt'` as the post claim returns it. */
    dispatchFirstFailedAt: null as string | null,
    /** `posts.scheduled_at` as the post claim returns it (null: not compared). */
    claimScheduledAt: null as Date | null,
  },
  updates: [] as Applied[],
}));

vi.mock("../db/index.js", () => ({ db: mockDb }));
vi.mock("../lib/publish-load-targets.js", () => ({
  loadPublicationTargets: vi.fn().mockResolvedValue([
    {
      publicationId: "22222222-2222-4222-8222-222222222222",
      connectedAccountId: "33333333-3333-4333-8333-333333333333",
      platform: "twitter_x",
    },
  ]),
}));
vi.mock("../cron/init-scheduled-tracking.js", () => ({
  initScheduledPublishTracking: vi.fn().mockResolvedValue("track-1"),
}));
vi.mock("../cron/dispatch-scheduled-target.js", () => ({
  dispatchScheduledTarget: dispatch,
  dispatchTargetFor: (platform: string) =>
    ["twitter_x", "tiktok", "bluesky"].includes(platform) ? "server" : "cloudflare",
  requestServerFinalize: finalize,
}));
// Its query has its own tests (sweep-unfinalized-posts.test.ts); here it only
// matters that its requests join the scan's batch and that it never blocks.
const sweepUnfinalized = vi.hoisted(() => vi.fn());
vi.mock("../cron/sweep-unfinalized-posts.js", () => ({
  sweepUnfinalizedPosts: sweepUnfinalized,
}));

import {
  FINALIZE_CONCURRENCY,
  SCAN_BATCH_LIMIT,
  SCAN_DISPATCH_CONCURRENCY,
  STALE_PUBLISH_REASON,
  STALE_SWEEP_LIMIT,
  runPublishScheduledCron,
} from "../cron/publish-scheduled.js";
import { INTERRUPTED_PUBLISH_ERROR } from "@social0/shared";
import { postPublications, posts, queuedPosts } from "../db/schema.js";
import { loadPublicationTargets } from "../lib/publish-load-targets.js";

const POST_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "user-1";

/**
 * Drizzle chains are distinguished by what the caller asks for rather than by
 * table identity: the two scans select different column sets, and each write
 * is identified by the status it sets.
 */
/** `.limit(n)` of every scan/sweep select, keyed by what it selected. */
const limits: { scan: number[]; queued: number[]; sweep: number[] } = {
  scan: [],
  queued: [],
  sweep: [],
};

/** Awaitable rows that also take `.orderBy(...).limit(n)`, as drizzle does. */
function rows<T>(value: T[], record?: number[]) {
  const limited = (n: number) => {
    record?.push(n);
    return Promise.resolve(value.slice(0, n));
  };
  return Object.assign(Promise.resolve(value), {
    orderBy: () => ({ limit: limited }),
    limit: limited,
  });
}

function wireDb() {
  updates.length = 0;
  limits.scan.length = 0;
  limits.queued.length = 0;
  limits.sweep.length = 0;

  mockDb.select.mockImplementation((columns?: Record<string, unknown>) => ({
    from: () => ({
      where: () => {
        if (columns && "scheduledFor" in columns) {
          return rows(fixture.queuedSlots, limits.queued);
        }
        if (columns && "postId" in columns && "status" in columns) {
          // The sweep's publication read.
          return Promise.resolve(fixture.stalePubRows);
        }
        if (columns && "status" in columns) {
          // reconcileUnclaimedSlot's post read.
          return { limit: async () => (fixture.postRow ? [fixture.postRow] : []) };
        }
        if (columns && Object.keys(columns).length === 1 && "id" in columns) {
          // The stale sweep's bounded id subquery.
          return rows([], limits.sweep);
        }
        return rows(fixture.scheduledPosts, limits.scan);
      },
    }),
  }));

  mockDb.update.mockImplementation((table: unknown) => ({
    set: (values: Applied) => ({
      where: () => {
        const claimed =
          values.status === "publishing"
            ? fixture.claimablePostIds.has(POST_ID)
            : true;
        const record = () => updates.push({ ...values, table });
        return {
          returning: async () => {
            // The only `failed` write that reads rows back is the sweep.
            if (table === posts && values.status === "failed") {
              record();
              return fixture.stalePostIds.map((id) => ({ id, userId: USER_ID }));
            }
            if (!claimed) return [];
            record();
            return [
              {
                id: POST_ID,
                scheduledAt: fixture.claimScheduledAt,
                dispatchFirstFailedAt: fixture.dispatchFirstFailedAt,
              },
            ];
          },
          then: (resolve: (v: unknown) => unknown) => {
            record();
            return resolve(undefined);
          },
        };
      },
    }),
  }));
}

function statuses(): unknown[] {
  return updates.map((u) => u.status);
}

/** Writes that put a dispatch failure on a post (the sweep's are excluded). */
function dispatchFailures(): Applied[] {
  return updates.filter(
    (u) => u.failureReason && u.failureReason !== STALE_PUBLISH_REASON,
  );
}

/** The literal SQL text of a drizzle `sql` value (parameters elided). */
function sqlText(value: unknown): string {
  const chunks = (value as { queryChunks?: unknown[] } | undefined)?.queryChunks;
  if (!chunks) return "";
  return chunks
    .map((c) =>
      c && typeof c === "object" && Array.isArray((c as { value?: unknown }).value)
        ? ((c as { value: string[] }).value).join("")
        : "?",
    )
    .join("");
}

beforeEach(() => {
  vi.clearAllMocks();
  fixture.scheduledPosts = [];
  fixture.queuedSlots = [];
  fixture.claimablePostIds = new Set([POST_ID]);
  fixture.postRow = null;
  fixture.stalePostIds = [];
  fixture.stalePubRows = [];
  fixture.dispatchFirstFailedAt = null;
  fixture.claimScheduledAt = null;
  sweepUnfinalized.mockReset();
  sweepUnfinalized.mockResolvedValue(0);
  dispatch.mockReset();
  dispatch.mockResolvedValue("server");
  finalize.mockReset();
  finalize.mockResolvedValue(undefined);
  wireDb();
});

describe("runPublishScheduledCron", () => {
  it("dispatches a due post once per platform", async () => {
    fixture.scheduledPosts = [
      { id: POST_ID, userId: USER_ID, scheduledAt: new Date(Date.now() - 60_000) },
    ];

    const result = await runPublishScheduledCron();

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0][0]).toMatchObject({
      postId: POST_ID,
      platform: "twitter_x",
      trackingId: "track-1",
    });
    expect(result.processed).toEqual([POST_ID]);
  });

  /**
   * A queue-slot post carries both a `posts.scheduled_at` and a `queued_posts`
   * row, and both scans see it in the same tick. The queued scan used to
   * force-set `publishing` instead of going through the post claim, so the same
   * publication was handed to the publish runner twice and the two jobs raced
   * to post the same text.
   */
  it("fans a queue-slot post out once, not once per scan", async () => {
    const due = new Date(Date.now() - 60_000);
    fixture.scheduledPosts = [{ id: POST_ID, userId: USER_ID, scheduledAt: due }];
    fixture.queuedSlots = [
      { id: "slot-row-1", postId: POST_ID, userId: USER_ID, scheduledFor: due },
    ];

    /**
     * The slot row has to leave `pending` *before* the dispatch, not after:
     * `finalize-post` settles `processing` rows, and a server-side platform job
     * can finish before the next statement here runs. Marking it afterwards
     * lets the row miss its own finalize and sit in `processing` forever —
     * which is exactly what a live run did before this was reordered.
     */
    const statusesAtDispatch: unknown[] = [];
    dispatch.mockImplementation(async () => {
      statusesAtDispatch.push(...statuses());
      return "cloudflare";
    });

    const result = await runPublishScheduledCron();

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(result.processed).toEqual([POST_ID]);
    expect(result.queuedProcessed).toEqual([]);
    expect(statusesAtDispatch).toContain("processing");
  });

  it("leaves an upcoming post alone and arms it instead", async () => {
    fixture.scheduledPosts = [
      { id: POST_ID, userId: USER_ID, scheduledAt: new Date(Date.now() + 120_000) },
    ];

    const result = await runPublishScheduledCron();

    expect(dispatch).not.toHaveBeenCalled();
    expect(result.armed).toBe(1);
  });

  /**
   * A blip deserves a retry: `scheduled_at` is already past, so the next tick
   * picks the post straight back up.
   */
  it("hands a freshly due post back as scheduled when dispatch fails", async () => {
    fixture.scheduledPosts = [
      { id: POST_ID, userId: USER_ID, scheduledAt: new Date(Date.now() - 60_000) },
    ];
    dispatch.mockRejectedValue(new Error("publish worker unreachable"));

    const result = await runPublishScheduledCron();

    expect(result.processed).toEqual([]);
    // Claimed, then handed back — and never written off with a reason, so the
    // next tick picks it straight back up.
    expect(statuses()).toContain("publishing");
    expect(statuses().at(-1)).toBe("scheduled");
    expect(dispatchFailures().length > 0).toBe(false);
  });

  /**
   * The give-up window used to run from `scheduled_at`, so after an outage of
   * over an hour (or for a slot post scheduled long ago) the very first
   * dispatch attempt that hit a blip failed the post for good. The first
   * failure now only starts the clock.
   */
  it("hands a long-overdue post back on its first failed dispatch, and starts the clock", async () => {
    fixture.scheduledPosts = [
      {
        id: POST_ID,
        userId: USER_ID,
        scheduledAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
      },
    ];
    dispatch.mockRejectedValue(new Error("CF publish enqueue failed: 503"));

    await runPublishScheduledCron();

    expect(dispatchFailures().length > 0).toBe(false);
    const handBack = updates.at(-1);
    expect(handBack?.status).toBe("scheduled");
    expect(sqlText(handBack?.metadata)).toMatch(/\|\| jsonb_build_object/);
    expect(finalize).not.toHaveBeenCalled();
  });

  /**
   * The bug users actually saw: a dispatch that can never succeed (bad secret,
   * worker 403) retried every five minutes while the post read "Waiting for
   * scheduled time" forever, with the reason only in the droplet log.
   */
  it("fails a post whose dispatch has kept failing for over an hour, with the reason", async () => {
    const due = new Date(Date.now() - 3 * 60 * 60 * 1000);
    fixture.scheduledPosts = [{ id: POST_ID, userId: USER_ID, scheduledAt: due }];
    fixture.claimScheduledAt = due;
    fixture.dispatchFirstFailedAt = new Date(
      Date.now() - 2 * 60 * 60 * 1000,
    ).toISOString();
    dispatch.mockRejectedValue(new Error("CF publish enqueue failed: 403"));

    await runPublishScheduledCron();

    expect(statuses()).not.toContain("scheduled");
    const failure = dispatchFailures()[0];
    expect(failure?.status).toBe("failed");
    // Named platform, not a bare undici "fetch failed" — this lands on the post.
    expect(failure?.failureReason).toMatch(
      /Could not queue twitter_x for publishing: .*403/,
    );
    // And the mark is cleared, so a later reschedule starts a fresh window.
    expect(sqlText(failure?.metadata)).toMatch(/ - /);
    // Failure email and post.failed webhook come from finalize.
    expect(finalize).toHaveBeenCalledWith(POST_ID, USER_ID);
  });

  it("keeps retrying while dispatch has been failing for under an hour", async () => {
    fixture.scheduledPosts = [
      { id: POST_ID, userId: USER_ID, scheduledAt: new Date(Date.now() - 60_000) },
    ];
    fixture.dispatchFirstFailedAt = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    dispatch.mockRejectedValue(new Error("CF publish enqueue failed: 503"));

    await runPublishScheduledCron();

    expect(statuses().at(-1)).toBe("scheduled");
    expect(dispatchFailures().length > 0).toBe(false);
  });

  /**
   * The mark survives a reschedule (neither `reschedulePost` nor `updatePost`
   * touches metadata). A post that failed to dispatch yesterday and was moved
   * to today used to be failed for good on today's first blip, because the
   * stale mark put it a day past the give-up window.
   */
  it("ignores a failure mark left by an earlier schedule, and restarts the clock", async () => {
    const due = new Date(Date.now() - 60_000);
    fixture.scheduledPosts = [{ id: POST_ID, userId: USER_ID, scheduledAt: due }];
    fixture.claimScheduledAt = due;
    fixture.dispatchFirstFailedAt = new Date(
      Date.now() - 24 * 60 * 60 * 1000,
    ).toISOString();
    dispatch.mockRejectedValue(new Error("CF publish enqueue failed: 503"));

    const before = Date.now();
    await runPublishScheduledCron();

    expect(dispatchFailures()).toEqual([]);
    expect(finalize).not.toHaveBeenCalled();
    const handBack = updates.at(-1);
    expect(handBack?.status).toBe("scheduled");
    // The stale mark is replaced with this failure's time, not kept: kept, it
    // would be ignored on every later attempt and the post never given up on.
    const params = (
      (handBack?.metadata as { queryChunks?: unknown[] }).queryChunks ?? []
    ).filter(
      (c) => !(c && typeof c === "object" && Array.isArray((c as { value?: unknown }).value)),
    );
    const written = params
      .map((c) => (c && typeof c === "object" && "value" in c ? (c as { value: unknown }).value : c))
      .find((v) => typeof v === "string" && !Number.isNaN(Date.parse(v)));
    expect(written).toBeDefined();
    expect(Date.parse(written as string)).toBeGreaterThanOrEqual(before);
  });

  it("clears a stale failure mark once the post dispatches", async () => {
    const due = new Date(Date.now() - 60_000);
    fixture.scheduledPosts = [{ id: POST_ID, userId: USER_ID, scheduledAt: due }];
    fixture.claimScheduledAt = due;
    fixture.dispatchFirstFailedAt = new Date(
      Date.now() - 24 * 60 * 60 * 1000,
    ).toISOString();

    const result = await runPublishScheduledCron();

    expect(result.processed).toEqual([POST_ID]);
    const clear = updates.find((u) => u.table === posts && u.metadata !== undefined);
    expect(sqlText(clear?.metadata)).toMatch(/ - /);
  });

  it("clears the failure mark once the post dispatches", async () => {
    fixture.scheduledPosts = [
      { id: POST_ID, userId: USER_ID, scheduledAt: new Date(Date.now() - 60_000) },
    ];
    fixture.dispatchFirstFailedAt = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    const result = await runPublishScheduledCron();

    expect(result.processed).toEqual([POST_ID]);
    const clear = updates.find((u) => u.table === posts && u.metadata !== undefined);
    expect(sqlText(clear?.metadata)).toMatch(/ - /);
  });

  /**
   * The scan used to build the Cloudflare client first and throw above the
   * sweeper, so a deployment without `CF_PUBLISH_*` swept nothing and published
   * nothing — including X, which never goes to Cloudflare.
   */
  it("sweeps stale publishing posts before touching publish config", async () => {
    await runPublishScheduledCron();
    expect(statuses()).toContain("failed");
  });

  /**
   * A worker that died mid-job leaves its publication `publishing`. Failing
   * only the post left nothing to retry per network, and a whole-post retry
   * skipped the row as "already in progress" while putting the post back into
   * `publishing` for another hour.
   */
  it("fails the unfinished publications of a swept post", async () => {
    fixture.stalePostIds = [POST_ID];

    await runPublishScheduledCron();

    const pubWrites = updates.filter((u) => u.table === postPublications);
    expect(pubWrites.map((u) => u.status)).toEqual(["failed", "failed"]);
    // Mid-send rows may already be live: marked so nothing retries them alone.
    expect(pubWrites.map((u) => u.lastError)).toEqual([
      INTERRUPTED_PUBLISH_ERROR,
      "Publish did not complete for this platform",
    ]);
  });

  /**
   * Finalize is what moves a claimed slot row out of `processing`, and a swept
   * post never finalized — so its slot row kept occupying the slot forever.
   */
  it("releases the queue slots of a swept post", async () => {
    fixture.stalePostIds = [POST_ID];

    await runPublishScheduledCron();

    const slotWrite = updates.find((u) => u.table === queuedPosts);
    expect(slotWrite?.status).toBe("failed");
  });

  /**
   * The sweep used to fail every stale post outright. A post whose X job had
   * published (its finalize stopped on the still-`pending` LinkedIn row) read
   * `failed` with no reason, no email and no webhook, though it was live on X.
   */
  it("derives a swept post's status from its publications and asks the API to finalize", async () => {
    fixture.stalePostIds = [POST_ID];
    fixture.stalePubRows = [
      { postId: POST_ID, status: "published" },
      { postId: POST_ID, status: "failed" },
    ];

    await runPublishScheduledCron();

    const sweep = updates.find((u) => u.table === posts && u.status === "failed");
    expect(sweep?.failureReason).toMatch(/did not finish/);
    const settle = updates.find((u) => u.table === posts && u.status === "partial");
    expect(settle).toBeDefined();
    // Live on one platform: the slot is used, not failed.
    const slotWrite = updates.find((u) => u.table === queuedPosts);
    expect(slotWrite?.status).toBe("done");
    expect(finalize).toHaveBeenCalledWith(POST_ID, USER_ID);
  });

  it("keeps a swept post failed when nothing published", async () => {
    fixture.stalePostIds = [POST_ID];
    fixture.stalePubRows = [{ postId: POST_ID, status: "failed" }];

    await runPublishScheduledCron();

    expect(statuses()).not.toContain("partial");
    expect(statuses()).not.toContain("published");
    expect(finalize).toHaveBeenCalledWith(POST_ID, USER_ID);
  });

  /**
   * The job that went out (X on the API, failing fast on an expired token) can
   * finish before the next dispatch fails. Its finalize saw the other row still
   * `pending` and stopped, and nothing finalized the post again: it sat in
   * `publishing` for an hour with no failure email or webhook, its slot stuck.
   */
  it("fails what never left and asks the API to finalize after a partial fan-out", async () => {
    fixture.scheduledPosts = [
      { id: POST_ID, userId: USER_ID, scheduledAt: new Date(Date.now() - 60_000) },
    ];
    vi.mocked(loadPublicationTargets).mockResolvedValueOnce([
      {
        publicationId: "22222222-2222-4222-8222-222222222222",
        connectedAccountId: "33333333-3333-4333-8333-333333333333",
        platform: "twitter_x",
      },
      {
        publicationId: "44444444-4444-4444-8444-444444444444",
        connectedAccountId: "55555555-5555-4555-8555-555555555555",
        platform: "linkedin",
      },
    ] as Awaited<ReturnType<typeof loadPublicationTargets>>);
    dispatch
      .mockResolvedValueOnce("server")
      .mockRejectedValueOnce(new Error("CF publish enqueue failed: 503"));

    const result = await runPublishScheduledCron();

    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(result.processed).toEqual([]);
    const pubWrite = updates.find((u) => u.table === postPublications);
    expect(pubWrite?.status).toBe("failed");
    expect(pubWrite?.lastError).toMatch(/Could not queue linkedin/);
    // Not handed back for a retry: X is already out.
    expect(statuses()).not.toContain("scheduled");
    expect(finalize).toHaveBeenCalledWith(POST_ID, USER_ID);
  });

  it("dispatches API-hosted platforms first, so an API restart hands the post back", async () => {
    fixture.scheduledPosts = [
      { id: POST_ID, userId: USER_ID, scheduledAt: new Date(Date.now() - 60_000) },
    ];
    vi.mocked(loadPublicationTargets).mockResolvedValueOnce([
      {
        publicationId: "44444444-4444-4444-8444-444444444444",
        connectedAccountId: "55555555-5555-4555-8555-555555555555",
        platform: "linkedin",
      },
      {
        publicationId: "22222222-2222-4222-8222-222222222222",
        connectedAccountId: "33333333-3333-4333-8333-333333333333",
        platform: "twitter_x",
      },
    ] as Awaited<ReturnType<typeof loadPublicationTargets>>);
    dispatch.mockRejectedValueOnce(new Error("connect ECONNREFUSED"));

    await runPublishScheduledCron();

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0]![0]).toMatchObject({ platform: "twitter_x" });
    expect(updates.find((u) => u.table === postPublications)).toBeUndefined();
    expect(statuses()).toContain("scheduled");
  });

  it("does not ask for a finalize when nothing was dispatched", async () => {
    fixture.scheduledPosts = [
      { id: POST_ID, userId: USER_ID, scheduledAt: new Date(Date.now() - 60_000) },
    ];
    dispatch.mockRejectedValue(new Error("publish worker unreachable"));

    await runPublishScheduledCron();

    expect(finalize).not.toHaveBeenCalled();
  });

  it("leaves publications alone when the sweep matches no post", async () => {
    await runPublishScheduledCron();
    expect(updates.some((u) => u.table === postPublications)).toBe(false);
  });

  it("does not dispatch a slot row whose post is no longer claimable", async () => {
    const due = new Date(Date.now() - 60_000);
    fixture.queuedSlots = [
      { id: "slot-row-1", postId: POST_ID, userId: USER_ID, scheduledFor: due },
    ];
    fixture.claimablePostIds = new Set();
    fixture.postRow = { status: "published", scheduledAt: due };

    const result = await runPublishScheduledCron();

    expect(dispatch).not.toHaveBeenCalled();
    expect(result.queuedProcessed).toEqual([]);
    // Slot settled rather than left stuck in `processing`.
    expect(statuses()).toContain("done");
  });
});

/**
 * Finalize sends the failure email and delivers the user's webhooks, about 35
 * seconds a post when a customer endpoint hangs. The scan asked for each one
 * inline before looking at due posts, and the cron runs one scan at a time, so
 * 60 posts swept after a publish-worker outage held every customer's due posts
 * for half an hour.
 */
describe("runPublishScheduledCron finalize requests", () => {
  const STALE_ID = "66666666-6666-4666-8666-666666666666";
  const OTHER_ID = "77777777-7777-4777-8777-777777777777";

  it("dispatches due posts before finalizing swept ones", async () => {
    fixture.stalePostIds = [STALE_ID];
    fixture.stalePubRows = [{ postId: STALE_ID, status: "failed" }];
    fixture.scheduledPosts = [
      { id: POST_ID, userId: USER_ID, scheduledAt: new Date(Date.now() - 60_000) },
    ];
    const order: string[] = [];
    dispatch.mockImplementation(async (job: { postId: string }) => {
      order.push(`dispatch:${job.postId}`);
      return "server";
    });
    finalize.mockImplementation(async (postId: string) => {
      order.push(`finalize:${postId}`);
    });

    const result = await runPublishScheduledCron();

    expect(result.processed).toEqual([POST_ID]);
    expect(order).toEqual([`dispatch:${POST_ID}`, `finalize:${STALE_ID}`]);
  });

  it("does not hold the next due post behind a give-up's finalize", async () => {
    const due = new Date(Date.now() - 60_000);
    fixture.scheduledPosts = [
      { id: OTHER_ID, userId: USER_ID, scheduledAt: due },
      { id: POST_ID, userId: USER_ID, scheduledAt: due },
    ];
    fixture.dispatchFirstFailedAt = new Date(
      Date.now() - 2 * 60 * 60 * 1000,
    ).toISOString();
    const order: string[] = [];
    dispatch.mockImplementation(async (job: { postId: string }) => {
      order.push(`dispatch:${job.postId}`);
      if (job.postId === OTHER_ID) throw new Error("CF publish enqueue failed: 403");
      return "server";
    });
    finalize.mockImplementation(async (postId: string) => {
      order.push(`finalize:${postId}`);
    });

    await runPublishScheduledCron();

    expect(order).toEqual([
      `dispatch:${OTHER_ID}`,
      `dispatch:${POST_ID}`,
      `finalize:${OTHER_ID}`,
    ]);
  });

  it("sends a wave of finalizes a few at a time, not one by one", async () => {
    const ids = Array.from(
      { length: FINALIZE_CONCURRENCY * 2 + 3 },
      (_, i) => `88888888-8888-4888-8888-${String(i).padStart(12, "0")}`,
    );
    fixture.stalePostIds = ids;
    fixture.stalePubRows = ids.map((postId) => ({ postId, status: "failed" }));
    let inFlight = 0;
    let peak = 0;
    finalize.mockImplementation(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
    });

    await runPublishScheduledCron();

    expect(finalize).toHaveBeenCalledTimes(ids.length);
    expect(peak).toBe(FINALIZE_CONCURRENCY);
  });

  it("still finalizes swept posts when the due scan fails", async () => {
    fixture.stalePostIds = [STALE_ID];
    fixture.stalePubRows = [{ postId: STALE_ID, status: "failed" }];
    const wired = mockDb.select.getMockImplementation()!;
    mockDb.select.mockImplementation((columns?: Record<string, unknown>) =>
      columns && "scheduledAt" in columns && !("status" in columns)
        ? {
            from: () => ({
              where: () => ({
                orderBy: () => ({ limit: () => Promise.reject(new Error("connection reset")) }),
              }),
            }),
          }
        : wired(columns),
    );

    await expect(runPublishScheduledCron()).rejects.toThrow(/connection reset/);
    expect(finalize).toHaveBeenCalledWith(STALE_ID, USER_ID);
  });

  it("finalizes terminal posts the unfinalized-post sweep finds, after the due scan", async () => {
    const UNFINALIZED_ID = "55555555-5555-4555-8555-555555555555";
    sweepUnfinalized.mockImplementation(
      async (request: (id: string, userId: string, context: string) => void) => {
        request(UNFINALIZED_ID, USER_ID, "for unfinalized terminal post");
        return 1;
      },
    );

    await runPublishScheduledCron();

    expect(finalize).toHaveBeenCalledWith(UNFINALIZED_ID, USER_ID);
  });

  it("still scans due posts when the unfinalized-post sweep fails", async () => {
    sweepUnfinalized.mockRejectedValue(new Error("connection reset"));
    fixture.scheduledPosts = [
      { id: POST_ID, userId: USER_ID, scheduledAt: new Date(Date.now() - 60_000) },
    ];

    const result = await runPublishScheduledCron();

    expect(result.processed).toContain(POST_ID);
  });
});

/**
 * The scans used to load every row in the window and claim them one by one,
 * and the stale sweep updated every match: after an outage, one tick did
 * thousands of serial claims.
 */
describe("runPublishScheduledCron batching", () => {
  it("bounds each scan and the stale sweep", async () => {
    await runPublishScheduledCron();

    expect(limits.scan).toEqual([SCAN_BATCH_LIMIT]);
    expect(limits.queued).toEqual([SCAN_BATCH_LIMIT]);
    expect(limits.sweep).toEqual([STALE_SWEEP_LIMIT]);
  });

  it("claims due posts in parallel, never more than the cap at once", async () => {
    const due = Array.from({ length: 20 }, (_, i) => ({
      id: `post-${i}`,
      userId: USER_ID,
      scheduledAt: new Date(Date.now() - 60_000),
    }));
    fixture.scheduledPosts = due;
    let inFlight = 0;
    let peak = 0;
    const select = mockDb.select.getMockImplementation()!;
    // Slow down each claim's target load to observe overlap.
    vi.mocked(loadPublicationTargets).mockImplementation(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
      return [];
    });
    mockDb.select.mockImplementation(select);

    await runPublishScheduledCron();

    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(SCAN_DISPATCH_CONCURRENCY);
  });

  it("keeps going past a post whose enqueue throws", async () => {
    fixture.scheduledPosts = [
      { id: POST_ID, userId: USER_ID, scheduledAt: new Date(Date.now() - 60_000) },
      { id: POST_ID, userId: USER_ID, scheduledAt: new Date(Date.now() - 30_000) },
    ];
    vi.mocked(loadPublicationTargets)
      .mockRejectedValueOnce(new Error("db blip"))
      .mockResolvedValue([
        {
          publicationId: "pub-1",
          connectedAccountId: "acc-1",
          platform: "twitter_x",
        },
      ] as Awaited<ReturnType<typeof loadPublicationTargets>>);

    const result = await runPublishScheduledCron();

    expect(result.processed.length).toBeGreaterThanOrEqual(1);
  });
});
