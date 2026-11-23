/**
 * Every media reference on a post (top level, thread parts, accountMedia) and
 * the plan cap on target accounts.
 *
 * The publish engine reads media ids out of client-supplied metadata, so the
 * write-time ownership check has to see those too, and the publish-time copy
 * of the post must drop anything that is not the owner's upload.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb, ownedRows } = vi.hoisted(() => ({
  mockDb: { select: vi.fn() },
  ownedRows: [] as Array<{ id: string }>,
}));

vi.mock("../db/index.js", () => ({ db: mockDb }));

import {
  checkPostMediaOwnership,
  collectPostMediaIds,
  ownedMediaIdSet,
  restrictPostMediaIds,
} from "../lib/post-media-refs.js";
import { checkSelectedAccounts } from "../lib/post-account-refs.js";

const MINE_A = "11111111-1111-4111-8111-111111111111";
const MINE_B = "22222222-2222-4222-8222-222222222222";
const FOREIGN = "33333333-3333-4333-8333-333333333333";

function wireOwned(ids: string[]) {
  ownedRows.length = 0;
  ownedRows.push(...ids.map((id) => ({ id })));
  mockDb.select.mockReturnValue({
    from: () => ({ where: async () => [...ownedRows] }),
  });
}

describe("collectPostMediaIds", () => {
  it("finds ids in media_ids, thread parts and accountMedia", () => {
    expect(
      collectPostMediaIds([MINE_A], {
        twitterThread: { parts: [{ text: "a", mediaIds: [MINE_B] }, { text: "b" }] },
        accountMedia: { "acc-1": [FOREIGN, MINE_A], twitter_x: "not-a-list" },
      }),
    ).toEqual([MINE_A, MINE_B, FOREIGN]);
  });

  it("tolerates junk metadata", () => {
    expect(collectPostMediaIds(null, null)).toEqual([]);
    expect(
      collectPostMediaIds(undefined, {
        twitterThread: "x",
        accountMedia: [MINE_A],
      } as Record<string, unknown>),
    ).toEqual([]);
  });
});

describe("checkPostMediaOwnership", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects another user's upload hidden in a thread part", async () => {
    wireOwned([MINE_A]);
    const res = await checkPostMediaOwnership("user-1", [MINE_A], {
      twitterThread: { parts: [{ text: "hi", mediaIds: [FOREIGN] }] },
    });
    expect(res).toEqual({ ok: false, reason: "not_owned" });
  });

  it("rejects another user's upload in accountMedia", async () => {
    wireOwned([]);
    const res = await checkPostMediaOwnership("user-1", [], {
      accountMedia: { "acc-1": [FOREIGN] },
    });
    expect(res).toEqual({ ok: false, reason: "not_owned" });
  });

  it("rejects a non-UUID id before querying (it would throw 22P02 at publish)", async () => {
    const res = await checkPostMediaOwnership("user-1", [], {
      twitterThread: { parts: [{ text: "hi", mediaIds: ["x"] }] },
    });
    expect(res).toEqual({ ok: false, reason: "invalid_format" });
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it("accepts the user's own uploads in every place, any case", async () => {
    wireOwned([MINE_A, MINE_B]);
    const res = await checkPostMediaOwnership("user-1", [MINE_A.toUpperCase()], {
      twitterThread: { parts: [{ text: "hi", mediaIds: [MINE_B] }] },
      accountMedia: { "acc-1": [MINE_A] },
    });
    expect(res).toEqual({ ok: true });
  });

  it("skips the query when the post has no media", async () => {
    expect(await checkPostMediaOwnership("user-1", [], { contentType: "text" })).toEqual({
      ok: true,
    });
    expect(mockDb.select).not.toHaveBeenCalled();
  });
});

describe("ownedMediaIdSet", () => {
  beforeEach(() => vi.clearAllMocks());

  it("never sends a malformed id to Postgres", async () => {
    expect(await ownedMediaIdSet("user-1", ["x", "not-a-uuid"])).toEqual(new Set());
    expect(mockDb.select).not.toHaveBeenCalled();
  });
});

describe("restrictPostMediaIds (publish-time copy)", () => {
  const post = {
    id: "post-1",
    mediaIds: [MINE_A, FOREIGN],
    metadata: {
      contentType: "threads",
      twitterThread: {
        version: 1,
        parts: [
          { text: "one", mediaIds: [FOREIGN, MINE_B] },
          { text: "two", mediaIds: ["x"] },
        ],
      },
      accountMedia: { "acc-1": [FOREIGN], twitter_x: [MINE_A] },
    },
  };

  it("drops every id that is not the owner's upload, everywhere", () => {
    const restricted = restrictPostMediaIds(post, new Set([MINE_A, MINE_B]));
    expect(restricted.mediaIds).toEqual([MINE_A]);
    expect(restricted.metadata).toEqual({
      contentType: "threads",
      twitterThread: {
        version: 1,
        parts: [
          { text: "one", mediaIds: [MINE_B] },
          { text: "two", mediaIds: [] },
        ],
      },
      accountMedia: { "acc-1": [], twitter_x: [MINE_A] },
    });
    expect(restricted.id).toBe("post-1");
  });

  it("does not mutate the loaded post", () => {
    restrictPostMediaIds(post, new Set());
    expect(post.mediaIds).toEqual([MINE_A, FOREIGN]);
    expect(post.metadata.twitterThread.parts[0]!.mediaIds).toEqual([FOREIGN, MINE_B]);
  });

  it("leaves a post without media metadata alone", () => {
    const plain = { mediaIds: null, metadata: null };
    expect(restrictPostMediaIds(plain, new Set())).toEqual(plain);
  });
});

describe("checkSelectedAccounts (plan cap)", () => {
  it("refuses an account the plan cap switched off", () => {
    expect(
      checkSelectedAccounts(
        [MINE_A, MINE_B],
        [
          { id: MINE_A, isActive: true },
          { id: MINE_B, isActive: false },
        ],
      ),
    ).toEqual({ ok: false, reason: "over_limit" });
  });

  it("refuses an id the scope query did not find", () => {
    expect(
      checkSelectedAccounts([MINE_A, FOREIGN], [{ id: MINE_A, isActive: true }]),
    ).toEqual({ ok: false, reason: "not_found" });
    expect(checkSelectedAccounts([], [])).toEqual({ ok: false, reason: "not_found" });
  });

  it("accepts active accounts, duplicates and case differences included", () => {
    expect(
      checkSelectedAccounts(
        [MINE_A, MINE_A.toUpperCase(), MINE_B],
        [
          { id: MINE_A, isActive: true },
          { id: MINE_B, isActive: null },
        ],
      ),
    ).toEqual({ ok: true });
  });
});
