/**
 * `POST /api/api-keys/:id/regenerate` must refuse the MCP connector key.
 *
 * The connector is identified by its name, and the MCP host re-mints it on its
 * next request whenever the newest connector-named key is live. Regenerating
 * it used to revoke the old row and insert a live copy still named
 * "MCP Connector", without the revoke marker: the host then revoked the key
 * the user had just copied and carried on with a fresh one of its own.
 */

import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb, state } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    transaction: vi.fn(),
  },
  state: {
    existing: null as null | {
      id: string;
      name: string;
      expiresAt: Date | null;
      createdAt: Date | null;
    },
  },
}));

vi.mock("../db/index.js", () => ({ db: mockDb }));
vi.mock("../middleware/auth.js", () => ({
  resolveRequestActor: vi
    .fn()
    .mockResolvedValue({ userId: "user-1", source: "session" }),
  requireUserId: vi.fn().mockResolvedValue("user-1"),
}));
vi.mock("../lib/ratelimit.js", () => ({
  // Any non-null limiter: the mocked enforceRateLimit decides.
  slidingWindowLimiter: () => ({}),
  rpcMutationLimiter: null,
  enforceRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
}));
vi.mock("../lib/api-keys.js", () => ({
  forgetApiKeysForUser: () => undefined,
  generateApiKey: () => ({ raw: "sk_live_new", hash: "hash", prefix: "sk_live_ne" }),
}));
vi.mock("../lib/mcp-oauth.js", async () => {
  const names = ["MCP Connector", "Claude MCP Connector"];
  return {
    isMcpConnectorKeyName: (name: string | null | undefined) =>
      !!name && names.includes(name),
    markMcpConnectorRevoked: vi.fn(),
  };
});
vi.mock("../lib/subscription.js", () => ({ getSubscriptionForUser: vi.fn() }));
vi.mock("../lib/api-rate-limits.js", () => ({ apiRequestsPerHour: () => 60 }));
vi.mock("../lib/webhook-url.js", () => ({ isAllowedWebhookUrl: vi.fn() }));
vi.mock("../services/webhooks.js", () => ({
  clampDeliveryLimit: vi.fn(),
  listWebhookDeliveriesForUser: vi.fn(),
  listWebhooksForUser: vi.fn(),
  parseDeliveryCursor: vi.fn(),
  testWebhookForUser: vi.fn(),
}));

import { markMcpConnectorRevoked } from "../lib/mcp-oauth.js";
import { registerApiPlatformRoutes } from "../routes/api/api-platform.js";

const KEY_ID = "5f0c2f4e-8a59-4d6b-9a6f-3f1f2a0b9c11";

function txStub() {
  return {
    update: () => ({
      set: () => ({
        where: () => ({ returning: async () => [{ id: KEY_ID }] }),
      }),
    }),
    insert: () => ({
      values: (values: { name: string }) => ({
        returning: async () => [
          {
            id: "new-id",
            name: values.name,
            keyPrefix: "sk_live_ne",
            expiresAt: null,
            createdAt: new Date(),
          },
        ],
      }),
    }),
  };
}

async function regenerate() {
  const app = Fastify();
  await registerApiPlatformRoutes(app);
  const res = await app.inject({
    method: "POST",
    url: `/api-keys/${KEY_ID}/regenerate`,
  });
  await app.close();
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.select.mockImplementation(() => ({
    from: () => ({
      where: () => ({
        limit: async () => (state.existing ? [state.existing] : []),
      }),
    }),
  }));
  mockDb.transaction.mockImplementation(
    async (fn: (tx: ReturnType<typeof txStub>) => unknown) => fn(txStub()),
  );
});

describe("POST /api-keys/:id/regenerate", () => {
  it.each(["MCP Connector", "Claude MCP Connector"])(
    "refuses the %s key and leaves it untouched",
    async (name) => {
      state.existing = { id: KEY_ID, name, expiresAt: null, createdAt: new Date() };

      const res = await regenerate();

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toMatch(/can't be regenerated/);
      expect(mockDb.transaction).not.toHaveBeenCalled();
      expect(markMcpConnectorRevoked).not.toHaveBeenCalled();
    },
  );

  it("still regenerates an ordinary key under the same name", async () => {
    state.existing = {
      id: KEY_ID,
      name: "CI deploy",
      expiresAt: null,
      createdAt: new Date(),
    };

    const res = await regenerate();

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      key: "sk_live_new",
      apiKey: { name: "CI deploy" },
    });
    expect(mockDb.transaction).toHaveBeenCalledOnce();
  });

  it("404s a key that is gone", async () => {
    state.existing = null;
    const res = await regenerate();
    expect(res.statusCode).toBe(404);
  });
});
