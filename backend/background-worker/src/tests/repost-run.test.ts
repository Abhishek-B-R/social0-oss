import { beforeEach, describe, expect, it, vi } from "vitest";

type Write = {
  op: "update" | "insert";
  table: unknown;
  values: Record<string, unknown>;
  inTransaction: boolean;
};

const { mockDb, x, fixture, writes } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
    transaction: vi.fn(),
  },
  x: {
    quote: vi.fn(),
    retweet: vi.fn(),
    unretweet: vi.fn(),
    deleteTweet: vi.fn(),
  },
  fixture: {
    schedule: {} as Record<string, unknown>,
    xPub: null as Record<string, unknown> | null,
    /** Done/failed history the cron reads, newest first. */
    history: [] as { scheduleId: string; status: string; plugCommentId: string | null }[],
    /** Whether closing the event (failed or done) still finds it pending. */
    eventStillPending: true,
    /** The schedule row as the success path's update returns it. */
    scheduleAfter: null as { isActive: boolean; intervalHours: number } | null,
    /** The owner's `user_settings` plan columns. */
    sub: {} as {
      subscriptionTier: string | null;
      subscriptionExpiresAt: Date | null;
      subscriptionCancelAtPeriodEnd: boolean | null;
    },
  },
  writes: [] as Write[],
}));

vi.mock("../db/index.js", () => ({ db: mockDb }));
vi.mock("../lib/env.js", () => ({
  env: { TWITTER_CONSUMER_KEY: "app-key", TWITTER_CONSUMER_SECRET: "app-secret" },
}));
vi.mock("../lib/claim-cron-work.js", () => ({
  claimCronWork: vi.fn().mockResolvedValue(true),
  resurfaceEventClaimKey: (id: string) => `claim:${id}`,
}));
vi.mock("@social0/shared", () => ({
  decryptToken: (value: string) => `plain:${value}`,
  logCronSkipped: vi.fn(),
  isActiveTier: (tier: string | null | undefined) =>
    tier === "creator" || tier === "agency" || tier === "starter" || tier === "growth" || tier === "pro" || tier === "max",
  getPlanLimits: (tier: string) => ({ allowResurface: tier !== "free" }),
}));
vi.mock("twitter-api-v2", () => ({
  TwitterApi: class {
    v2 = x;
  },
}));

import {
  REPOST_MAX_FAST_RETRIES,
  REPOST_RETRY_DELAY_MS,
  classifyQuoteError,
  classifyRepostError,
  repostRetryAt,
  runRepostCron,
} from "../cron/repost-run.js";
import { resurfaceEvents, resurfaceSchedules } from "../db/schema.js";

const EVENT_ID = "11111111-1111-4111-8111-111111111111";
const SCHEDULE_ID = "22222222-2222-4222-8222-222222222222";
const POST_ID = "33333333-3333-4333-8333-333333333333";
const INTERVAL_HOURS = 24;

/** A drizzle chain that resolves to `rows` from whichever step is awaited. */
function chain(rows: unknown[]) {
  const builder: Record<string, unknown> = {};
  for (const step of ["from", "innerJoin", "where", "orderBy", "limit"]) {
    builder[step] = () => builder;
  }
  builder.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(rows).then(resolve, reject);
  return builder;
}

function writer(inTransaction: boolean) {
  return {
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: () => {
          writes.push({ op: "update", table, values, inTransaction });
          const done = Promise.resolve(undefined);
          return {
            returning: async () => {
              if (table === resurfaceSchedules) {
                return fixture.scheduleAfter ? [fixture.scheduleAfter] : [];
              }
              return fixture.eventStillPending ? [{ id: EVENT_ID }] : [];
            },
            then: (resolve: (v: unknown) => unknown) => done.then(resolve),
          };
        },
      }),
    }),
    insert: (table: unknown) => ({
      values: async (values: Record<string, unknown>) => {
        writes.push({ op: "insert", table, values, inTransaction });
      },
    }),
  };
}

/** Select chains are told apart by the columns each query asks for. */
function wireDb() {
  writes.length = 0;
  mockDb.select.mockImplementation((columns: Record<string, unknown>) => {
    if ("eventId" in columns) {
      return chain([
        { eventId: EVENT_ID, scheduleId: SCHEDULE_ID, platformReshareId: null, plugCommentId: null },
      ]);
    }
    if ("intervalHours" in columns) return chain([fixture.schedule]);
    if ("subscriptionTier" in columns) {
      return chain([{ userId: "user-1", ...fixture.sub }]);
    }
    if ("encryptedAccessToken" in columns) {
      return chain(fixture.xPub ? [fixture.xPub] : []);
    }
    return chain(fixture.history);
  });
  const outside = writer(false);
  mockDb.update.mockImplementation(outside.update);
  mockDb.insert.mockImplementation(outside.insert);
  mockDb.transaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
    cb(writer(true)),
  );
}

