import { beforeEach, describe, expect, it, vi } from "vitest";

type Write = { table: unknown; values: Record<string, unknown> };

const { mockDb, x, fixture, writes, claim, release, workerEnv } = vi.hoisted(() => ({
  mockDb: { select: vi.fn(), update: vi.fn() },
  x: { singleTweet: vi.fn(), reply: vi.fn() },
  fixture: {
    plugs: [] as Record<string, unknown>[],
    /** The `limit()` the plug scan was called with. */
    limit: null as number | null,
    /** The owner's `user_settings` plan columns. */
    sub: {} as {
      subscriptionTier: string | null;
      subscriptionExpiresAt: Date | null;
      subscriptionCancelAtPeriodEnd: boolean | null;
    },
  },
  workerEnv: {} as {
    TWITTER_CONSUMER_KEY?: string;
    TWITTER_CONSUMER_SECRET?: string;
  },
  writes: [] as Write[],
  claim: vi.fn(),
  release: vi.fn(),
}));

vi.mock("../db/index.js", () => ({ db: mockDb }));
vi.mock("../lib/env.js", () => ({ env: workerEnv }));
vi.mock("../lib/claim-cron-work.js", () => ({
  claimCronWork: claim,
  releaseCronWork: release,
  autoPlugClaimKey: (id: string) => `claim:${id}`,
}));
vi.mock("@social0/shared", () => ({
  decryptToken: (value: string) => `plain:${value}`,
  logCronSkipped: vi.fn(),
  isActiveTier: (tier: string | null | undefined) =>
    tier === "creator" || tier === "agency" || tier === "starter" || tier === "growth" || tier === "pro" || tier === "max",
  getPlanLimits: (tier: string) => ({ allowAutoPlug: tier !== "free" }),
}));
vi.mock("twitter-api-v2", () => ({
  TwitterApi: class {
    v2 = x;
  },
}));

import { AUTOPLUG_BATCH_LIMIT, runAutoplugCron } from "../cron/autoplug-run.js";
import { autoPlugs } from "../db/schema.js";

const ACCOUNT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ACCOUNT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function plug(id: string, connectedAccountId = ACCOUNT_A) {
  return {
    id,
    connectedAccountId,
    platformPostId: `tweet-${id}`,
    metricType: "likes",
    metricThreshold: 10,
    plugComment: "Check this out",
    status: "watching",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  };
}

/** A drizzle chain that resolves to `rows` from whichever step is awaited. */
function chain(rows: unknown[]) {
  const builder: Record<string, unknown> = {};
  for (const step of ["from", "where", "orderBy"]) {
    builder[step] = () => builder;
  }
  builder.limit = (n: number) => {
    fixture.limit = n;
    return builder;
  };
  builder.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(rows).then(resolve, reject);
  return builder;
}

function wireDb() {
  writes.length = 0;
  mockDb.select.mockImplementation((columns?: Record<string, unknown>) => {
    if (columns && "subscriptionTier" in columns) {
      return chain([{ userId: "user-1", ...fixture.sub }]);
    }
    if (columns && "encryptedAccessToken" in columns) {
      return chain(
        [ACCOUNT_A, ACCOUNT_B].map((id) => ({
          id,
          userId: "user-1",
          encryptedAccessToken: "token",
          encryptedRefreshToken: "secret",
          platformUserId: "x-user",
        })),
      );
    }
    return chain(fixture.plugs);
  });
  mockDb.update.mockImplementation((table: unknown) => ({
    set: (values: Record<string, unknown>) => ({
      where: () => {
        writes.push({ table, values });
        return {
          returning: async () => [],
          then: (resolve: (v: unknown) => unknown) => Promise.resolve(undefined).then(resolve),
        };
      },
    }),
  }));
}

function apiError(code: number) {
  return Object.assign(new Error(`Request failed with code ${code}`), {
    type: "response",
    code,
  });
}

function requestError() {
  return Object.assign(new Error("Request timeout."), { type: "request" });
}

const statusWrites = () =>
  writes.filter(
    (w) => w.table === autoPlugs && "status" in w.values && w.values.status !== "expired",
  );

beforeEach(() => {
  vi.clearAllMocks();
  fixture.plugs = [];
  fixture.limit = null;
  fixture.sub = {
    subscriptionTier: "pro",
    subscriptionExpiresAt: null,
    subscriptionCancelAtPeriodEnd: false,
  };
  workerEnv.TWITTER_CONSUMER_KEY = "app-key";
  workerEnv.TWITTER_CONSUMER_SECRET = "app-secret";
  claim.mockResolvedValue(true);
  release.mockResolvedValue(undefined);
  x.singleTweet.mockResolvedValue({ data: { public_metrics: { like_count: 0 } } });
  x.reply.mockResolvedValue({ data: { id: "reply-1" } });
  wireDb();
});

