/**
 * A publish the platform rate limited (429) is retried with backoff through
 * the queue, instead of being acked as a failure. Nothing is recorded or
 * finalized for an attempt that will be retried, and the row goes back to
 * `pending`, so the failure email and `post.failed` webhook only go out once
 * the retries are spent. A 5xx is never retried: the post may already exist.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockExecute, mockFinalize, mockRecord, mockTrack } = vi.hoisted(() => ({
  mockExecute: vi.fn(),
  mockFinalize: vi.fn(),
  mockRecord: vi.fn(),
  mockTrack: vi.fn(async () => undefined),
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
vi.mock("../src/publish-concurrency", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/publish-concurrency")>()),
  acquirePublishSlot: vi.fn().mockResolvedValue(null),
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

import { withSql } from "../src/db";
import { processPlatformJob, PublishRetryLaterError } from "../src/process-platform";
import worker from "../src/index";
import type { PublishPlatformJob } from "../src/types";

const JOB: PublishPlatformJob = {
  postId: "11111111-1111-4111-8111-111111111111",
  userId: "u1",
  trackingId: "track-1",
  publicationId: "22222222-2222-4222-8222-222222222222",
  connectedAccountId: "33333333-3333-4333-8333-333333333333",
  platform: "threads",
};

function failsWith(error: string) {
  mockExecute.mockResolvedValue({
    success: false,
    error: `threads: ${error}`,
    results: [
      { platform: "threads", connectedAccountId: JOB.connectedAccountId, status: "failed", error },
    ],
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("processPlatformJob retries", () => {
  it("asks for a retry on a 429 without recording or finalizing", async () => {
    failsWith("HTTP 429");

    const err = await processPlatformJob(JOB, {} as Env, 1).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(PublishRetryLaterError);
    expect((err as PublishRetryLaterError).delaySeconds).toBe(30);
    expect(mockRecord).not.toHaveBeenCalled();
    expect(mockFinalize).not.toHaveBeenCalled();
    // Back to `pending`, so another platform's finalize waits for this retry.
    expect(withSql).toHaveBeenCalledTimes(1);
  });

  it("backs off on later attempts", async () => {
    failsWith("Too Many Requests");
    const err = await processPlatformJob(JOB, {} as Env, 3).catch((e: unknown) => e);
    expect((err as PublishRetryLaterError).delaySeconds).toBe(120);
  });

  it("fails and finalizes once the retries are spent", async () => {
    failsWith("HTTP 429");

    await processPlatformJob(JOB, {} as Env, 4);

    expect(mockRecord).toHaveBeenCalledWith(expect.anything(), JOB, false, "HTTP 429", {
      skipAuth: true,
    });
    expect(mockFinalize).toHaveBeenCalledTimes(1);
  });

  it.each(["HTTP 400", "HTTP 401", "HTTP 500", "HTTP 502", "HTTP 503", "fetch failed"])(
    "fails %j at once without retrying",
    async (error) => {
      failsWith(error);

      await processPlatformJob(JOB, {} as Env, 1);

      expect(mockRecord).toHaveBeenCalledTimes(1);
      expect(mockFinalize).toHaveBeenCalledTimes(1);
      expect(withSql).not.toHaveBeenCalled();
    },
  );
});

describe("queue consumer retries", () => {
  it("retries the message with the backoff delay instead of acking it", async () => {
    failsWith("HTTP 429");
    const msg = { body: JOB, attempts: 2, ack: vi.fn(), retry: vi.fn() };

    await worker.queue!(
      { queue: "social0-publish-now", messages: [msg] } as unknown as MessageBatch,
      {} as Env
    );

    expect(msg.retry).toHaveBeenCalledWith({ delaySeconds: 60 });
    expect(msg.ack).not.toHaveBeenCalled();
    expect(mockRecord).not.toHaveBeenCalled();
  });

  it("still acks a publish that failed for good", async () => {
    failsWith("HTTP 400");
    const msg = { body: JOB, attempts: 1, ack: vi.fn(), retry: vi.fn() };

    await worker.queue!(
      { queue: "social0-publish-now", messages: [msg] } as unknown as MessageBatch,
      {} as Env
    );

    expect(msg.ack).toHaveBeenCalledTimes(1);
    expect(msg.retry).not.toHaveBeenCalled();
  });
});