function apiError(code: number) {
  return Object.assign(new Error(`Request failed with code ${code}`), {
    type: "response",
    code,
  });
}

/** The literal SQL text of a drizzle `sql` value (parameters as `?`). */
function sqlText(value: unknown): string {
  const chunks = (value as { queryChunks?: unknown[] } | undefined)?.queryChunks;
  if (!chunks) return "";
  return chunks
    .map((c) =>
      c && typeof c === "object" && Array.isArray((c as { value?: unknown }).value)
        ? (c as { value: string[] }).value.join("")
        : "?",
    )
    .join("");
}

const eventWrites = () => writes.filter((w) => w.table === resurfaceEvents);
const scheduleWrites = () => writes.filter((w) => w.table === resurfaceSchedules);

beforeEach(() => {
  vi.clearAllMocks();
  fixture.schedule = {
    id: SCHEDULE_ID,
    postId: POST_ID,
    platform: "x",
    intervalHours: INTERVAL_HOURS,
    maxResurfaces: 5,
    plugComment: null,
    isActive: true,
    resurfacesDone: 1,
    userId: "user-1",
  };
  fixture.xPub = {
    postId: POST_ID,
    platformPostId: "tweet-1",
    connectedAccountId: "acct-1",
    encryptedAccessToken: "enc-token",
    encryptedRefreshToken: "enc-secret",
    platformUserId: "x-user-1",
  };
  fixture.history = [{ scheduleId: SCHEDULE_ID, status: "done", plugCommentId: null }];
  fixture.eventStillPending = true;
  fixture.sub = {
    subscriptionTier: "pro",
    subscriptionExpiresAt: null,
    subscriptionCancelAtPeriodEnd: false,
  };
  fixture.scheduleAfter = { isActive: true, intervalHours: INTERVAL_HOURS };
  x.quote.mockResolvedValue({ data: { id: "quote-1" } });
  x.retweet.mockResolvedValue({});
  x.unretweet.mockResolvedValue({});
  x.deleteTweet.mockResolvedValue({});
  wireDb();
});

describe("classifyRepostError", () => {
  it.each([429, 408, 425, 500, 503])("treats X %i as transient", (code) => {
    expect(classifyRepostError(apiError(code))).toBe("transient");
  });

  it.each([400, 401, 403, 404])("treats X %i as permanent", (code) => {
    expect(classifyRepostError(apiError(code))).toBe("permanent");
  });

  it("treats network and unknown errors as transient", () => {
    expect(classifyRepostError({ type: "request" })).toBe("transient");
    expect(classifyRepostError(new Error("socket hang up"))).toBe("transient");
  });
});

describe("classifyQuoteError", () => {
  it("treats a quote that got no answer as an unknown outcome", () => {
    expect(classifyQuoteError({ type: "request" })).toBe("unknown_outcome");
    expect(classifyQuoteError({ type: "partial-response" })).toBe("unknown_outcome");
  });

  it.each([429, 408, 503])("still retries X %i soon", (code) => {
    expect(classifyQuoteError(apiError(code))).toBe("transient");
  });

  it("still pauses on a permanent refusal", () => {
    expect(classifyQuoteError(apiError(403))).toBe("permanent");
  });
});

describe("repostRetryAt", () => {
  const now = new Date("2026-01-01T00:00:00Z");

  it("retries soon while the failure streak is short", () => {
    expect(repostRetryAt(now, INTERVAL_HOURS, 0).getTime()).toBe(
      now.getTime() + REPOST_RETRY_DELAY_MS,
    );
  });

  it("never retries later than the rule's own interval", () => {
    expect(repostRetryAt(now, 0.1, 0).getTime()).toBe(now.getTime() + 0.1 * 3_600_000);
  });

  it("falls back to the interval once the fast retries are spent", () => {
    expect(repostRetryAt(now, INTERVAL_HOURS, REPOST_MAX_FAST_RETRIES).getTime()).toBe(
      now.getTime() + INTERVAL_HOURS * 3_600_000,
    );
  });
});

