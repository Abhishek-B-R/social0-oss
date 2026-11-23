/**
 * DM reply verification must not reject a real conversation because the DM
 * list just spent the inbox_dms budget: it spends its own per-account verify
 * budget, turns a cooldown into a clear "try again" message, never treats a
 * stale copy served under a rate limit as proof the conversation is missing,
 * and does not spend a second platform call after a live read already missed.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

/** DM list reads (the path these tests are about). */
const withPlatformReadCache = vi.fn();
/** Thread reads: verification tries the cached newest page first. */
const threadRead = vi.fn();

vi.mock("../lib/platform-api-cache.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/platform-api-cache.js")>();
  return {
    ...actual,
    withPlatformReadCache: (opts: { kind?: string }) =>
      opts.kind === "inbox_dm_thread" ? threadRead(opts) : withPlatformReadCache(opts),
  };
});

const { verifyDmConversationOnAccount } = await import("../lib/inbox/verify-dm.js");
const { PlatformApiCooldownError } = await import("../lib/platform-api-cache.js");

const account = {
  id: "acc",
  platform: "twitter_x",
  platformUserId: "me",
  platformUsername: "me",
  accessToken: "token",
  accessSecret: "secret",
};

function dms(...ids: string[]) {
  return {
    threads: ids.map((id) => ({ conversationId: id, peerId: `peer-${id}` })),
    status: "ok",
  };
}

beforeEach(() => {
  withPlatformReadCache.mockReset();
  threadRead.mockReset();
  // An empty thread page proves nothing, so verification falls back to the list.
  threadRead.mockResolvedValue({ data: { status: "ok", messages: [] }, fromCache: true });
});

describe("verifyDmConversationOnAccount budget", () => {
  it("spends the verify budget, not the DM list budget", async () => {
    withPlatformReadCache.mockResolvedValue({ data: dms("c1"), fromCache: false });
    await expect(verifyDmConversationOnAccount(account, "c1")).resolves.toEqual({
      ok: true,
      peerId: "peer-c1",
    });
    expect(withPlatformReadCache).toHaveBeenCalledWith(
      expect.objectContaining({ purpose: "verify", kind: "inbox_dms" }),
    );
  });

  it("turns a cooldown into a 'try again' message instead of the raw error", async () => {
    withPlatformReadCache.mockRejectedValue(
      new PlatformApiCooldownError("twitter_x", Date.now() + 60_000, "local_budget"),
    );
    const result = await verifyDmConversationOnAccount(account, "c1");
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(/try again/i);
    expect(!result.ok && result.error).not.toMatch(/Platform twitter_x is rate limited/);
  });

  it("a stale copy served under a rate limit does not reject the conversation", async () => {
    withPlatformReadCache
      .mockResolvedValueOnce({
        data: dms("older"),
        fromCache: true,
        cachedAt: Date.now() - 30_000,
      })
      .mockResolvedValueOnce({
        data: dms("older"),
        fromCache: true,
        rateLimited: true,
      });
    const result = await verifyDmConversationOnAccount(account, "c1");
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(/try again/i);
    expect(!result.ok && result.error).not.toMatch(/not in this account inbox/);
    expect(withPlatformReadCache).toHaveBeenCalledTimes(2);
  });

  it("does not spend a second platform call after a live read missed", async () => {
    withPlatformReadCache.mockResolvedValue({ data: dms("other"), fromCache: false });
    const result = await verifyDmConversationOnAccount(account, "c1");
    expect(result).toEqual({
      ok: false,
      error: "Conversation is not in this account inbox.",
    });
    expect(withPlatformReadCache).toHaveBeenCalledTimes(1);
  });

  it("re-reads fresh when the first answer came from cache", async () => {
    withPlatformReadCache
      .mockResolvedValueOnce({
        data: dms("other"),
        fromCache: true,
        cachedAt: Date.now() - 30_000,
      })
      .mockResolvedValueOnce({ data: dms("c1"), fromCache: false });
    await expect(verifyDmConversationOnAccount(account, "c1")).resolves.toEqual({
      ok: true,
      peerId: "peer-c1",
    });
    expect(withPlatformReadCache).toHaveBeenLastCalledWith(
      expect.objectContaining({ fresh: true, softFreshMinAgeMs: 0, purpose: "verify" }),
    );
  });

  it("verifies from a cached thread page without reading the DM list", async () => {
    threadRead.mockResolvedValue({
      data: { status: "ok", messages: [{ id: "m1" }], thread: { peerId: "peer-t" } },
      fromCache: true,
    });
    await expect(verifyDmConversationOnAccount(account, "c1")).resolves.toEqual({
      ok: true,
      peerId: "peer-t",
    });
    expect(withPlatformReadCache).not.toHaveBeenCalled();
  });
});
