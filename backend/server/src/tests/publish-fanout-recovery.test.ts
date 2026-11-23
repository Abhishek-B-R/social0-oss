import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockDb,
  mockDispatch,
  mockFinalize,
  mockLoadTargets,
  mockProgress,
  applied,
  post,
} = vi.hoisted(() => ({
  mockDb: { select: vi.fn(), update: vi.fn() },
  mockDispatch: vi.fn(),
  mockFinalize: vi.fn(),
  mockLoadTargets: vi.fn(),
  mockProgress: { initJob: vi.fn(), emit: vi.fn() },
  /** `status` of every UPDATE that matched a row, in order. */
  applied: [] as unknown[],
  post: { status: "scheduled", scheduledTimeHasPassed: true },
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
vi.mock("../publish/process-platform-server.js", () => ({
  runPlatformJobOnServer: vi.fn(),
}));
vi.mock("../publish/finalize-post.js", () => ({
  maybeFinalizePostPublish: mockFinalize,
}));

import {
  prepareAndEnqueuePublish,
  PublishNotDispatchedError,
  PublishPartiallyDispatchedError,
} from "../services/publish-enqueue.js";

const LINKEDIN = {
  publicationId: "pub-1",
  connectedAccountId: "acc-1",
  platform: "linkedin",
};
const PINTEREST = {
  publicationId: "pub-2",
  connectedAccountId: "acc-2",
  platform: "pinterest",
};

function wireDb() {
  applied.length = 0;
  mockDb.select.mockReturnValue({
    from: () => ({
      where: () => ({ limit: async () => [{ status: post.status }] }),
    }),
  });
  mockDb.update.mockImplementation(() => ({
    set: (values: { status?: unknown }) => ({
      where: () => ({
        // The failed-past-due update's `scheduled_at <= now()` condition is
        // SQL, so the fixture decides whether it matches.
        returning: async () => {
          if (values.status === "failed" && !post.scheduledTimeHasPassed) {
            return [];
          }
          applied.push(values.status);
          return [{ id: "post-1" }];
        },
        then: (resolve: (v: unknown) => unknown) => {
          applied.push(values.status);
          return resolve(undefined);
        },
      }),
    }),
  }));
}

function publishNow() {
  return prepareAndEnqueuePublish(
    null,
    { postId: "post-1", userId: "user-1" },
    { priority: "now", trackingId: "track-1" },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  wireDb();
  mockLoadTargets.mockResolvedValue([LINKEDIN]);
  mockProgress.initJob.mockResolvedValue(undefined);
  mockProgress.emit.mockResolvedValue(undefined);
  mockFinalize.mockResolvedValue(undefined);
});

describe("prepareAndEnqueuePublish when nothing could be dispatched", () => {
  beforeEach(() => {
    mockDispatch.mockRejectedValue(new Error("publish worker unreachable"));
  });

  /**
   * "Publish now" and "Post again" create the post as `scheduled` at the
   * current time, and the caller turns this throw into "please try again".
   * Handing that post back as `scheduled` let the cron publish it minutes
   * later anyway, so taking the advice posted it twice.
   */
  it("fails a post whose scheduled time has passed instead of leaving it for the cron", async () => {
    post.status = "scheduled";
    post.scheduledTimeHasPassed = true;

    await expect(publishNow()).rejects.toThrow("publish worker unreachable");
    expect(applied).toEqual(["publishing", "failed"]);
  });

  it("hands a post scheduled for later back to its schedule", async () => {
    post.status = "scheduled";
    post.scheduledTimeHasPassed = false;

    await expect(publishNow()).rejects.toThrow("publish worker unreachable");
    expect(applied).toEqual(["publishing", "scheduled"]);
  });

  it("returns a draft to drafts", async () => {
    post.status = "draft";
    post.scheduledTimeHasPassed = false;

    await expect(publishNow()).rejects.toThrow("publish worker unreachable");
    expect(applied).toEqual(["publishing", "draft"]);
  });

  /**
   * `updateAndPublish` charged the draft a free post, and pressing Publish
   * again on the draft charges it again. It can only refund when it is told
   * that nothing went out and where the post ended up.
   */
  it("tells the caller nothing went out and the post is a draft again", async () => {
    post.status = "draft";
    post.scheduledTimeHasPassed = false;

    const err = await publishNow().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PublishNotDispatchedError);
    expect((err as PublishNotDispatchedError).postStatus).toBe("draft");
    expect((err as Error).message).toBe("publish worker unreachable");
  });

  it("reports a post it failed as failed, not as a draft", async () => {
    post.status = "scheduled";
    post.scheduledTimeHasPassed = true;

    const err = await publishNow().catch((e: unknown) => e);
    expect((err as PublishNotDispatchedError).postStatus).toBe("failed");
  });

  it("reports a post with nothing to publish to as untouched", async () => {
    mockLoadTargets.mockResolvedValue([]);

    const err = await publishNow().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PublishNotDispatchedError);
    expect((err as PublishNotDispatchedError).postStatus).toBe("unchanged");
    expect(applied).toEqual([]);
  });

  /**
   * Tracking setup runs after the post is claimed. A Redis blip there used to
   * throw past the recovery and leave the post `publishing` for an hour.
   */
  it("hands the post back when progress tracking cannot start", async () => {
    post.status = "draft";
    post.scheduledTimeHasPassed = false;
    mockProgress.initJob.mockRejectedValue(new Error("redis down"));

    await expect(publishNow()).rejects.toThrow("redis down");
    expect(mockDispatch).not.toHaveBeenCalled();
    expect(applied).toEqual(["publishing", "draft"]);
  });
});

describe("prepareAndEnqueuePublish when the fan-out fails part way", () => {
  beforeEach(() => {
    post.status = "draft";
    post.scheduledTimeHasPassed = false;
    mockLoadTargets.mockResolvedValue([LINKEDIN, PINTEREST]);
    mockDispatch
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("publish worker timed out"));
  });

  /**
   * The job that went out can finish before the next dispatch fails, and its
   * finalize saw the undispatched row still `pending`. Without a finalize here
   * nothing ever finalizes the post: it sat in `publishing` for an hour with
   * no failure email or webhook, its queue slot stuck in `processing`.
   */
  it("fails what never left and finalizes the post", async () => {
    const err = await publishNow().catch((e: unknown) => e);

    expect((err as Error).message).toBe("publish worker timed out");
    // Something is in flight: not a "nothing went out" failure, so no caller
    // refunds or retries it.
    expect(err).not.toBeInstanceOf(PublishNotDispatchedError);
    // Typed, so `/v1` can hand back the job instead of a 500 that sent
    // clients to resubmit to the accounts already reached.
    expect(err).toBeInstanceOf(PublishPartiallyDispatchedError);
    expect((err as PublishPartiallyDispatchedError).dispatched).toBe(1);
    expect((err as PublishPartiallyDispatchedError).total).toBe(2);
    // Claimed, then only the undispatched publication failed; the post stays
    // `publishing` for finalize to settle.
    expect(applied).toEqual(["publishing", "failed"]);
    expect(mockFinalize).toHaveBeenCalledWith("post-1", "user-1");
  });

  it("still rethrows the dispatch failure when finalize itself fails", async () => {
    mockFinalize.mockRejectedValue(new Error("db down"));

    await expect(publishNow()).rejects.toThrow("publish worker timed out");
  });
});
