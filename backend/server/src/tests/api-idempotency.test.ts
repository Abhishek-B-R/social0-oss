import { Redis } from "@upstash/redis";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A real Upstash client over an in-memory requester, so reads go through the
 * client's default automatic JSON deserialization exactly as in production.
 */
const { store, commands } = vi.hoisted(() => ({
  store: new Map<string, string>(),
  commands: [] as unknown[][],
}));

vi.mock("../lib/redis.js", () => {
  const requester = {
    request: async <T>(req: { body?: unknown }) => {
      const cmd = req.body as unknown[];
      commands.push(cmd);
      const op = String(cmd[0]).toLowerCase();
      const key = String(cmd[1]);
      if (op === "get") return { result: (store.get(key) ?? null) as T };
      if (op === "del") return { result: (store.delete(key) ? 1 : 0) as T };
      if (op === "set") {
        const nx = cmd.slice(3).some((a) => String(a).toLowerCase() === "nx");
        if (nx && store.has(key)) return { result: null as T };
        store.set(key, String(cmd[2]));
        return { result: "OK" as T };
      }
      throw new Error(`unexpected command ${op}`);
    },
  };
  return { redis: new Redis(requester) };
});

import {
  assertIdempotencyStoreConfigured,
  getIdempotencyResponse,
  parseIdempotencyRecord,
  requestFingerprint,
  runIdempotent,
  storeIdempotencyResponse,
} from "../lib/api-idempotency.js";

const BODY = { content: "hello", platforms: ["a1"] };
const target = {
  userId: "u1",
  idempotencyKey: "K",
  scope: "POST /v1/posts/publish",
  fingerprint: requestFingerprint(BODY),
};

