import { signPublishRequestBody } from "@social0/shared";

function mockEnv(overrides: Partial<Env> = {}): Env {
  return {
    PUBLISH_NOW_QUEUE: { send: vi.fn() } as unknown as Queue,
    PUBLISH_SCHEDULED_QUEUE: { send: vi.fn() } as unknown as Queue,
    PUBLISH_HMAC_SECRET: "secret",
    ENCRYPTION_KEY: "a".repeat(64),
    APP_URL: "http://localhost:3000",
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
