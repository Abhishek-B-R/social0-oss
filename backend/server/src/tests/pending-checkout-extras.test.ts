import { beforeEach, describe, expect, it, vi } from "vitest";

const { store } = vi.hoisted(() => ({ store: new Map<string, unknown>() }));

vi.mock("../lib/redis.js", () => ({
  redis: {
    get: async (k: string) => store.get(k) ?? null,
    set: async (k: string, v: unknown, opts?: { nx?: boolean }) => {
      if (opts?.nx && store.has(k)) return null;
      store.set(k, v);
      return "OK";
    },
    del: async (k: string) => {
      store.delete(k);
      return 1;
    },
  },
}));
vi.mock("../db/index.js", () => ({ db: {} }));

import { resolveCheckoutSession } from "../lib/pending-checkout.js";

let n = 0;
const createSession = vi.fn(async () => {
  n += 1;
  return { sessionId: `cs_${n}`, url: `https://pay.test/${n}` };
});

function resolve(plan: "creator" | "agency", extraAccounts?: number) {
  return resolveCheckoutSession({
    userId: "user_1",
    plan,
    interval: "monthly",
    extraAccounts,
    trialPeriodDays: 0,
    createSession,
  });
}

beforeEach(() => {
  store.clear();
  createSession.mockClear();
  n = 0;
});

describe("resolveCheckoutSession with Agency extra accounts", () => {
  it("reuses the open session for the same quantity", async () => {
    const first = await resolve("agency", 10);
    const again = await resolve("agency", 10);
    expect(again).toEqual({ ok: true, url: first.ok ? first.url : "", reused: true });
    expect(createSession).toHaveBeenCalledTimes(1);
  });

  it("opens a new session when the quantity changes", async () => {
    await resolve("agency", 10);
    const changed = await resolve("agency", 25);
    expect(changed).toMatchObject({ ok: true, reused: false, url: "https://pay.test/2" });
    expect(createSession).toHaveBeenCalledTimes(2);
  });

  it("treats a session saved without extras as 0 extras", async () => {
    store.set(
      "checkout:pending:user_1",
      JSON.stringify({
        plan: "agency",
        interval: "monthly",
        sessionId: "cs_old",
        url: "https://pay.test/old",
        trialPeriodDays: 0,
        createdAt: Date.now(),
      }),
    );
    expect(await resolve("agency")).toMatchObject({ reused: true, url: "https://pay.test/old" });
    expect(await resolve("agency", 5)).toMatchObject({ reused: false });
  });

  it("parses pending sessions for the new plans", async () => {
    await resolve("creator");
    expect(await resolve("creator")).toMatchObject({ reused: true });
  });
});
