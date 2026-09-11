import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb, mockDispatch, applied, post } = vi.hoisted(() => ({
  mockDb: { select: vi.fn(), update: vi.fn() },
  mockDispatch: vi.fn(),
  /** `status` of every UPDATE that matched a row, in order. */
  applied: [] as unknown[],
  post: { status: "scheduled", scheduledTimeHasPassed: true },
}));

vi.mock("../db/index.js", () => ({ db: mockDb }));
vi.mock("../lib/publish-load-targets.js", () => ({
  loadPublicationTargets: vi.fn().mockResolvedValue([
    { publicationId: "pub-1", connectedAccountId: "acc-1", platform: "linkedin" },
  ]),
}));
vi.mock("../lib/publish-job-tracking.js", () => ({
  resolveJobProgressStore: vi
    .fn()
    .mockResolvedValue({ initJob: vi.fn(), emit: vi.fn() }),
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

import { prepareAndEnqueuePublish } from "../services/publish-enqueue.js";

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
        // Only the failed-past-due update uses `.returning()`; its
        // `scheduled_at <= now()` condition is SQL, so the fixture decides.
        returning: async () => {
          if (!post.scheduledTimeHasPassed) return [];
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

describe("prepareAndEnqueuePublish when nothing could be dispatched", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wireDb();
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
});
