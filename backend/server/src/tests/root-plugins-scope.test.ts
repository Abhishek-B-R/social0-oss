import { afterEach, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { registerSecurityHeadersPlugin } from "../plugins/security-headers.js";
import { registerLoggingPlugin } from "../plugins/logging.js";
import {
  getMetricsSnapshot,
  registerMetricsPlugin,
} from "../plugins/metrics.js";

/**
 * Mirrors the shape of `buildApp` in app.ts: the cross-cutting plugins are
 * registered on the root, and the route groups are *sibling* registrations.
 * Without fastify-plugin, the plugins' hooks stay encapsulated and never reach
 * /api, /v1 or even /health.
 */
async function buildLikeApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
    requestIdHeader: "x-request-id",
    genReqId: (req) =>
      (req.headers["x-request-id"] as string | undefined) ?? "generated-id",
  });
  await app.register(registerSecurityHeadersPlugin);
  await app.register(registerLoggingPlugin);
  await app.register(registerMetricsPlugin);

  app.get("/health", async () => ({ ok: true }));
  await app.register(
    async (api) => {
      api.get("/thing", async () => ({ ok: true }));
      api.get("/boom", async () => {
        throw new Error("boom");
      });
    },
    { prefix: "/api" },
  );
  await app.register(
    async (v1) => {
      v1.get("/me", async () => ({ ok: true }));
    },
    { prefix: "/v1" },
  );
  return app;
}

const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
});

describe("root plugins reach sibling route plugins", () => {
  it.each(["/health", "/api/thing", "/v1/me", "/api/boom", "/api/missing"])(
    "sets security headers on %s",
    async (url) => {
      const app = await buildLikeApp();
      const res = await app.inject({ method: "GET", url });
      expect(res.headers["x-content-type-options"]).toBe("nosniff");
      expect(res.headers["x-frame-options"]).toBe("DENY");
      expect(res.headers["referrer-policy"]).toBe(
        "strict-origin-when-cross-origin",
      );
      expect(res.headers["permissions-policy"]).toBe(
        "camera=(), microphone=(), geolocation=()",
      );
      await app.close();
    },
  );

  it("adds HSTS only in production", async () => {
    process.env.NODE_ENV = "production";
    const app = await buildLikeApp();
    const res = await app.inject({ method: "GET", url: "/api/thing" });
    expect(res.headers["strict-transport-security"]).toBe(
      "max-age=31536000; includeSubDomains",
    );
    await app.close();

    process.env.NODE_ENV = "test";
    const dev = await buildLikeApp();
    const devRes = await dev.inject({ method: "GET", url: "/api/thing" });
    expect(devRes.headers["strict-transport-security"]).toBeUndefined();
    await dev.close();
  });

  it("echoes the request id on nested routes", async () => {
    const app = await buildLikeApp();
    const echoed = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: { "x-request-id": "abc-123" },
    });
    expect(echoed.headers["x-request-id"]).toBe("abc-123");

    const generated = await app.inject({ method: "GET", url: "/api/thing" });
    expect(generated.headers["x-request-id"]).toBe("generated-id");
    await app.close();
  });

  it("counts requests to every route, not just /metrics", async () => {
    const app = await buildLikeApp();
    const before = getMetricsSnapshot().httpRequests;
    await app.inject({ method: "GET", url: "/api/thing" });
    await app.inject({ method: "GET", url: "/v1/me" });
    await app.inject({ method: "GET", url: "/health" });
    expect(getMetricsSnapshot().httpRequests - before).toBe(3);
    await app.close();
  });
});
