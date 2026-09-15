import { beforeEach, describe, expect, it, vi } from "vitest";

type Applied = { status?: unknown; failureReason?: unknown; scheduledFor?: unknown };

const { mockDb, dispatch, fixture, updates } = vi.hoisted(() => ({
  mockDb: { select: vi.fn(), update: vi.fn() },
  dispatch: vi.fn(),
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
}));

import { runPublishScheduledCron } from "../cron/publish-scheduled.js";

const POST_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "user-1";

/**
 * Drizzle chains are distinguished by what the caller asks for rather than by
 * table identity: the two scans select different column sets, and each write
 * is identified by the status it sets.
 */
function wireDb() {
  updates.length = 0;

  mockDb.select.mockImplementation((columns?: Record<string, unknown>) => ({
    from: () => ({
      where: () => {
        if (columns && "scheduledFor" in columns) {
          return Promise.resolve(fixture.queuedSlots);
        }
        if (columns && "status" in columns) {
          // reconcileUnclaimedSlot's post read.
          return { limit: async () => (fixture.postRow ? [fixture.postRow] : []) };
        }
        return Promise.resolve(fixture.scheduledPosts);
      },
    }),
  }));

  mockDb.update.mockImplementation(() => ({
    set: (values: Applied) => ({
      where: () => {
        const claimed =
          values.status === "publishing"
            ? fixture.claimablePostIds.has(POST_ID)
            : true;
        const record = () => updates.push(values);
        return {
          returning: async () => {
            if (!claimed) return [];
            record();
            return [{ id: POST_ID }];
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

beforeEach(() => {
  vi.clearAllMocks();
  fixture.scheduledPosts = [];
  fixture.queuedSlots = [];
  fixture.claimablePostIds = new Set([POST_ID]);
  fixture.postRow = null;
  dispatch.mockReset();
  dispatch.mockResolvedValue("server");
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
    expect(updates.some((u) => u.failureReason)).toBe(false);
  });

  /**
   * The bug users actually saw: a dispatch that can never succeed (bad secret,
   * worker 403) retried every five minutes while the post read "Waiting for
   * scheduled time" forever, with the reason only in the droplet log.
   */
  it("fails a long-overdue post whose dispatch keeps failing, with the reason", async () => {
    fixture.scheduledPosts = [
      {
        id: POST_ID,
        userId: USER_ID,
        scheduledAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
      },
    ];
    dispatch.mockRejectedValue(new Error("CF publish enqueue failed: 403"));

    await runPublishScheduledCron();

    expect(statuses()).not.toContain("scheduled");
    const failure = updates.find((u) => u.failureReason);
    expect(failure?.status).toBe("failed");
    // Named platform, not a bare undici "fetch failed" — this lands on the post.
    expect(failure?.failureReason).toMatch(
      /Could not queue twitter_x for publishing: .*403/,
    );
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