describe("runAutoplugCron", () => {
  /**
   * Every exception used to flip the plug to `failed`, and the scan only
   * selects `watching`, so one X 503 or 429 ended the plug for good.
   */
  it.each([
    ["a rate limit", apiError(429)],
    ["an X server error", apiError(503)],
    ["a timeout", requestError()],
  ])("keeps watching a plug after %s on the read", async (_label, err) => {
    fixture.plugs = [plug("p1")];
    x.singleTweet.mockRejectedValue(err);

    await runAutoplugCron();

    expect(statusWrites()).toEqual([]);
  });

  it.each([
    ["a revoked token", apiError(401)],
    ["a deleted tweet", apiError(404)],
  ])("fails a plug on %s", async (_label, err) => {
    fixture.plugs = [plug("p1")];
    x.singleTweet.mockRejectedValue(err);

    await runAutoplugCron();

    expect(statusWrites().map((w) => w.values.status)).toEqual(["failed"]);
  });

  it("stops checking an account's other plugs once X rate-limits it", async () => {
    fixture.plugs = [plug("p1"), plug("p2"), plug("p3", ACCOUNT_B)];
    x.singleTweet.mockRejectedValueOnce(apiError(429));

    const result = await runAutoplugCron();

    // p1 hit the limit, p2 (same account) is skipped, p3 (other account) runs.
    expect(x.singleTweet).toHaveBeenCalledTimes(2);
    expect(x.singleTweet.mock.calls.map((c) => c[0])).toEqual(["tweet-p1", "tweet-p3"]);
    expect(result.checked).toBe(2);
    expect(statusWrites()).toEqual([]);
  });

  it("retries the reply later, with the claim handed back, when X refuses it", async () => {
    fixture.plugs = [plug("p1")];
    x.singleTweet.mockResolvedValue({ data: { public_metrics: { like_count: 50 } } });
    x.reply.mockRejectedValue(apiError(429));

    await runAutoplugCron();

    expect(statusWrites()).toEqual([]);
    expect(release).toHaveBeenCalledWith("claim:p1");
  });

  /** No answer: the reply may be live, and a retry could post it twice. */
  it("fails, rather than retries, a reply that got no answer", async () => {
    fixture.plugs = [plug("p1")];
    x.singleTweet.mockResolvedValue({ data: { public_metrics: { like_count: 50 } } });
    x.reply.mockRejectedValue(requestError());

    await runAutoplugCron();

    expect(statusWrites().map((w) => w.values.status)).toEqual(["failed"]);
    expect(release).not.toHaveBeenCalled();
  });

  it("posts the plug and marks it triggered at the threshold", async () => {
    fixture.plugs = [plug("p1")];
    x.singleTweet.mockResolvedValue({ data: { public_metrics: { like_count: 10 } } });

    const result = await runAutoplugCron();

    expect(result.triggered).toBe(1);
    expect(statusWrites().map((w) => w.values)).toContainEqual(
      expect.objectContaining({ status: "triggered", plugTweetId: "reply-1" }),
    );
  });

  /**
   * The scan had no limit, one X call per plug, all on the scheduler slot that
   * publish-scheduled also needs. It is bounded now, and the batch is stamped
   * so the next run starts with the plugs this one did not reach.
   */
  it("checks a bounded batch and stamps it so the backlog rotates", async () => {
    fixture.plugs = [plug("p1"), plug("p2")];

    await runAutoplugCron();

    expect(fixture.limit).toBe(AUTOPLUG_BATCH_LIMIT);
    const stamp = writes.find(
      (w) => w.table === autoPlugs && !("status" in w.values) && "updatedAt" in w.values,
    );
    expect(stamp).toBeDefined();
  });

  /**
   * The keys are optional in the worker's env, and a missing one used to be
   * treated like a broken account: every watching plug was failed within a
   * few runs, and restoring the key brought none of them back.
   */
  it.each([
    ["key", "TWITTER_CONSUMER_KEY" as const],
    ["secret", "TWITTER_CONSUMER_SECRET" as const],
  ])("holds plugs, rather than failing them, when the app %s is missing", async (_l, name) => {
    fixture.plugs = [plug("p1"), plug("p2", ACCOUNT_B)];
    delete workerEnv[name];

    const result = await runAutoplugCron();

    expect(statusWrites()).toEqual([]);
    expect(x.singleTweet).not.toHaveBeenCalled();
    expect(result.checked).toBe(0);
    // Not stamped either, so the plugs keep their place in the rotation.
    const stamp = writes.find(
      (w) => w.table === autoPlugs && !("status" in w.values) && "updatedAt" in w.values,
    );
    expect(stamp).toBeUndefined();
  });
});

describe("runAutoplugCron plan gate", () => {
  const HOUR = 60 * 60 * 1000;

  /**
   * `subscriptionExpiresAt` is Dodo's next_billing_date. Reading it as a hard
   * expiry skipped every paying subscriber's plugs from their billing date
   * until the renewal webhook landed, while the API still treated them as paid.
   */
  it("keeps watching a paid plan's plugs past the billing date while renewal is pending", async () => {
    fixture.plugs = [plug("p1")];
    fixture.sub.subscriptionExpiresAt = new Date(Date.now() - HOUR);

    await runAutoplugCron();

    expect(x.singleTweet).toHaveBeenCalledTimes(1);
  });

  it("skips plugs once a cancelled plan reaches its period end", async () => {
    fixture.plugs = [plug("p1")];
    fixture.sub.subscriptionExpiresAt = new Date(Date.now() - HOUR);
    fixture.sub.subscriptionCancelAtPeriodEnd = true;

    await runAutoplugCron();

    expect(x.singleTweet).not.toHaveBeenCalled();
  });

  it("skips plugs once the renewal is overdue past the grace window", async () => {
    fixture.plugs = [plug("p1")];
    fixture.sub.subscriptionExpiresAt = new Date(Date.now() - 4 * 24 * HOUR);

    await runAutoplugCron();

    expect(x.singleTweet).not.toHaveBeenCalled();
  });
});