describe("runRepostCron failures", () => {
  /**
   * One X 503 used to mark the event failed with no executedAt and queue
   * nothing: the rule stayed "active" with no pending event and never ran
   * again, while the Automations page still showed the earlier success.
   */
  it("keeps the rule alive after a transient X error", async () => {
    x.retweet.mockRejectedValueOnce(apiError(503));
    const before = Date.now();

    const result = await runRepostCron();

    expect(result.processed).toBe(0);
    const [closed, next] = eventWrites();
    expect(closed).toMatchObject({
      op: "update",
      inTransaction: true,
      values: { status: "failed" },
    });
    expect(closed.values.executedAt).toBeInstanceOf(Date);
    expect(next).toMatchObject({
      op: "insert",
      inTransaction: true,
      values: { scheduleId: SCHEDULE_ID, status: "pending" },
    });
    const dueIn = (next.values.nextExecuteAt as Date).getTime() - before;
    expect(dueIn).toBeGreaterThanOrEqual(REPOST_RETRY_DELAY_MS - 1000);
    expect(dueIn).toBeLessThanOrEqual(REPOST_RETRY_DELAY_MS + 1000);
    expect(scheduleWrites()).toEqual([]);
  });

  it("drops to the rule's interval after repeated transient failures", async () => {
    fixture.history = [
      ...Array.from({ length: REPOST_MAX_FAST_RETRIES }, () => ({
        scheduleId: SCHEDULE_ID,
        status: "failed",
        plugCommentId: null,
      })),
      { scheduleId: SCHEDULE_ID, status: "done", plugCommentId: null },
    ];
    x.retweet.mockRejectedValueOnce(apiError(429));
    const before = Date.now();

    await runRepostCron();

    const next = eventWrites().find((w) => w.op === "insert");
    const dueIn = (next?.values.nextExecuteAt as Date).getTime() - before;
    expect(dueIn).toBeGreaterThanOrEqual(INTERVAL_HOURS * 3_600_000 - 1000);
  });

  it("pauses the rule on a permanent X error instead of leaving it active", async () => {
    x.quote.mockRejectedValueOnce(apiError(401));
    fixture.schedule.plugComment = "Still relevant";

    await runRepostCron();

    expect(eventWrites()).toHaveLength(1);
    expect(eventWrites()[0].values).toMatchObject({ status: "failed" });
    expect(eventWrites()[0].values.executedAt).toBeInstanceOf(Date);
    expect(scheduleWrites()).toEqual([
      expect.objectContaining({
        op: "update",
        inTransaction: true,
        values: expect.objectContaining({ isActive: false }),
      }),
    ]);
  });

  /**
   * A quote whose request timed out may already be live on X, with its id
   * never stored. The fast retry 15 minutes later posted it again (or hit a
   * duplicate-content 403, which paused the rule and left the orphan quote).
   */
  it("does not fast-retry a quote that got no answer from X", async () => {
    fixture.schedule.plugComment = "Still relevant";
    x.quote.mockRejectedValueOnce(
      Object.assign(new Error("Request timeout."), { type: "request" }),
    );
    const before = Date.now();

    await runRepostCron();

    const [closed, next] = eventWrites();
    expect(closed.values).toMatchObject({ status: "failed" });
    expect(next).toMatchObject({ op: "insert", inTransaction: true });
    const dueIn = (next.values.nextExecuteAt as Date).getTime() - before;
    expect(dueIn).toBeGreaterThanOrEqual(INTERVAL_HOURS * 3_600_000 - 1000);
    expect(scheduleWrites()).toEqual([]);
  });

  it("still fast-retries a plain retweet that got no answer", async () => {
    x.retweet.mockRejectedValueOnce(
      Object.assign(new Error("Request timeout."), { type: "request" }),
    );
    const before = Date.now();

    await runRepostCron();

    const next = eventWrites().find((w) => w.op === "insert");
    const dueIn = (next?.values.nextExecuteAt as Date).getTime() - before;
    expect(dueIn).toBeLessThanOrEqual(REPOST_RETRY_DELAY_MS + 1000);
  });

  it("pauses the rule when the account cannot sign requests", async () => {
    fixture.xPub = { ...fixture.xPub, encryptedRefreshToken: null };

    await runRepostCron();

    expect(x.retweet).not.toHaveBeenCalled();
    expect(eventWrites()[0].values.executedAt).toBeInstanceOf(Date);
    expect(scheduleWrites()[0].values).toMatchObject({ isActive: false });
  });

  it("pauses the rule when the X publication is gone", async () => {
    fixture.xPub = null;

    await runRepostCron();

    expect(eventWrites()[0].values).toMatchObject({ status: "failed" });
    expect(scheduleWrites()[0].values).toMatchObject({ isActive: false });
  });

  it("writes nothing more when another run already closed the event", async () => {
    fixture.eventStillPending = false;
    x.retweet.mockRejectedValueOnce(apiError(503));

    await runRepostCron();

    expect(writes.filter((w) => w.op === "insert")).toEqual([]);
    expect(scheduleWrites()).toEqual([]);
  });

  /**
   * X already accepted the quote; a database error afterwards must not be
   * booked as a failed run, or its retry would post the quote twice.
   */
  it("does not schedule a retry when X succeeded but a DB write failed", async () => {
    fixture.schedule.plugComment = "Still relevant";
    mockDb.transaction.mockImplementationOnce(() =>
      Promise.reject(new Error("connection reset")),
    );

    const result = await runRepostCron();

    expect(x.quote).toHaveBeenCalledTimes(1);
    // The success booking was the only transaction: no failed run follows it.
    expect(mockDb.transaction).toHaveBeenCalledTimes(1);
    expect(result.processed).toBe(0);
    expect(writes).toEqual([]);
  });
});

