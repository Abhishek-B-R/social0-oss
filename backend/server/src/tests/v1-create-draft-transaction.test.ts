/**
 * `v1CreateDraft` writes the post and its publications in one transaction.
 *
 * The two inserts used to run separately, so a failure between them left a
 * post with no publications: nothing could publish it, and it showed up as a
 * draft with no networks. The dashboard's createPost already used one
 * transaction.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb, mockTx } = vi.hoisted(() => ({
  mockDb: { select: vi.fn(), insert: vi.fn(), transaction: vi.fn() },
  mockTx: { insert: vi.fn() },
}));

vi.mock("../db/index.js", () => ({ db: mockDb }));
vi.mock("@/lib/coerce-date.js", () => ({ coerceDate: () => null }));
vi.mock("../lib/plan-limits.js", () => ({}));
vi.mock("../lib/posts-list/posts-list-data.js", () => ({}));
vi.mock("../lib/token-refresh.js", () => ({}));
vi.mock("../lib/post-lifecycle-webhooks.js", () => ({}));
vi.mock("../lib/post-account-refs.js", () => ({
  checkSelectedAccounts: () => ({ ok: true }),
  SELECTED_ACCOUNT_OVER_PLAN_LIMIT_ERROR: "over limit",
}));
vi.mock("../lib/post-media-refs.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/post-media-refs.js")>()),
  checkPostMediaOwnership: async () => ({ ok: true }),
}));
vi.mock("../services/enqueue.js", () => ({}));
vi.mock("../services/publish-enqueue.js", () => ({
  PostClaimLostError: class PostClaimLostError extends Error {},
}));

import { postPublications, posts } from "../db/schema.js";
import { v1CreateDraft } from "../services/v1-posts.js";

const ACCOUNT_ID = "66666666-6666-4666-8666-666666666666";
const POST_ID = "77777777-7777-4777-8777-777777777777";
const USER_ID = "user_1";

const inserted: unknown[] = [];

beforeEach(() => {
  vi.resetAllMocks();
  inserted.length = 0;
  mockDb.select.mockImplementation(() => ({
    from: () => ({
      where: async () => [{ id: ACCOUNT_ID, isActive: true, platform: "linkedin" }],
    }),
  }));
  mockDb.transaction.mockImplementation(async (fn: (tx: typeof mockTx) => unknown) => fn(mockTx));
});

function txInsertsSucceed() {
  mockTx.insert.mockImplementation((table: unknown) => ({
    values: (values: unknown) => {
      inserted.push(table);
      const done = Promise.resolve(undefined);
      return Object.assign(done, {
        returning: async () => (table === posts ? [{ id: POST_ID }] : []),
        values,
      });
    },
  }));
}

describe("v1CreateDraft", () => {
  it("writes the post and its publications in one transaction", async () => {
    txInsertsSucceed();

    const result = await v1CreateDraft(USER_ID, { content: "hello", platforms: [ACCOUNT_ID] });

    expect(result).toEqual({ ok: true, id: POST_ID });
    expect(mockDb.transaction).toHaveBeenCalledTimes(1);
    expect(inserted).toEqual([posts, postPublications]);
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it("fails the whole create when the publications insert fails", async () => {
    mockTx.insert.mockImplementation((table: unknown) => ({
      values: () => {
        if (table === postPublications) {
          return Object.assign(Promise.reject(new Error("connection reset")), {
            returning: async () => [],
          });
        }
        return Object.assign(Promise.resolve(undefined), {
          returning: async () => [{ id: POST_ID }],
        });
      },
    }));

    await expect(
      v1CreateDraft(USER_ID, { content: "hello", platforms: [ACCOUNT_ID] }),
    ).rejects.toThrow("connection reset");
    // Nothing was written outside the transaction that rolled back.
    expect(mockDb.insert).not.toHaveBeenCalled();
  });
});
