/**
 * `PATCH /v1/posts/:id`, `POST /v1/posts/:id/schedule` and
 * `DELETE /v1/posts/:id` read the post's status, then write. The scheduled
 * cron can claim the post (`scheduled` -> `publishing`) in between, so each
 * write re-checks the status it read, as the dashboard's twins do: a lost race
 * must not delete the in-flight publication rows, reset a publishing post to
 * `scheduled`, or delete it out from under its deliveries.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb, mockTx, mockReserve, mockRelease, mockScheduledWebhook, mockDeletedWebhook } =
  vi.hoisted(() => ({
    mockDb: { select: vi.fn(), update: vi.fn(), transaction: vi.fn() },
    mockTx: {
      select: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      insert: vi.fn(),
    },
    mockReserve: vi.fn(),
    mockRelease: vi.fn(),
    mockScheduledWebhook: vi.fn(),
    mockDeletedWebhook: vi.fn(),
  }));

vi.mock("../db/index.js", () => ({ db: mockDb }));
vi.mock("@/lib/coerce-date.js", () => ({
  coerceDate: (v: unknown) => (typeof v === "string" ? new Date(v) : null),
}));
vi.mock("../lib/plan-limits.js", () => ({
  reserveFreePost: mockReserve,
  releaseFreePost: mockRelease,
}));
vi.mock("../lib/posts-list/posts-list-data.js", () => ({}));
vi.mock("../lib/token-refresh.js", () => ({}));
vi.mock("../lib/post-lifecycle-webhooks.js", () => ({
  emitPostScheduledWebhook: mockScheduledWebhook,
  emitPostDeletedWebhook: mockDeletedWebhook,
}));
vi.mock("../lib/post-account-refs.js", () => ({
  checkSelectedAccounts: () => ({ ok: true }),
  SELECTED_ACCOUNT_OVER_PLAN_LIMIT_ERROR: "over limit",
}));
vi.mock("../lib/post-media-refs.js", () => ({}));
vi.mock("../services/enqueue.js", () => ({}));
vi.mock("../services/publish-enqueue.js", () => ({
  PostClaimLostError: class PostClaimLostError extends Error {},
}));

import { v1DeletePost, v1SchedulePost, v1UpdateDraft } from "../services/v1-posts.js";

const POST_ID = "55555555-5555-4555-8555-555555555555";
const ACCOUNT_ID = "66666666-6666-4666-8666-666666666666";
const USER_ID = "user_1";
const SCOPE = { userId: USER_ID, workspaceId: null, actorUserId: USER_ID };

/** Each `db.select()` resolves to the next result, awaited or via `.limit()`. */
function queueSelects(...results: unknown[][]) {
  for (const rows of results) {
    mockDb.select.mockImplementationOnce(() => ({
      from: () => ({
        where: () => Object.assign(Promise.resolve(rows), { limit: async () => rows }),
      }),
    }));
  }
}

/** The status-guarded `update ... returning` matches `rows`. */
function updateReturns(target: { update: ReturnType<typeof vi.fn> }, rows: unknown[]) {
  const where = vi.fn(() => ({ returning: async () => rows }));
  const set = vi.fn(() => ({ where }));
  target.update.mockReturnValue({ set });
  return { set, where };
}

function lockReturns(rows: unknown[]) {
  mockTx.select.mockReturnValue({
    from: () => ({ where: () => ({ for: async () => rows }) }),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mockDb.transaction.mockImplementation(async (fn: (tx: typeof mockTx) => unknown) =>
    fn(mockTx),
  );
  mockTx.delete.mockReturnValue({ where: async () => undefined });
  mockTx.insert.mockReturnValue({ values: async () => undefined });
  mockReserve.mockResolvedValue({ allowed: true, consumed: true });
});

describe("v1UpdateDraft", () => {
  it("leaves the publications alone when the cron claimed the post first", async () => {
    queueSelects(
      [{ id: POST_ID, status: "scheduled", mediaIds: [], metadata: null }],
      [{ id: ACCOUNT_ID, isActive: true }],
      [{ id: ACCOUNT_ID, platform: "bluesky" }],
    );
    updateReturns(mockTx, []);

    const result = await v1UpdateDraft(SCOPE, POST_ID, {
      content: "edited",
      platforms: [ACCOUNT_ID],
    });

    expect(result).toEqual({
      ok: false,
      error: "Only draft or scheduled posts can be updated",
    });
    expect(mockTx.delete).not.toHaveBeenCalled();
    expect(mockTx.insert).not.toHaveBeenCalled();
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("rewrites the post and its publications in one transaction", async () => {
    queueSelects(
      [{ id: POST_ID, status: "draft", mediaIds: [], metadata: null }],
      [{ id: ACCOUNT_ID, isActive: true }],
      [{ id: ACCOUNT_ID, platform: "bluesky" }],
    );
    updateReturns(mockTx, [{ id: POST_ID }]);

    const result = await v1UpdateDraft(SCOPE, POST_ID, {
      content: "edited",
      platforms: [ACCOUNT_ID],
    });

    expect(result).toEqual({ ok: true });
    expect(mockDb.transaction).toHaveBeenCalledTimes(1);
    expect(mockTx.delete).toHaveBeenCalledTimes(1);
    expect(mockTx.insert).toHaveBeenCalledTimes(1);
  });
});

describe("v1SchedulePost", () => {
  const at = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  it("does not reset a post that started publishing, and refunds the draft's free post", async () => {
    queueSelects([{ id: POST_ID, status: "draft" }]);
    updateReturns(mockDb, []);

    const result = await v1SchedulePost(SCOPE, POST_ID, at);

    expect(result).toEqual({
      ok: false,
      error: "Only draft or scheduled posts can be scheduled",
    });
    expect(mockRelease).toHaveBeenCalledWith(
      { allowed: true, consumed: true },
      USER_ID,
    );
    expect(mockScheduledWebhook).not.toHaveBeenCalled();
  });

  it("schedules a draft and keeps the charge", async () => {
    queueSelects([{ id: POST_ID, status: "draft" }]);
    updateReturns(mockDb, [{ id: POST_ID }]);

    const result = await v1SchedulePost(SCOPE, POST_ID, at);

    expect(result).toEqual({ ok: true, scheduled_at: new Date(at).toISOString() });
    expect(mockRelease).not.toHaveBeenCalled();
    expect(mockScheduledWebhook).toHaveBeenCalledTimes(1);
  });
});

describe("v1DeletePost", () => {
  it("keeps a post the cron claimed between the read and the delete", async () => {
    queueSelects([{ id: POST_ID, status: "scheduled" }]);
    lockReturns([]);

    const result = await v1DeletePost(SCOPE, POST_ID);

    expect(result).toEqual({
      ok: false,
      error: "Only draft or scheduled posts can be deleted",
    });
    expect(mockTx.delete).not.toHaveBeenCalled();
    expect(mockDeletedWebhook).not.toHaveBeenCalled();
  });

  it("deletes a draft and its publications under the row lock", async () => {
    queueSelects([{ id: POST_ID, status: "draft" }]);
    lockReturns([{ id: POST_ID }]);

    const result = await v1DeletePost(SCOPE, POST_ID);

    expect(result).toEqual({ ok: true });
    expect(mockTx.delete).toHaveBeenCalledTimes(2);
    expect(mockDeletedWebhook).toHaveBeenCalledWith(USER_ID, POST_ID);
  });
});
