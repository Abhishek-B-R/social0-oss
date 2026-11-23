/**
 * The fan-out dispatches platform jobs in parallel, a few at a time.
 *
 * It used to await each Cloudflare enqueue (an HTTP call with a 15 s timeout)
 * in series, so a post to nine accounts could hold the request for minutes,
 * and the first failure skipped every account after it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb, mockDispatch, mockLoadTargets, mockProgress, failedRows } = vi.hoisted(() => ({
  mockDb: { select: vi.fn(), update: vi.fn() },
  mockDispatch: vi.fn(),
  mockLoadTargets: vi.fn(),
  mockProgress: { initJob: vi.fn(), emit: vi.fn() },
  failedRows: [] as unknown[],
}));

vi.mock("../db/index.js", () => ({ db: mockDb }));
vi.mock("../lib/publish-load-targets.js", () => ({
  loadPublicationTargets: mockLoadTargets,
}));
vi.mock("../lib/publish-job-tracking.js", () => ({
  resolveJobProgressStore: vi.fn().mockResolvedValue(mockProgress),
  safeDbPublishTracking: vi.fn(),
}));
vi.mock("../services/publish-dispatch.js", () => ({
  assertPublishDispatchConfigured: vi.fn(),
  useCloudflarePublishDispatch: () => true,
  dispatchPlatformJob: mockDispatch,
}));
vi.mock("../publish/server-platform-jobs.js", () => ({
  startPlatformJobOnServer: vi.fn(),
}));
vi.mock("../publish/finalize-post.js", () => ({
  maybeFinalizePostPublish: vi.fn(),
}));

import {
  FAN_OUT_CONCURRENCY,
  prepareAndEnqueuePublish,
  PublishPartiallyDispatchedError,
} from "../services/publish-enqueue.js";

const TARGETS = ["linkedin", "facebook", "instagram", "threads", "youtube", "pinterest"].map(
  (platform, i) => ({ publicationId: `pub-${i}`, connectedAccountId: `acc-${i}`, platform }),
);

beforeEach(() => {
  vi.clearAllMocks();
  failedRows.length = 0;
  mockLoadTargets.mockResolvedValue(TARGETS);
  mockProgress.initJob.mockResolvedValue(undefined);
  mockProgress.emit.mockResolvedValue(undefined);
  mockDb.select.mockReturnValue({
    from: () => ({ where: () => ({ limit: async () => [{ status: "scheduled" }] }) }),
  });
  mockDb.update.mockImplementation(() => ({
    set: (values: { status?: string }) => ({
      where: (where: unknown) => ({
        returning: async () => [{ id: "post-1" }],
        then: (resolve: (v: unknown) => unknown) => {
          if (values.status === "failed") failedRows.push(where);
          return resolve(undefined);
        },
      }),
    }),
  }));
});

function publishNow() {
  return prepareAndEnqueuePublish(
    null,
    { postId: "post-1", userId: "user-1" },
    { priority: "now", trackingId: "track-1" },
  );
}

describe("parallel fan-out", () => {
  it("dispatches several jobs at once, never more than the cap", async () => {
    let inFlight = 0;
    let peak = 0;
    mockDispatch.mockImplementation(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 10));
      inFlight -= 1;
    });

    const result = await publishNow();

    expect(result.enqueued).toBe(TARGETS.length);
    expect(mockDispatch).toHaveBeenCalledTimes(TARGETS.length);
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(FAN_OUT_CONCURRENCY);
  });

  it("still dispatches the accounts after one that failed, and fails only that one", async () => {
    mockDispatch.mockImplementation(async (job: { platform: string }) => {
      if (job.platform === "facebook") throw new Error("worker timeout");
    });

    const err = await publishNow().catch((e: unknown) => e);

    expect(err).toBeInstanceOf(PublishPartiallyDispatchedError);
    expect(mockDispatch).toHaveBeenCalledTimes(TARGETS.length);
    // One "failed" write for the publication that never went out.
    expect(failedRows).toHaveLength(1);
  });

  it("does not fail a job that went out when its progress event cannot be written", async () => {
    mockDispatch.mockResolvedValue(undefined);
    // Only the per-platform "queued" event, written after each dispatch.
    mockProgress.emit.mockImplementation(async (event: { phase: string }) => {
      if (event.phase === "platform_queued") throw new Error("redis down");
    });

    const result = await publishNow();

    expect(result.enqueued).toBe(TARGETS.length);
    expect(failedRows).toHaveLength(0);
  });
});
