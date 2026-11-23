/**
 * The publish semaphore takes its slot atomically, caps each account as well
 * as each platform, and makes a job wait instead of publishing over the cap.
 *
 * It used to read ZCARD and then ZADD in two calls (two isolates could both
 * take the last slot), had no per-account cap, and after ~9 s of waiting
 * published anyway.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockExecute, mockFinalize, mockRecord, mockTrack } = vi.hoisted(() => ({
  mockExecute: vi.fn(),
  mockFinalize: vi.fn(),
  mockRecord: vi.fn(),
  mockTrack: vi.fn(),
}));

vi.mock("../src/runtime/bootstrap", () => ({ bootstrapWorkerRuntime: vi.fn() }));
vi.mock("../src/db", () => ({
  openSql: vi.fn(async () => ({ end: vi.fn(async () => undefined) })),
  withSql: vi.fn(),
}));
vi.mock("../src/job-progress-db", () => ({
  recordPlatformResult: mockRecord,
  trackPlatformPhase: mockTrack,
}));
vi.mock("../src/validate-job", () => ({
  assertPublishJobAuthorized: vi.fn(async () => null),
  parsePublishPlatformJob: vi.fn(),
}));
vi.mock("../../../backend/server/src/publish/execute-publish.js", () => ({
  executePublish: mockExecute,
}));
vi.mock("../../../backend/server/src/publish/finalize-post.js", () => ({
  maybeFinalizePostPublish: mockFinalize,
}));

import {
  acquirePublishSlot,
  MAX_CONCURRENT_PUBLISHES_PER_ACCOUNT,
  MAX_SLOT_WAITS,
  PublishSlotBusyError,
  slotRetryDelaySeconds,
} from "../src/publish-concurrency";
import { processPlatformJob } from "../src/process-platform";
import worker from "../src/index";
import type { PublishPlatformJob } from "../src/types";

const JOB: PublishPlatformJob = {
  postId: "11111111-1111-4111-8111-111111111111",
  userId: "u1",
  trackingId: "track-1",
  publicationId: "22222222-2222-4222-8222-222222222222",
  connectedAccountId: "33333333-3333-4333-8333-333333333333",
  platform: "instagram",
};

type RedisCall = (string | number)[];
let redisCalls: RedisCall[];
let evalResult: number | Error;

beforeEach(() => {
  vi.clearAllMocks();
  redisCalls = [];
  evalResult = 1;
  process.env.UPSTASH_REDIS_REST_URL = "https://redis.test";
  process.env.UPSTASH_REDIS_REST_TOKEN = "token";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      const args = JSON.parse(String(init.body)) as RedisCall;
      redisCalls.push(args);
      if (args[0] === "EVAL") {
        if (evalResult instanceof Error) throw evalResult;
        return Response.json({ result: evalResult });
      }
      return Response.json({ result: 1 });
    }),
  );
  mockExecute.mockResolvedValue({
    success: true,
    results: [{ platform: "instagram", connectedAccountId: JOB.connectedAccountId, status: "published" }],
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("acquirePublishSlot", () => {
  it("checks and takes the platform and account slots in one script", async () => {
    const slot = await acquirePublishSlot(JOB);

    expect(slot).not.toBeNull();
    expect(redisCalls).toHaveLength(1);
    const [cmd, , numKeys, platformKey, accountKey] = redisCalls[0]!;
    expect(cmd).toBe("EVAL");
    expect(numKeys).toBe(2);
    expect(platformKey).toContain("instagram");
    expect(accountKey).toContain(JOB.connectedAccountId);
    // Same hash tag: the script stays in one cluster slot.
    expect(String(platformKey)).toContain("{slots}");
    expect(String(accountKey)).toContain("{slots}");
    expect(redisCalls[0]).toContain(MAX_CONCURRENT_PUBLISHES_PER_ACCOUNT);
  });

  it("releases both slots", async () => {
    const slot = await acquirePublishSlot(JOB);
    await slot!.release();

    const removes = redisCalls.filter((c) => c[0] === "ZREM");
    expect(removes.map((c) => c[1])).toEqual([redisCalls[0]![3], redisCalls[0]![4]]);
  });

  it("asks the caller to wait when a cap is full instead of publishing", async () => {
    evalResult = 0;

    const err = await acquirePublishSlot(JOB).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(PublishSlotBusyError);
    expect((err as PublishSlotBusyError).delaySeconds).toBeGreaterThanOrEqual(15);
  });

  it("publishes without a slot when Redis is failing", async () => {
    evalResult = new Error("connect ETIMEDOUT");
    expect(await acquirePublishSlot(JOB)).toBeNull();
  });

  it("publishes without a slot when Redis is the worker stub", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://worker-unused.example";
    expect(await acquirePublishSlot(JOB)).toBeNull();
    expect(redisCalls).toHaveLength(0);
  });

  it("jitters the wait between 15 and 30 seconds", () => {
    expect(slotRetryDelaySeconds(() => 0)).toBe(15);
    expect(slotRetryDelaySeconds(() => 0.999)).toBe(30);
  });
});

describe("processPlatformJob at capacity", () => {
  it("does not start or report anything when it has to wait", async () => {
    evalResult = 0;

    await expect(processPlatformJob(JOB, {} as Env)).rejects.toBeInstanceOf(PublishSlotBusyError);

    expect(mockExecute).not.toHaveBeenCalled();
    expect(mockTrack).not.toHaveBeenCalled();
    expect(mockRecord).not.toHaveBeenCalled();
  });

  it("stops waiting after MAX_SLOT_WAITS so a scheduled post still goes out", async () => {
    evalResult = 0;

    await processPlatformJob({ ...JOB, slotWaits: MAX_SLOT_WAITS }, {} as Env);

    expect(mockExecute).toHaveBeenCalledTimes(1);
    expect(redisCalls.filter((c) => c[0] === "EVAL")).toHaveLength(0);
  });
});

describe("queue consumer at capacity", () => {
  function message(body: PublishPlatformJob) {
    return { body, ack: vi.fn(), retry: vi.fn() };
  }

  function env(send = vi.fn(async () => undefined)) {
    return {
      PUBLISH_NOW_QUEUE: { send },
      PUBLISH_SCHEDULED_QUEUE: { send: vi.fn() },
    } as unknown as Env;
  }

  it("requeues the job with a delay and acks it without burning a retry", async () => {
    evalResult = 0;
    const msg = message(JOB);
    const e = env();

    await worker.queue!(
      { queue: "social0-publish-now", messages: [msg] } as unknown as MessageBatch,
      e
    );

    const send = (e.PUBLISH_NOW_QUEUE as unknown as { send: ReturnType<typeof vi.fn> }).send;
    expect(send).toHaveBeenCalledTimes(1);
    const [sent, opts] = send.mock.calls[0]! as [PublishPlatformJob, { delaySeconds: number }];
    expect(sent).toEqual({ ...JOB, slotWaits: 1 });
    expect(opts.delaySeconds).toBeGreaterThanOrEqual(15);
    expect(msg.ack).toHaveBeenCalledTimes(1);
    expect(msg.retry).not.toHaveBeenCalled();
    // Waiting is not a failure.
    expect(mockRecord).not.toHaveBeenCalled();
  });

  it("falls back to a delayed retry when the requeue send fails", async () => {
    evalResult = 0;
    const msg = message(JOB);

    await worker.queue!(
      { queue: "social0-publish-now", messages: [msg] } as unknown as MessageBatch,
      env(vi.fn(async () => {
        throw new Error("queue unavailable");
      }))
    );

    expect(msg.ack).not.toHaveBeenCalled();
    expect(msg.retry).toHaveBeenCalledWith({ delaySeconds: expect.any(Number) });
  });
});
