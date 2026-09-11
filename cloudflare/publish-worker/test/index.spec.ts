import { signPublishRequestBody } from "@social0/shared";

function mockEnv(overrides: Partial<Env> = {}): Env {
  return {
    PUBLISH_NOW_QUEUE: { send: vi.fn() } as unknown as Queue,
    PUBLISH_SCHEDULED_QUEUE: { send: vi.fn() } as unknown as Queue,
    PUBLISH_HMAC_SECRET: "secret",
    ENCRYPTION_KEY: "a".repeat(64),
    APP_URL: "http://localhost:3000",
    R2_PUBLIC_URL: "https://example.r2.dev",
    HYPERDRIVE: { connectionString: "postgres://x" } as Hyperdrive,
    ...overrides,
  };
}

async function signedEnqueueRequest(
  body: unknown,
  secret = "secret",
): Promise<Request> {
  const rawBody = JSON.stringify(body);
  const { timestamp, signature } = await signPublishRequestBody(rawBody, secret);
  return new Request("https://worker/enqueue", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Publish-Timestamp": timestamp,
      "X-Publish-Signature": signature,
    },
    body: rawBody,
  });
}

// Mock postgres validation for enqueue tests
vi.mock("postgres", () => ({
  default: () => {
    const sql = Object.assign(
      async () => [{ ok: 1 }],
      { end: async () => undefined },
    );
    return sql;
  },
}));

import { describe, expect, it, vi } from "vitest";
import worker from "../src/index";

describe("fetch handler", () => {
  it("GET /health is public", async () => {
    const res = await worker.fetch!(
      new Request("https://worker/health"),
      mockEnv(),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it("POST /enqueue requires auth", async () => {
    const res = await worker.fetch!(
      new Request("https://worker/enqueue", { method: "POST" }),
      mockEnv(),
    );
    expect(res.status).toBe(401);
  });

  it("POST /enqueue queues publish-now jobs", async () => {
    const env = mockEnv();
    const res = await worker.fetch!(
      await signedEnqueueRequest({
        priority: "now",
        job: {
          postId: "11111111-1111-4111-8111-111111111111",
          userId: "u1",
          publicationId: "22222222-2222-4222-8222-222222222222",
          connectedAccountId: "33333333-3333-4333-8333-333333333333",
          platform: "twitter_x",
        },
      }),
      env,
    );

    expect(res.status).toBe(202);
    expect(env.PUBLISH_NOW_QUEUE.send).toHaveBeenCalledOnce();
    expect(env.PUBLISH_SCHEDULED_QUEUE.send).not.toHaveBeenCalled();
  });

  /**
   * The API droplet enqueues every publish from a single source IP. The
   * auth-failure counter must therefore count *failures only* — counting each
   * request capped real publishes at 30/min with a 429.
   */
  it("does not throttle authenticated enqueues from one IP", async () => {
    const env = mockEnv();
    const job = {
      priority: "now",
      job: {
        postId: "11111111-1111-4111-8111-111111111111",
        userId: "u1",
        publicationId: "22222222-2222-4222-8222-222222222222",
        connectedAccountId: "33333333-3333-4333-8333-333333333333",
        platform: "twitter_x",
      },
    };

    for (let i = 0; i < 60; i++) {
      const request = await signedEnqueueRequest(job);
      request.headers.set("CF-Connecting-IP", "203.0.113.9");
      const res = await worker.fetch!(request, env);
      expect(res.status, `request ${i + 1}`).toBe(202);
    }
    expect(env.PUBLISH_NOW_QUEUE.send).toHaveBeenCalledTimes(60);
  });

  it("throttles an IP that keeps failing auth", async () => {
    const env = mockEnv();
    const ip = "198.51.100.7";
    let sawThrottle = false;

    for (let i = 0; i < 60; i++) {
      const request = new Request("https://worker/enqueue", {
        method: "POST",
        headers: { "CF-Connecting-IP": ip },
        body: "{}",
      });
      const res = await worker.fetch!(request, env);
      if (res.status === 429) {
        sawThrottle = true;
        break;
      }
      expect(res.status).toBe(401);
    }

    expect(sawThrottle).toBe(true);
  });

  it("POST /enqueue rejects invalid JSON", async () => {
    const rawBody = "not-json";
    const { timestamp, signature } = await signPublishRequestBody(
      rawBody,
      "secret",
    );
    const res = await worker.fetch!(
      new Request("https://worker/enqueue", {
        method: "POST",
        headers: {
          "X-Publish-Timestamp": timestamp,
          "X-Publish-Signature": signature,
        },
        body: rawBody,
      }),
      mockEnv(),
    );
    expect(res.status).toBe(400);
  });
});