describe("runRepostCron success", () => {
  it("books the run, counts it and queues the next one in one transaction", async () => {
    const before = Date.now();
    const result = await runRepostCron();

    expect(result.processed).toBe(1);
    expect(writes.every((w) => w.inTransaction)).toBe(true);
    expect(eventWrites()[0]).toMatchObject({ op: "update", values: { status: "done" } });
    expect(eventWrites()[1]).toMatchObject({
      op: "insert",
      values: { scheduleId: SCHEDULE_ID, status: "pending" },
    });
    const dueIn = (eventWrites()[1].values.nextExecuteAt as Date).getTime() - before;
    expect(dueIn).toBeGreaterThanOrEqual(INTERVAL_HOURS * 3_600_000 - 1000);
    expect(dueIn).toBeLessThanOrEqual(INTERVAL_HOURS * 3_600_000 + 1000);
  });

  /**
   * The count and the active flag used to be written from the snapshot read at
   * the start of the run (`resurfacesDone: 2, isActive: true`). A run can last
   * minutes, so a pause the user made meanwhile was switched back on and the
   * next repost queued anyway. Both are now computed from the row as it is.
   */
  it("computes the count and the active flag from the current row", async () => {
    await runRepostCron();

    const { values } = scheduleWrites()[0];
    expect(sqlText(values.resurfacesDone)).toMatch(/\? \+ 1/);
    expect(sqlText(values.isActive)).toMatch(/\? and \? \+ 1 < \?/);
  });

  it("does not queue another repost when the rule was paused during the run", async () => {
    fixture.scheduleAfter = { isActive: false, intervalHours: INTERVAL_HOURS };

    const result = await runRepostCron();

    expect(result.processed).toBe(1);
    expect(eventWrites()[0].values).toMatchObject({ status: "done" });
    expect(writes.filter((w) => w.op === "insert")).toEqual([]);
  });

  it("does not queue another repost when the rule was deleted during the run", async () => {
    fixture.scheduleAfter = null;

    await runRepostCron();

    expect(writes.filter((w) => w.op === "insert")).toEqual([]);
  });

  it("spaces the next repost by the rule's current interval", async () => {
    fixture.scheduleAfter = { isActive: true, intervalHours: 2 };
    const before = Date.now();

    await runRepostCron();

    const next = writes.find((w) => w.op === "insert");
    const dueIn = (next?.values.nextExecuteAt as Date).getTime() - before;
    expect(dueIn).toBeGreaterThanOrEqual(2 * 3_600_000 - 1000);
    expect(dueIn).toBeLessThanOrEqual(2 * 3_600_000 + 1000);
  });

  it("writes nothing more when the event is no longer pending", async () => {
    fixture.eventStillPending = false;

    const result = await runRepostCron();

    expect(result.processed).toBe(0);
    expect(scheduleWrites()).toEqual([]);
    expect(writes.filter((w) => w.op === "insert")).toEqual([]);
  });
});

describe("runRepostCron plan gate", () => {
  const HOUR = 60 * 60 * 1000;

  /**
   * `subscriptionExpiresAt` is Dodo's next_billing_date, not the end of
   * access. Reading it as a hard expiry skipped every paying subscriber's
   * reposts from their billing date until the renewal webhook landed.
   */
  it("keeps reposting for a paid plan past the billing date while renewal is pending", async () => {
    fixture.sub.subscriptionExpiresAt = new Date(Date.now() - HOUR);

    const result = await runRepostCron();

    expect(x.retweet).toHaveBeenCalledTimes(1);
    expect(result.processed).toBe(1);
  });

  it("skips reposts once a cancelled plan reaches its period end", async () => {
    fixture.sub.subscriptionExpiresAt = new Date(Date.now() - HOUR);
    fixture.sub.subscriptionCancelAtPeriodEnd = true;

    await runRepostCron();

    expect(x.retweet).not.toHaveBeenCalled();
  });

  it("skips reposts once the renewal is overdue past the grace window", async () => {
    fixture.sub.subscriptionExpiresAt = new Date(Date.now() - 4 * 24 * HOUR);

    await runRepostCron();

    expect(x.retweet).not.toHaveBeenCalled();
  });
});
