/**
 * `updateAndPublish` charges a draft one free post before it enqueues. When the
 * enqueue sends nothing and hands the post back as a draft, pressing Publish
 * again charges that same draft a second time — so that one charge goes back.
 * Every other failure keeps it: something is in flight, or the post was
 * failed and is retried for free.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb, mockEnqueue, mockReserve, mockRelease } = vi.hoisted(() => ({
  mockDb: { select: vi.fn(), transaction: vi.fn() },
  mockEnqueue: vi.fn(),
  mockReserve: vi.fn(),
  mockRelease: vi.fn(),
}));

const POST_ID = "11111111-1111-4111-8111-111111111111";
const ACCOUNT_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "user-1";

// posts.ts imports through the `@/` tsconfig alias, which vitest does not
// resolve (the build rewrites it with tsc-alias). Mock those ids as-is.
vi.mock("@/db", () => ({ db: mockDb }));
vi.mock("@/db/schema", () => import("../db/schema.js"));
vi.mock("@/lib/coerce-date.js", () => ({ coerceDate: vi.fn() }));
vi.mock("@/lib/stuck-publishing", () => import("../lib/stuck-publishing.js"));
vi.mock("@/lib/workspace/session", () => ({
  requireWorkspaceSession: vi.fn(async () => ({
    ok: true,
    ctx: {
      resourceUserId: USER_ID,
      actorUserId: USER_ID,
      workspaceId: null,
      permissions: new Set(["create_posts", "edit_posts"]),
    },
  })),
}));
vi.mock("@/lib/workspace/context", () => ({
  connectionScopeCondition: vi.fn(() => undefined),
  postScopeCondition: vi.fn(() => undefined),
}));
vi.mock("@/lib/queue-slot-validation", () => ({ userOwnsQueueSlot: vi.fn() }));
vi.mock("@/lib/posts-list/posts-list-data", () => ({
  getPostForEdit: vi.fn(),
  getPostMedia: vi.fn(),
  getQueuedSlotForPost: vi.fn(),
}));
vi.mock("@/lib/validation", () => import("@social0/shared/lib/validation"));
vi.mock("@/services/settings", () => ({ getUserSettingsSnapshot: vi.fn() }));
vi.mock("@/lib/bulk-auto-features-metadata", () => ({
  applyBulkAutoFeaturesToScheduledMetadata: vi.fn(),
}));
vi.mock("@/lib/post-metadata-sanitize", () => ({
  sanitizePostMetadata: vi.fn((m: unknown) => m),
}));
vi.mock("@/lib/post-account-refs", () => import("../lib/post-account-refs.js"));
vi.mock("@/lib/post-media-refs", async () => ({
  ...(await import("../lib/post-media-refs.js")),
  checkPostMediaOwnership: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/post-source", () => ({
  carryPostSource: vi.fn((m: unknown) => m),
  withPostSource: vi.fn((m: unknown) => m),
}));
vi.mock("@/lib/plan-limits", () => ({
  reserveFreePost: mockReserve,
  releaseFreePost: mockRelease,
}));
vi.mock("@/lib/post-lifecycle-webhooks", () => ({
  emitPostDeletedWebhook: vi.fn(),
  emitPostScheduledWebhook: vi.fn(),
}));
vi.mock("../services/enqueue.js", () => ({
  createPublishTrackingId: () => "track-1",
  enqueuePublishPostStandalone: mockEnqueue,
}));
// Loaded for the real `PublishNotDispatchedError`; nothing here runs it.
vi.mock("../db/index.js", () => ({ db: mockDb }));
vi.mock("../services/publish-dispatch.js", () => ({
  assertPublishDispatchConfigured: vi.fn(),
  useCloudflarePublishDispatch: () => true,
  dispatchPlatformJob: vi.fn(),
}));
vi.mock("../publish/process-platform-server.js", () => ({
  runPlatformJobOnServer: vi.fn(),
}));
vi.mock("../publish/finalize-post.js", () => ({
  maybeFinalizePostPublish: vi.fn(),
}));

import { updateAndPublish } from "../services/posts.js";
import { PublishNotDispatchedError } from "../services/publish-enqueue.js";

const RESERVATION = { allowed: true, consumed: true } as const;

/** A draft owned by the user, one owned account, and an edit that lands. */
function wireDraft() {
  mockDb.select.mockImplementation((columns: Record<string, unknown>) => ({
    from: () => ({
      where: async () =>
        "mediaIds" in columns
          ? [{ id: POST_ID, status: "draft", mediaIds: [], metadata: null }]
          : [{ id: ACCOUNT_ID, isActive: true }],
    }),
  }));
  const tx = {
    update: () => ({
      set: () => ({
        where: () => ({ returning: async () => [{ id: POST_ID }] }),
      }),
    }),
    delete: () => ({ where: async () => undefined }),
    insert: () => ({ values: async () => undefined }),
  };
  mockDb.transaction.mockImplementation(
    async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  );
}

function publish() {
  return updateAndPublish(POST_ID, "hello", [ACCOUNT_ID]);
}

beforeEach(() => {
  vi.clearAllMocks();
  wireDraft();
  mockReserve.mockResolvedValue(RESERVATION);
  mockRelease.mockResolvedValue(undefined);
});

describe("updateAndPublish free-post charge", () => {
  it("keeps the charge when the publish is queued", async () => {
    mockEnqueue.mockResolvedValue({ trackingId: "t-1", backend: "cloudflare" });

    const result = await publish();

    expect(result.success).toBe(true);
    expect(mockReserve).toHaveBeenCalledTimes(1);
    expect(mockRelease).not.toHaveBeenCalled();
  });

  it("refunds when nothing went out and the post is a draft again", async () => {
    mockEnqueue.mockRejectedValue(
      new PublishNotDispatchedError(new Error("publish worker unreachable"), "draft"),
    );

    const result = await publish();

    expect(result).toEqual({ success: false, error: "publish worker unreachable" });
    expect(mockRelease).toHaveBeenCalledWith(RESERVATION, USER_ID);
  });

  it("refunds when the publish never touched the draft", async () => {
    mockEnqueue.mockRejectedValue(
      new PublishNotDispatchedError(new Error("No publication targets"), "unchanged"),
    );

    await publish();

    expect(mockRelease).toHaveBeenCalledWith(RESERVATION, USER_ID);
  });

  it("keeps the charge when part of the fan-out went out", async () => {
    mockEnqueue.mockRejectedValue(new Error("publish worker timed out"));

    const result = await publish();

    expect(result.success).toBe(false);
    expect(mockRelease).not.toHaveBeenCalled();
  });

  it("keeps the charge when the post was failed (retried for free)", async () => {
    mockEnqueue.mockRejectedValue(
      new PublishNotDispatchedError(new Error("unreachable"), "failed"),
    );

    await publish();

    expect(mockRelease).not.toHaveBeenCalled();
  });

  it("keeps the charge when recovery could not say where the post went", async () => {
    mockEnqueue.mockRejectedValue(
      new PublishNotDispatchedError(new Error("unreachable"), null),
    );

    await publish();

    expect(mockRelease).not.toHaveBeenCalled();
  });
});
