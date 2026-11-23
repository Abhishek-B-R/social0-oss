/**
 * Bulk delete / duplicate send one request per 100 posts instead of one per
 * post, which tripped the per-minute mutation limit on big selections.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  deletePostsBatch: vi.fn(),
  duplicatePostsBatch: vi.fn(),
}));
vi.mock("@/api/posts", () => ({
  ...api,
  POSTS_BATCH_MAX: 100,
  reschedulePost: vi.fn(),
  updatePost: vi.fn(),
}));

import { deletePosts, duplicatePosts, type PostRef } from "./post-actions";

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`);

beforeEach(() => vi.clearAllMocks());

describe("deletePosts", () => {
  it("sends 250 posts as three requests and merges the outcomes", async () => {
    api.deletePostsBatch.mockImplementation(async (chunk: string[]) => ({
      ok: chunk.filter((id) => id !== "p5"),
      failed: chunk.includes("p5") ? [{ id: "p5", error: "Post not found" }] : [],
    }));

    const res = await deletePosts(ids(250));

    expect(api.deletePostsBatch.mock.calls.map(([c]) => c.length)).toEqual([100, 100, 50]);
    expect(res.ok).toHaveLength(249);
    expect(res.failed).toEqual([{ id: "p5", error: "Post not found" }]);
  });

  it("fails every post of a request that was refused as a whole", async () => {
    api.deletePostsBatch
      .mockResolvedValueOnce({ ok: ids(100), failed: [] })
      .mockRejectedValueOnce(new Error("Too many requests. Try again later."));

    const res = await deletePosts(ids(130));

    expect(res.ok).toHaveLength(100);
    expect(res.failed).toHaveLength(30);
    expect(res.failed[0]).toEqual({ id: "p100", error: "Too many requests. Try again later." });
  });
});

describe("duplicatePosts", () => {
  const post = (id: string, over: Partial<PostRef> = {}): PostRef => ({
    id,
    status: "draft",
    originalContent: "hello",
    accountIds: ["a1"],
    mediaIds: [],
    metadata: null,
    scheduledAt: null,
    ...over,
  });

  it("checks locally first and sends only the copyable posts in one request", async () => {
    api.duplicatePostsBatch.mockImplementation(async (chunk: { sourceId: string }[]) => ({
      ok: chunk.map((c) => c.sourceId),
      failed: [],
      createdIds: chunk.map((c) => `new-${c.sourceId}`),
    }));

    const res = await duplicatePosts([
      post("a"),
      post("b", { originalContent: " " }),
      post("c", { accountIds: [] }),
      post("d"),
    ]);

    expect(api.duplicatePostsBatch).toHaveBeenCalledTimes(1);
    expect(res.ok).toEqual(["a", "d"]);
    expect(res.createdIds).toEqual(["new-a", "new-d"]);
    expect(res.failed.map((f) => f.id)).toEqual(["b", "c"]);
  });
});
