/**
 * A platform job that lost the publication claim (a redelivered queue message,
 * Publish now racing the cron) did nothing, so it must not report anything.
 * Recording its "Publish already in progress" result as a failure wrote
 * `failed` over the row another run was uploading, finalized the post failed
 * and offered a Retry that published it twice.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockExecute, mockFinalize, mockRecord } = vi.hoisted(() => ({
  mockExecute: vi.fn(),
  mockFinalize: vi.fn(),
  mockRecord: vi.fn(),
}));

vi.mock("../src/runtime/bootstrap", () => ({
  bootstrapWorkerRuntime: vi.fn(),
}));
vi.mock("../src/job-progress-db", () => ({
  recordPlatformResult: mockRecord,
  trackPlatformPhase: vi.fn(),
}));
vi.mock("../src/publish-concurrency", () => ({
  acquirePublishSlot: vi.fn().mockResolvedValue(null),
  MAX_SLOT_WAITS: 80,
}));
vi.mock("../../../backend/server/src/publish/execute-publish.js", () => ({
  executePublish: mockExecute,
}));
vi.mock("../../../backend/server/src/publish/finalize-post.js", () => ({
  maybeFinalizePostPublish: mockFinalize,
}));

import { processPlatformJob } from "../src/process-platform";
import type { PublishPlatformJob } from "../src/types";

const JOB: PublishPlatformJob = {
  postId: "11111111-1111-4111-8111-111111111111",
  userId: "u1",
  trackingId: "track-1",
  publicationId: "22222222-2222-4222-8222-222222222222",
  connectedAccountId: "33333333-3333-4333-8333-333333333333",
  platform: "youtube",
};

const ENV = {} as Env;

beforeEach(() => {
  mockExecute.mockReset();
  mockFinalize.mockReset();
  mockRecord.mockReset();
});

describe("processPlatformJob and the publication claim", () => {
  it("records nothing and leaves finalize to the owner when another run holds the row", async () => {
    mockExecute.mockResolvedValue({
      success: false,
      error: "youtube: Publish already in progress",
      results: [
        {
          platform: "youtube",
          connectedAccountId: JOB.connectedAccountId,
          status: "failed",
          error: "Publish already in progress",
          inProgressElsewhere: true,
        },
      ],
    });

    await processPlatformJob(JOB, ENV);

    expect(mockRecord).not.toHaveBeenCalled();
    expect(mockFinalize).not.toHaveBeenCalled();
  });

  it("still records a real platform failure and finalizes", async () => {
    mockExecute.mockResolvedValue({
      success: false,
      error: "youtube: quota exceeded",
      results: [
        {
          platform: "youtube",
          connectedAccountId: JOB.connectedAccountId,
          status: "failed",
          error: "quota exceeded",
        },
      ],
    });

    await processPlatformJob(JOB, ENV);

    expect(mockRecord).toHaveBeenCalledWith(
      ENV,
      JOB,
      false,
      "quota exceeded",
      { skipAuth: true },
    );
    expect(mockFinalize).toHaveBeenCalledWith(JOB.postId, JOB.userId);
  });
});
