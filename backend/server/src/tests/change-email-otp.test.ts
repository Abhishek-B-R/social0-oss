import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = { id: string; identifier: string; value: string; expiresAt: Date };
type Cond =
  | { op: "eq"; col: string; val: unknown }
  | { op: "and"; parts: Cond[] }
  | { op: "other" };

const { store, mocks } = vi.hoisted(() => ({
  store: { rows: new Map<string, Row>() },
  mocks: {
    getSession: vi.fn(),
    enforceRateLimit: vi.fn(),
    sendEmail: vi.fn(),
    userUpdate: vi.fn(),
  },
}));

// Column objects expose their SQL name; map the verification ones back to row keys.
const ROW_KEY: Record<string, keyof Row> = {
  id: "id",
  identifier: "identifier",
  value: "value",
};

function matches(row: Row, cond: Cond): boolean {
  if (cond.op === "and") return cond.parts.every((p) => matches(row, p));
  if (cond.op === "eq") {
    const key = ROW_KEY[cond.col];
    return key ? row[key] === cond.val : true;
  }
  return true;
}

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    eq: (col: { name: string }, val: unknown) => ({ op: "eq", col: col.name, val }),
    and: (...parts: Cond[]) => ({ op: "and", parts }),
    gt: () => ({ op: "other" }),
    ne: () => ({ op: "other" }),
  };
});

vi.mock("../lib/auth.js", () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock("../lib/http/request-cookies.js", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));
vi.mock("../lib/http/http.js", () => ({
  RouteResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      body,
      status: init?.status ?? 200,
    }),
  },
}));
vi.mock("../lib/redis.js", () => ({ redis: null }));
vi.mock("../lib/ratelimit.js", () => ({
  // Any non-null limiter: the mocked enforceRateLimit decides.
  slidingWindowLimiter: () => ({}), enforceRateLimit: mocks.enforceRateLimit }));
vi.mock("../lib/mail.js", () => ({ sendEmail: mocks.sendEmail }));

vi.mock("../db/index.js", async () => {
  const schema = await import("../db/schema.js");
  const isVerification = (t: unknown) => t === schema.verification;
  const db = {
    select: () => ({
      from: (table: unknown) => ({
        where: (cond: Cond) => ({
          limit: async () => {
            await Promise.resolve();
            if (!isVerification(table)) return [];
            return [...store.rows.values()]
              .filter((r) => matches(r, cond))
              .map((r) => ({ ...r }));
          },
        }),
      }),
    }),
    update: (table: unknown) => ({
      set: (values: Partial<Row>) => ({
        where: (cond: Cond) => {
          const run = async () => {
            await Promise.resolve();
            if (!isVerification(table)) {
              if (table === schema.user) mocks.userUpdate(values);
              return [];
            }
            const hits = [...store.rows.values()].filter((r) => matches(r, cond));
            for (const r of hits) Object.assign(r, values);
            return hits.map((r) => ({ id: r.id }));
          };
          const p = run();
          return Object.assign(p, { returning: () => p });
        },
      }),
    }),
    delete: (table: unknown) => ({
      where: async (cond: Cond) => {
        if (!isVerification(table)) return;
        for (const r of [...store.rows.values()]) {
          if (matches(r, cond)) store.rows.delete(r.id);
        }
      },
    }),
    transaction: async (fn: (tx: unknown) => Promise<void>) => fn(db),
  };
  return { db };
});

import { changeEmail } from "../handlers/account/change-email.js";

const USER_ID = "user_1";
const NEW_EMAIL = "new@example.com";
const CODE = "123456";

function seed(attempts = 0) {
  store.rows.clear();
  store.rows.set("v1", {
    id: "v1",
    identifier: `change-email-otp-${NEW_EMAIL}`,
    value: `${CODE}:${attempts}:${USER_ID}`,
    expiresAt: new Date(Date.now() + 600_000),
  });
}

function submit(otp: string) {
  return changeEmail(
    new Request("http://localhost/api/account/change-email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ newEmail: NEW_EMAIL, otp }),
    }),
  ) as unknown as Promise<{ status: number; body: Record<string, unknown> }>;
}

describe("change-email OTP verification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({
      user: { id: USER_ID, email: "old@example.com" },
    });
    mocks.enforceRateLimit.mockResolvedValue({ allowed: true });
    mocks.sendEmail.mockResolvedValue({});
    seed();
  });

  /**
   * The attempt counter was read, compared, then written back from the stale
   * read, so a burst of N concurrent guesses cost one attempt. Only the guess
   * that moves the counter may be compared; the rest are rejected unseen.
   */
  it("compares only one guess out of a concurrent burst", async () => {
    const guesses = Array.from({ length: 20 }, (_, i) =>
      i === 19 ? CODE : String(900000 + i),
    );
    const results = await Promise.all(guesses.map((g) => submit(g)));

    expect(results.every((r) => r.status === 400)).toBe(true);
    expect(mocks.userUpdate).not.toHaveBeenCalled();
    expect(store.rows.get("v1")?.value).toBe(`${CODE}:1:${USER_ID}`);
  });

  it("burns the code after five wrong guesses, even if the sixth is right", async () => {
    for (let i = 0; i < 4; i++) {
      expect((await submit("000000")).body.error).toBe("Invalid or expired code.");
    }
    expect((await submit("000000")).body.error).toMatch(/Too many failed attempts/);
    expect(store.rows.size).toBe(0);

    const late = await submit(CODE);
    expect(late.status).toBe(400);
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });

  it("accepts the right code on the last allowed attempt", async () => {
    seed(4);
    const res = await submit(CODE);
    expect(res.status).toBe(200);
    expect(mocks.userUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ email: NEW_EMAIL, emailVerified: true }),
    );
  });

  it("rate limits before reading the code", async () => {
    mocks.enforceRateLimit.mockResolvedValueOnce({
      allowed: false,
      status: 429,
      error: "Too many requests",
    });
    const res = await submit(CODE);
    expect(res.status).toBe(429);
    expect(store.rows.get("v1")?.value).toBe(`${CODE}:0:${USER_ID}`);
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });

  it("notifies the previous address after a successful change", async () => {
    const res = await submit(CODE);
    expect(res.status).toBe(200);
    expect(mocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "old@example.com" }),
    );
  });

  it("still completes the change when the notice fails to send", async () => {
    mocks.sendEmail.mockRejectedValueOnce(new Error("resend down"));
    const res = await submit(CODE);
    expect(res.status).toBe(200);
  });
});
