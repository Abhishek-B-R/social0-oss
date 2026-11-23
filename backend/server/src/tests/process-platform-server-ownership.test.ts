/**
 * A platform job that lost the publication claim did nothing, so it must not
 * report anything. `executePublish` hands the loser a "Publish already in
 * progress" result for a row another live run is uploading; the runner used to
 * record that as a platform failure, which wrote `failed` over the other run's
 * row, finalized the post failed (failure email, post.failed webhook) and put
 * a Retry on it that published the content a second time.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PublishPlatformJob } from "@social0/shared";

const { mockExecute, mockRecord, mockTrack, mockFinalize } = vi.hoisted(() => ({
  mockExecute: vi.fn(),
  mockRecord: vi.fn(),
  mockTrack: vi.fn(),
  mockFinalize: vi.fn(),
}));

vi.mock("../publish/execute-publish.js", () => ({
  executePublish: mockExecute,
}));
vi.mock("../lib/record-platform-result-server.js", () => ({
  recordPlatformResultServer: mockRecord,
  trackPlatformPhaseServer: mockTrack,
}));
vi.mock("../publish/finalize-post.js", () => ({
  maybeFinalizePostPublish: mockFinalize,
}));

import { runPlatformJobOnServer } from "../publish/process-platform-server.js";

const JOB = {
  trackingId: "track-1",
  postId: "post-1",
  userId: "user-1",
  publicationId: "pub-1",
  connectedAccountId: "acc-1",
  platform: "tiktok",
} as unknown as PublishPlatformJob;

beforeEach(() => {
  vi.resetAllMocks();
});

describe("runPlatformJobOnServer and the publication claim", () => {
  it("records nothing and leaves finalize to the owner when another run holds the row", async () => {
    mockExecute.mockResolvedValue({
      success: false,
      error: "tiktok: Publish already in progress",
      results: [
        {
          platform: "tiktok",
          connectedAccountId: "acc-1",
          status: "failed",
          error: "Publish already in progress",
          inProgressElsewhere: true,
        },
      ],
    });

    await runPlatformJobOnServer(null, JOB);

    expect(mockRecord).not.toHaveBeenCalled();
    expect(mockFinalize).not.toHaveBeenCalled();
  });

  it("still records a real platform failure and finalizes", async () => {
    mockExecute.mockResolvedValue({
      success: false,
      error: "tiktok: rejected",
      results: [
        {
          platform: "tiktok",
          connectedAccountId: "acc-1",
          status: "failed",
          error: "rejected",
        },
      ],
    });

    await runPlatformJobOnServer(null, JOB);

    expect(mockRecord).toHaveBeenCalledWith(null, JOB, false, "rejected");
    expect(mockFinalize).toHaveBeenCalledWith("post-1", "user-1");
  });

  it("still finalizes when recording a thrown publish's failure throws too", async () => {
    // The finalize below the catch-path record is the only step that sends the
    // failure email and webhook; a DB blip in the record used to skip it.
    mockExecute.mockRejectedValue(new Error("socket hang up"));
    mockRecord.mockRejectedValue(new Error("connection terminated"));
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(runPlatformJobOnServer(null, JOB)).resolves.toBeUndefined();

    expect(mockRecord).toHaveBeenCalledWith(null, JOB, false, "socket hang up");
    expect(mockFinalize).toHaveBeenCalledWith("post-1", "user-1");
    errorLog.mockRestore();
  });
});
