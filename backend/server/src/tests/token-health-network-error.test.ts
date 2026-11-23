import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A thrown fetch (DNS failure, ECONNRESET, TLS error) on one platform host
 * used to escape runTokenHealthCheck before its batched writes, dropping the
 * results for every other account in the batch and failing the sweep job.
 */

const { mockDb, writes } = vi.hoisted(() => ({
  writes: [] as { set: Record<string, unknown>; ids: string[] }[],
  mockDb: { update: vi.fn() },
}));

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    inArray: (_col: unknown, ids: string[]) => ({ ids }),
  };
});
vi.mock("@social0/shared/db/instance", () => ({ db: mockDb }));

import { encryptToken } from "@social0/shared";
import { runTokenHealthCheck } from "@social0/shared/lib/token-health";

function account(id: string, platform: string) {
  return {
    id,
    platform,
    encryptedAccessToken: encryptToken(`token-${id}`, id),
    encryptedRefreshToken: null,
    tokenExpiresAt: null,
    lastSyncedAt: null,
    tokenStatus: "active",
  };
}

const fetchMock = vi.fn();

beforeEach(() => {
  writes.length = 0;
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  mockDb.update.mockReturnValue({
    set: (set: Record<string, unknown>) => ({
      where: async (cond: { ids: string[] }) => {
        writes.push({ set, ids: cond.ids });
      },
    }),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("runTokenHealthCheck network failures", () => {
  it("keeps the batch's other results when one platform host throws", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.startsWith("https://api.linkedin.com/")) {
        throw new TypeError("fetch failed");
      }
      if (url.startsWith("https://graph.threads.net/")) {
        return new Response("{}", { status: 401 });
      }
      return new Response("{}", { status: 200 });
    });

    await expect(
      runTokenHealthCheck([
        account("acc_fb", "facebook"),
        account("acc_li", "linkedin"),
        account("acc_th", "threads"),
      ]),
    ).resolves.toBeUndefined();

    const active = writes.find((w) => w.set.tokenStatus === "active");
    const expired = writes.find((w) => w.set.tokenStatus === "expired");
    expect(active?.ids).toEqual(["acc_fb"]);
    expect(expired?.ids).toEqual(["acc_th"]);
    // The account whose request failed is left exactly as it was.
    expect(writes.flatMap((w) => w.ids)).not.toContain("acc_li");
  });

  it("bounds every verify request with a timeout signal", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));

    await runTokenHealthCheck([account("acc_fb", "facebook")]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});
