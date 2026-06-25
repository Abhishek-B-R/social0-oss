import { describe, expect, it, vi } from "vitest";
import worker from "../src/index";

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

describe("fetch handler", () => {
  it("GET /health is public", async () => {
    const res = await worker.fetch!(
      new Request("https://worker/health"),
      mockEnv(),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; service: string };
    expect(body.ok).toBe(true);
    expect(body.service).toBe("social0-publish");
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
      new Request("https://worker/enqueue", {
        method: "POST",
        headers: {
          Authorization: "Bearer secret",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          priority: "now",
          job: {
            postId: "p1",
            userId: "u1",
            publicationId: "pub1",
            connectedAccountId: "acc1",
            platform: "twitter_x",
          },
        }),
      }),
      env,
    );

    expect(res.status).toBe(202);
    expect(env.PUBLISH_NOW_QUEUE.send).toHaveBeenCalledOnce();
    expect(env.PUBLISH_SCHEDULED_QUEUE.send).not.toHaveBeenCalled();
  });

  it("POST /enqueue rejects invalid JSON", async () => {
    const res = await worker.fetch!(
      new Request("https://worker/enqueue", {
        method: "POST",
        headers: { Authorization: "Bearer secret" },
        body: "not-json",
      }),
      mockEnv(),
    );
    expect(res.status).toBe(400);
  });
});
