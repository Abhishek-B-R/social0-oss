import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb, mockDispatch, state } = vi.hoisted(() => ({
  mockDb: { select: vi.fn(), update: vi.fn() },
  mockDispatch: vi.fn(),
  state: {
    /** Whether the conditional `status = 'draft'` claim matches the row. */
    stillDraft: true,
    claims: 0,
  },
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
vi.mock("../publish/finalize-post.js", () => ({
  maybeFinalizePostPublish: vi.fn(),
}));

import {
  PostClaimLostError,
  prepareAndEnqueuePublish,
} from "../services/publish-enqueue.js";

function wireDb() {
  state.claims = 0;
  mockDb.select.mockReturnValue({
    from: () => ({
      where: () => ({ limit: async () => [{ status: "draft" }] }),
    }),
  });
  mockDb.update.mockImplementation(() => ({
    set: () => ({
      where: () => ({
        returning: async () => {
          if (!state.stillDraft) return [];
          state.claims += 1;
          return [{ id: "post-1" }];
        },
        then: (resolve: (v: unknown) => unknown) => resolve(undefined),
      }),
    }),
  }));
}

function publishDraft() {
  return prepareAndEnqueuePublish(
    null,
    { postId: "post-1", userId: "user-1" },
    { priority: "now", trackingId: "track-1", onlyFromStatus: "draft" },
  );
}

/**
 * `POST /api/publish` charges a free post for publishing a draft. The claim
 * is what makes that charge hold: two racing requests both pay, and only the
 * one that moves the draft may publish it.
 */
describe("prepareAndEnqueuePublish with onlyFromStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.stillDraft = true;
    wireDb();
    mockDispatch.mockResolvedValue(undefined);
  });

  it("claims the draft and dispatches it", async () => {
    const result = await publishDraft();

    expect(result.enqueued).toBe(1);
    expect(state.claims).toBe(1);
    expect(mockDispatch).toHaveBeenCalledTimes(1);
  });

  it("dispatches nothing when the post stopped being a draft", async () => {
    state.stillDraft = false;

    await expect(publishDraft()).rejects.toBeInstanceOf(PostClaimLostError);
    expect(mockDispatch).not.toHaveBeenCalled();
  });
});
