import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { store, sets, mockRedis, mockDb, rows, sendEmail, SendEmailError } =
  vi.hoisted(() => {
    const store = new Map<string, string>();
    const sets = new Map<string, Set<string>>();

    class SendEmailError extends Error {
      statusCode: number | null;
      code: string | null;
      retryAfterSec: number | null;
      constructor(
        message: string,
        d: { statusCode?: number; code?: string; retryAfterSec?: number } = {},
      ) {
        super(message);
        this.statusCode = d.statusCode ?? null;
        this.code = d.code ?? null;
        this.retryAfterSec = d.retryAfterSec ?? null;
      }
    }

    /** In-memory stand-in for the Upstash calls the mailer makes. */
    const mockRedis = {
      get: vi.fn(async (k: string) => store.get(k) ?? null),
      set: vi.fn(
        async (k: string, v: string, opts?: { nx?: boolean; ex?: number }) => {
          if (opts?.nx && store.has(k)) return null;
          store.set(k, v);
          return "OK";
        },
      ),
      del: vi.fn(async (...keys: string[]) => {
        let n = 0;
        for (const k of keys) {
          if (store.delete(k)) n += 1;
          if (sets.delete(k)) n += 1;
        }
        return n;
      }),
      scard: vi.fn(async (k: string) => sets.get(k)?.size ?? 0),
      smembers: vi.fn(async (k: string) => [...(sets.get(k) ?? [])]),
      sadd: vi.fn(async (k: string, m: string) => {
        const s = sets.get(k) ?? new Set<string>();
        sets.set(k, s);
        const had = s.has(m);
        s.add(m);
        return had ? 0 : 1;
      }),
      expire: vi.fn(async () => 1),
      eval: vi.fn(async (script: string, keys: string[], args: unknown[]) => {
        if (store.get(keys[0]) !== args[0]) return 0;
        if (script.includes('"del"')) store.delete(keys[0]);
        return 1;
      }),
    };

    const rows: { id: string; email: string }[] = [];
    const chain = {
      from: () => chain,
      where: () => chain,
      orderBy: async () => rows,
    };
    const mockDb = { select: vi.fn(() => chain) };

    return {
      store,
      sets,
      mockRedis,
      mockDb,
      rows,
      sendEmail: vi.fn(),
      SendEmailError,
    };
  });

vi.mock("../lib/redis.js", () => ({ redis: mockRedis }));
vi.mock("../db/index.js", () => ({ db: mockDb }));
vi.mock("../lib/mail.js", () => ({ sendEmail, SendEmailError }));

import { LEGAL_UPDATE_NOTIFICATION_KEY } from "@social0/shared";
import {
  claimLegalUpdateNotify,
  runLegalUpdateNotify,
} from "../lib/legal-update-notify.js";

const DONE_KEY = `legal:notified:${LEGAL_UPDATE_NOTIFICATION_KEY}`;
const LOCK_KEY = `${DONE_KEY}:lock`;

async function claimAndRun(force = false) {
  const claim = await claimLegalUpdateNotify({ force });
  if (claim.status !== "claimed") throw new Error(`not claimed: ${claim.status}`);
  const run = runLegalUpdateNotify(claim.lockToken);
  await vi.runAllTimersAsync();
  return run;
}

const recipients = () => sendEmail.mock.calls.map((c) => c[0].to as string);