describe("api idempotency", () => {
  beforeEach(() => {
    store.clear();
    commands.length = 0;
  });

  it("reads back a stored record despite Upstash auto-deserialization", async () => {
    await storeIdempotencyResponse(target, {
      status: 202,
      body: { tracking_id: "t1" },
      location: "/v1/jobs/t1",
    });
    // The client hands back an object, not the string we wrote: the old
    // JSON.parse(raw) threw on it and every replay was lost.
    const { redis } = await import("../lib/redis.js");
    expect(typeof (await redis!.get(`api:idemp:u1:${target.scope}:K`))).toBe("object");
    expect(await getIdempotencyResponse(target)).toEqual({
      statusCode: 202,
      body: JSON.stringify({ tracking_id: "t1" }),
      location: "/v1/jobs/t1",
      fingerprint: target.fingerprint,
    });
  });

  it("replays the first response on retry instead of publishing again", async () => {
    const handler = vi.fn(async () => ({
      status: 202,
      body: { post_id: "p1", tracking_id: "t1" },
      location: "/v1/jobs/t1",
    }));

    const first = await runIdempotent(target, handler);
    const retry = await runIdempotent(target, handler);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(retry).toEqual(first);
    expect(retry).toEqual({
      status: 202,
      body: { post_id: "p1", tracking_id: "t1" },
      location: "/v1/jobs/t1",
    });
    // Lock is released once the response is stored.
    expect([...store.keys()].some((k) => k.startsWith("api:idemp:lock:"))).toBe(false);
  });

  it("rejects a reused key with a different body instead of replaying", async () => {
    const handler = vi.fn(async () => ({ status: 202, body: { post_id: "p1" } }));
    await runIdempotent(target, handler);

    const other = {
      ...target,
      fingerprint: requestFingerprint({ content: "something else", platforms: ["a1"] }),
    };
    const reused = await runIdempotent(other, handler);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(reused.status).toBe(422);
    expect(reused.body).toMatchObject({ error: { code: "idempotency_key_reused" } });
  });

  it("treats the same body with keys in another order as the same request", () => {
    expect(requestFingerprint({ platforms: ["a1"], content: "hello" })).toBe(
      requestFingerprint(BODY),
    );
    expect(requestFingerprint({ ...BODY, media: undefined })).toBe(requestFingerprint(BODY));
    expect(requestFingerprint({ ...BODY, platforms: ["a2"] })).not.toBe(requestFingerprint(BODY));
    // Array order is meaningful (thread parts, media order).
    expect(requestFingerprint({ ...BODY, platforms: ["a1", "a2"] })).not.toBe(
      requestFingerprint({ ...BODY, platforms: ["a2", "a1"] }),
    );
  });

  it("still replays a record stored before fingerprints existed", async () => {
    store.set(
      `api:idemp:u1:${target.scope}:K`,
      JSON.stringify({ statusCode: 202, body: JSON.stringify({ tracking_id: "old" }) }),
    );
    const handler = vi.fn(async () => ({ status: 202, body: {} }));

    const res = await runIdempotent(target, handler);

    expect(handler).not.toHaveBeenCalled();
    expect(res).toEqual({ status: 202, body: { tracking_id: "old" } });
  });

  it("still replays after the in-flight lock would have expired", async () => {
    const handler = vi.fn(async () => ({ status: 202, body: { tracking_id: "t1" } }));
    await runIdempotent(target, handler);
    for (const k of [...store.keys()]) if (k.startsWith("api:idemp:lock:")) store.delete(k);

    const retry = await runIdempotent(target, handler);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(retry.status).toBe(202);
  });

  it("returns 409 for a concurrent duplicate while the first is in flight", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const handler = vi.fn(async () => {
      await gate;
      return { status: 202, body: { tracking_id: "t1" } };
    });

    const first = runIdempotent(target, handler);
    await vi.waitFor(() => expect(handler).toHaveBeenCalledTimes(1));
    const dup = await runIdempotent(target, handler);
    expect(dup.status).toBe(409);
    expect(dup.body).toMatchObject({ error: { code: "idempotency_conflict" } });

    release();
    expect((await first).status).toBe(202);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("does not run the handler when the response landed between read and claim", async () => {
    // Simulate: our first read missed, then another request stored and
    // released the lock before we claimed it.
    const handler = vi.fn(async () => ({ status: 202, body: { tracking_id: "t2" } }));
    const get = vi.spyOn(
      (await import("../lib/redis.js")).redis as unknown as { get: (k: string) => unknown },
      "get",
    );
    get.mockImplementationOnce(async () => {
      store.set(
        `api:idemp:u1:${target.scope}:K`,
        JSON.stringify({ statusCode: 202, body: JSON.stringify({ tracking_id: "t1" }) }),
      );
      return null;
    });

    const res = await runIdempotent(target, handler);
    get.mockRestore();
    expect(handler).not.toHaveBeenCalled();
    expect(res).toEqual({ status: 202, body: { tracking_id: "t1" } });
  });

  it("scopes keys per endpoint so one key cannot replay another endpoint", async () => {
    await runIdempotent(target, async () => ({ status: 202, body: { from: "create" } }));
    const other = { ...target, scope: "POST /v1/posts/p9/publish" };
    const handler = vi.fn(async () => ({ status: 202, body: { from: "publish" } }));
    const res = await runIdempotent(other, handler);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(res.body).toEqual({ from: "publish" });
  });

  it("does not store 5xx results or thrown errors, and frees the key for a retry", async () => {
    const failing = vi.fn(async () => ({ status: 503, body: { error: "x" } }));
    expect((await runIdempotent(target, failing)).status).toBe(503);

    await expect(
      runIdempotent(target, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    const ok = vi.fn(async () => ({ status: 202, body: { tracking_id: "t3" } }));
    expect((await runIdempotent(target, ok)).status).toBe(202);
    expect(ok).toHaveBeenCalledTimes(1);
  });

  it("parses both string and object records and rejects malformed ones", () => {
    const rec = { statusCode: 202, body: "{}" };
    expect(parseIdempotencyRecord(rec)).toEqual(rec);
    expect(parseIdempotencyRecord(JSON.stringify(rec))).toEqual(rec);
    expect(parseIdempotencyRecord(null)).toBeNull();
    expect(parseIdempotencyRecord("not json")).toBeNull();
    expect(parseIdempotencyRecord({ statusCode: "202", body: "{}" })).toBeNull();
    expect(parseIdempotencyRecord({ statusCode: 202, body: {} })).toBeNull();
  });
});

describe("idempotency store at startup", () => {
  it("refuses to start production without a Redis client", () => {
    expect(() => assertIdempotencyStoreConfigured("production", null)).toThrow(/Redis/);
  });

  it("starts production with a client", () => {
    expect(() => assertIdempotencyStoreConfigured("production", {})).not.toThrow();
  });

  it("allows development and tests to run without Redis", () => {
    expect(() => assertIdempotencyStoreConfigured("development", null)).not.toThrow();
    expect(() => assertIdempotencyStoreConfigured("test", null)).not.toThrow();
  });
});
