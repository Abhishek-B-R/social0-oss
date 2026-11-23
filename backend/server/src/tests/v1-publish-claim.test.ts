/**
 * `POST /v1/posts/:id/publish` retried by a CLI or MCP client after a timeout
 * must not fan the post out a second time while its first fan-out is still
 * queued or running — that re-dispatched the same deliveries and, with the
 * worker's parallel consumers, posted them twice.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb, mockEnqueue, mockReserve, mockRelease, errors } = vi.hoisted(() => {
  class PostClaimLostError extends Error {
    constructor(postId: string, expectedStatus: string) {
      super(`Post ${postId} is no longer ${expectedStatus}`);
    }
  }
  class PublishNotDispatchedError extends Error {
    constructor(
      message: string,
      readonly postStatus: "draft" | "scheduled" | "failed" | "unchanged" | null,
    ) {
      super(message);
    }
  }
  class PublishPartiallyDispatchedError extends Error {}
  return {
    mockDb: { select: vi.fn() },
    mockEnqueue: vi.fn(),
    mockReserve: vi.fn(),
    mockRelease: vi.fn(),
    errors: { PostClaimLostError, PublishNotDispatchedError, PublishPartiallyDispatchedError },
  };
});

vi.mock("../db/index.js", () => ({ db: mockDb }));
vi.mock("@/lib/coerce-date.js", () => ({ coerceDate: vi.fn() }));
vi.mock("../lib/plan-limits.js", () => ({
  reserveFreePost: mockReserve,
  releaseFreePost: mockRelease,
}));
vi.mock("../lib/posts-list/posts-list-data.js", () => ({}));
vi.mock("../lib/token-refresh.js", () => ({}));
vi.mock("../lib/post-lifecycle-webhooks.js", () => ({}));
vi.mock("../lib/post-account-refs.js", () => ({}));
vi.mock("../lib/post-media-refs.js", () => ({}));
vi.mock("../services/enqueue.js", () => ({
  createPublishTrackingId: () => "track-1",
  enqueuePublishPost: mockEnqueue,
}));
vi.mock("../services/publish-enqueue.js", () => errors);

import {
  V1_PARTIAL_FAN_OUT_WARNING,
  V1_PUBLISH_NOT_DISPATCHED_ERROR,
  v1PublishPost,
} from "../services/v1-posts.js";

const { PostClaimLostError, PublishNotDispatchedError, PublishPartiallyDispatchedError } =
  errors;

const POST_ID = "55555555-5555-4555-8555-555555555555";
const USER_ID = "user_1";
const app = {} as Parameters<typeof v1PublishPost>[0];

function postWithStatus(status: string) {
  mockDb.select.mockReturnValue({
    from: () => ({
      where: () => ({ limit: async () => [{ id: POST_ID, status }] }),
    }),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mockReserve.mockResolvedValue({ allowed: true, consumed: true });
  mockRelease.mockResolvedValue(undefined);
  mockEnqueue.mockResolvedValue({ id: "track-1", backend: "cloudflare", enqueued: 1 });
});

describe("v1PublishPost", () => {
  it("refuses a post that is already publishing without enqueueing", async () => {
    postWithStatus("publishing");

    const result = await v1PublishPost(app, USER_ID, POST_ID);

    expect(result).toEqual({ ok: false, error: "Post is already publishing" });
    expect(mockEnqueue).not.toHaveBeenCalled();
    expect(mockReserve).not.toHaveBeenCalled();
  });

  it("refunds a draft's free post when another request claimed it first", async () => {
    postWithStatus("draft");
    mockEnqueue.mockRejectedValue(new PostClaimLostError(POST_ID, "draft"));

    const result = await v1PublishPost(app, USER_ID, POST_ID);

    expect(result).toEqual({ ok: false, error: "Post is already publishing" });
    expect(mockRelease).toHaveBeenCalledWith(
      { allowed: true, consumed: true },
      USER_ID,
    );
  });

  it("queues a scheduled post", async () => {
    postWithStatus("scheduled");

    const result = await v1PublishPost(app, USER_ID, POST_ID);

    expect(result).toMatchObject({ ok: true, tracking_id: "track-1" });
    expect(mockEnqueue).toHaveBeenCalledTimes(1);
  });

  /**
   * A server-side X/TikTok job had already started when the next platform's
   * CF enqueue failed. This used to answer 500; the client (and
   * `POST /v1/posts/publish`'s retry, which creates a new post) then published
   * again to the accounts the first attempt had reached.
   */
  it("hands back the job with a warning after a partial fan-out, keeping the charge", async () => {
    postWithStatus("draft");
    mockEnqueue.mockRejectedValue(
      new PublishPartiallyDispatchedError("CF publish enqueue failed: 502"),
    );

    const result = await v1PublishPost(app, USER_ID, POST_ID);

    expect(result).toEqual({
      ok: true,
      tracking_id: "track-1",
      status: "queued",
      stream_url: "/v1/jobs/track-1/stream",
      warning: V1_PARTIAL_FAN_OUT_WARNING,
    });
    expect(mockRelease).not.toHaveBeenCalled();
  });

  it("refunds a draft and reports a retryable failure when nothing went out", async () => {
    postWithStatus("draft");
    mockEnqueue.mockRejectedValue(
      new PublishNotDispatchedError("publish worker unreachable", "draft"),
    );

    const result = await v1PublishPost(app, USER_ID, POST_ID);

    expect(result).toEqual({
      ok: false,
      error: V1_PUBLISH_NOT_DISPATCHED_ERROR,
      unavailable: true,
    });
    expect(mockRelease).toHaveBeenCalledWith(
      { allowed: true, consumed: true },
      USER_ID,
    );
  });

  it("refunds a draft that was left untouched (dispatch not configured)", async () => {
    postWithStatus("draft");
    mockEnqueue.mockRejectedValue(
      new PublishNotDispatchedError("CF publish not configured", "unchanged"),
    );

    const result = await v1PublishPost(app, USER_ID, POST_ID);

    expect(result).toMatchObject({ ok: false, unavailable: true });
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });

  it("refunds a draft with nothing to publish to and reports it as not publishable", async () => {
    postWithStatus("draft");
    mockEnqueue.mockRejectedValue(
      new PublishNotDispatchedError(`No publication targets for post ${POST_ID}`, "unchanged"),
    );

    const result = await v1PublishPost(app, USER_ID, POST_ID);

    expect(result).toEqual({ ok: false, error: "Post not found or not publishable" });
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });

  it("charges nothing back for a post that was failed rather than handed back", async () => {
    postWithStatus("scheduled");
    mockEnqueue.mockRejectedValue(
      new PublishNotDispatchedError("publish worker unreachable", "failed"),
    );

    const result = await v1PublishPost(app, USER_ID, POST_ID);

    expect(result).toMatchObject({ ok: false, unavailable: true });
    expect(mockReserve).not.toHaveBeenCalled();
    expect(mockRelease).not.toHaveBeenCalled();
  });

  it("still throws an error it cannot place", async () => {
    postWithStatus("draft");
    mockEnqueue.mockRejectedValue(new Error("db down"));

    await expect(v1PublishPost(app, USER_ID, POST_ID)).rejects.toThrow("db down");
  });
});