describe("legal update notify", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    store.clear();
    sets.clear();
    rows.splice(
      0,
      rows.length,
      { id: "u1", email: "a@example.com" },
      { id: "u2", email: "b@example.com" },
      { id: "u3", email: "c@example.com" },
    );
    sendEmail.mockResolvedValue({ id: "em_1" });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("mails everyone once, then skips later triggers", async () => {
    const result = await claimAndRun();
    expect(result).toEqual({
      emailsSent: 3,
      emailsFailed: 0,
      alreadySent: 0,
      aborted: false,
    });
    expect(store.get(DONE_KEY)).toBeTruthy();
    expect(store.has(LOCK_KEY)).toBe(false);

    const again = await claimLegalUpdateNotify();
    expect(again.status).toBe("skipped");
  });

  /**
   * The old mailer read the done key up front but wrote it only after the
   * loop, so a retried trigger (e.g. after a 524 from the proxy) started a
   * second loop and mailed every user twice.
   */
  it("refuses a second trigger while a run holds the claim", async () => {
    const first = await claimLegalUpdateNotify();
    expect(first.status).toBe("claimed");

    const retry = await claimLegalUpdateNotify();
    expect(retry.status).toBe("running");

    const forced = await claimLegalUpdateNotify({ force: true });
    expect(forced.status).toBe("running");
  });

  /**
   * Partial runs used to be stored as done (`partial:n:m`), so users whose
   * send failed were never mailed unless `force` re-sent to everyone.
   */
  it("resumes after failed sends and mails only users not yet mailed", async () => {
    sendEmail.mockImplementation(async ({ to }: { to: string }) => {
      if (to === "b@example.com") throw new SendEmailError("bad", { statusCode: 500 });
      return { id: "em" };
    });
    const first = await claimAndRun();
    expect(first).toMatchObject({ emailsSent: 2, emailsFailed: 1 });
    expect(store.has(DONE_KEY)).toBe(false);

    sendEmail.mockClear();
    sendEmail.mockResolvedValue({ id: "em" });
    const second = await claimAndRun();
    expect(second).toMatchObject({ emailsSent: 1, emailsFailed: 0, alreadySent: 2 });
    expect(recipients()).toEqual(["b@example.com"]);
    expect(store.get(DONE_KEY)).toBeTruthy();
  });

  it("resumes after a run that died mid-loop without re-mailing anyone", async () => {
    // A crashed run: one user recorded, lock left to expire.
    const claim = await claimLegalUpdateNotify();
    if (claim.status !== "claimed") throw new Error("not claimed");
    await mockRedis.sadd(`${DONE_KEY}:sent`, "u:u1");
    store.delete(LOCK_KEY); // TTL expired

    const result = await claimAndRun();
    expect(result).toMatchObject({ emailsSent: 2, alreadySent: 1 });
    expect(recipients()).toEqual(["b@example.com", "c@example.com"]);
  });

  it("retries a Resend 429 instead of counting it as a failure", async () => {
    sendEmail
      .mockRejectedValueOnce(
        new SendEmailError("Too many requests", {
          statusCode: 429,
          code: "rate_limit_exceeded",
        }),
      )
      .mockResolvedValue({ id: "em" });

    const result = await claimAndRun();
    expect(result).toMatchObject({ emailsSent: 3, emailsFailed: 0 });
    expect(recipients()).toEqual([
      "a@example.com",
      "a@example.com",
      "b@example.com",
      "c@example.com",
    ]);
  });

  it("spaces sends under Resend's rate limit and keys each one per user", async () => {
    const at: number[] = [];
    sendEmail.mockImplementation(async () => {
      at.push(Date.now());
      return { id: "em" };
    });
    await claimAndRun();
    expect(at[1] - at[0]).toBeGreaterThanOrEqual(500);
    expect(at[2] - at[1]).toBeGreaterThanOrEqual(500);
    expect(sendEmail.mock.calls[0][0].idempotencyKey).toBe(
      `legal-update/${LEGAL_UPDATE_NOTIFICATION_KEY}/u1`,
    );
  });

  it("stops when it loses the claim so two runs never overlap", async () => {
    const claim = await claimLegalUpdateNotify();
    if (claim.status !== "claimed") throw new Error("not claimed");
    store.set(LOCK_KEY, "someone-else");

    const run = runLegalUpdateNotify(claim.lockToken);
    await vi.runAllTimersAsync();
    const result = await run;
    expect(result).toMatchObject({ aborted: true, emailsSent: 0 });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(store.get(LOCK_KEY)).toBe("someone-else");
  });

  it("force clears progress and re-sends to everyone", async () => {
    await claimAndRun();
    sendEmail.mockClear();
    const result = await claimAndRun(true);
    expect(result).toMatchObject({ emailsSent: 3, alreadySent: 0 });
  });
});
