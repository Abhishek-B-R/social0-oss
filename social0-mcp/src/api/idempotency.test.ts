/**
 * Retried create/publish tool calls must not post twice.
 *
 * The tools used to send a fresh random Idempotency-Key on every call (and
 * none on schedule), so an agent retrying a call that timed out created a
 * second post. A call now sends the caller's key, or one derived from the
 * request, which the API answers by replaying the first result.
 */

import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

process.env.SOCIAL0_MCP_NO_DOTENV = "true";
process.env.SOCIAL0_API_KEY = "sk_live_test";
process.env.SOCIAL0_API_URL = "http://api.test";
process.env.SOCIAL0_MAX_RETRIES = "1";

const { createPost, publishNow, publishPost, scheduleContent } = await import("./posts.js");
const { IDEMPOTENCY_WINDOW_MS, idempotencyKeyFor } = await import("../lib/idempotency.js");

const realFetch = globalThis.fetch;
let keys: (string | undefined)[] = [];

beforeEach(() => {
  keys = [];
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    keys.push(headers["Idempotency-Key"]);
    return new Response(
      JSON.stringify({ id: "p1", post_id: "p1", tracking_id: "t1", status: "queued" }),
      { status: 202, headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

const ACCOUNT = "11111111-1111-4111-8111-111111111111";
const payload = { content: "Launch day", platforms: [ACCOUNT] };

describe("idempotency keys on create/publish tools", () => {
  it("sends the same key when publish_now is retried with the same request", async () => {
    await publishNow(payload);
    await publishNow({ ...payload });
    assert.equal(keys.length, 2);
    assert.ok(keys[0]);
    assert.equal(keys[0], keys[1]);
  });

  it("sends a different key for a different post", async () => {
    await publishNow(payload);
    await publishNow({ ...payload, content: "Another post" });
    assert.notEqual(keys[0], keys[1]);
  });

  it("sends a key on schedule_content, which used to send none", async () => {
    const body = { ...payload, scheduledAt: "2026-12-01T09:00:00.000Z" };
    await scheduleContent(body);
    await scheduleContent(body);
    assert.ok(keys[0]);
    assert.equal(keys[0], keys[1]);
  });

  it("sends a stable key for create_draft and publish_post", async () => {
    await createPost(payload);
    await createPost(payload);
    await publishPost("22222222-2222-4222-8222-222222222222");
    await publishPost("22222222-2222-4222-8222-222222222222");
    assert.equal(keys[0], keys[1]);
    assert.equal(keys[2], keys[3]);
    assert.notEqual(keys[0], keys[2]);
  });

  it("uses the caller's key when one is given", async () => {
    await publishNow(payload, "agent-key-1");
    assert.equal(keys[0], "agent-key-1");
  });

  it("keys the same request differently per tool and per time window", () => {
    const now = 5 * IDEMPOTENCY_WINDOW_MS;
    assert.notEqual(
      idempotencyKeyFor("publish_now", payload, undefined, now),
      idempotencyKeyFor("schedule_content", payload, undefined, now),
    );
    assert.equal(
      idempotencyKeyFor("publish_now", payload, undefined, now),
      idempotencyKeyFor("publish_now", payload, undefined, now + IDEMPOTENCY_WINDOW_MS - 1),
    );
    assert.notEqual(
      idempotencyKeyFor("publish_now", payload, undefined, now),
      idempotencyKeyFor("publish_now", payload, undefined, now + IDEMPOTENCY_WINDOW_MS),
    );
  });

  it("ignores object key order but not array order", () => {
    const now = 0;
    assert.equal(
      idempotencyKeyFor("publish_now", { content: "a", platforms: ["x", "y"] }, undefined, now),
      idempotencyKeyFor("publish_now", { platforms: ["x", "y"], content: "a" }, undefined, now),
    );
    assert.notEqual(
      idempotencyKeyFor("publish_now", { content: "a", platforms: ["x", "y"] }, undefined, now),
      idempotencyKeyFor("publish_now", { content: "a", platforms: ["y", "x"] }, undefined, now),
    );
  });
});
