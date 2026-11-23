/**
 * `/v1/webhooks` must match openapi.json, because the CLI, the MCP and any
 * generated client are built against the spec. The drift this pins:
 * `PATCH /v1/webhooks/{id}` had no requestBody and no 400 in the spec, so a
 * generated client could not send any updatable field, and the test ping was
 * typed as a stored delivery although it never returns `id` / `created_at`.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb, mockTestWebhook, mockAllowedUrl, state } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  mockTestWebhook: vi.fn(),
  mockAllowedUrl: vi.fn(),
  state: { updateSets: [] as Record<string, unknown>[] },
}));

vi.mock("../db/index.js", () => ({ db: mockDb }));
vi.mock("../middleware/api-auth.js", () => ({
  requireV1ApiKey: vi.fn(async (request: { v1Auth?: unknown }) => {
    request.v1Auth = { userId: "user-1" };
  }),
  v1UserId: (request: { v1Auth?: { userId: string } }) =>
    request.v1Auth!.userId,
}));
vi.mock("../middleware/v1-live-limits.js", () => ({
  requireV1MutationBudget: vi.fn(async () => undefined),
}));
vi.mock("../lib/webhook-url.js", () => ({
  isAllowedWebhookUrl: mockAllowedUrl,
}));
vi.mock("../routes/api/api-platform.js", () => ({
  countWebhookSubscriptions: vi.fn().mockResolvedValue(0),
  WEBHOOK_SUBSCRIPTION_LIMIT: 10,
}));
vi.mock("../services/webhooks.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/webhooks.js")>()),
  testWebhookForUser: mockTestWebhook,
}));

import { WEBHOOK_EVENTS } from "../lib/user-webhook-delivery.js";
import { registerWebhooksRoutes } from "../routes/v1/webhooks.js";

type SchemaObject = {
  type?: string;
  required?: string[];
  properties?: Record<string, SchemaObject>;
  items?: SchemaObject;
  enum?: unknown[];
  minItems?: number;
  $ref?: string;
};
type Operation = {
  operationId?: string;
  tags?: string[];
  requestBody?: { content: Record<string, { schema: SchemaObject }> };
  responses: Record<
    string,
    { $ref?: string; content?: Record<string, { schema: SchemaObject }> }
  >;
};

const here = dirname(fileURLToPath(import.meta.url));
const spec = JSON.parse(
  readFileSync(resolve(here, "../../openapi/openapi.json"), "utf8"),
) as {
  paths: Record<string, Record<string, Operation>>;
  components: { schemas: Record<string, SchemaObject> };
};

const WEBHOOK_ID = "5f0c2f4e-8a59-4d6b-9a6f-3f1f2a0b9c11";

function op(method: string, path: string): Operation {
  const found = spec.paths[path]?.[method];
  if (!found) throw new Error(`${method.toUpperCase()} ${path} not in spec`);
  return found;
}

function resolveSchema(schema: SchemaObject): SchemaObject {
  if (!schema.$ref) return schema;
  const name = schema.$ref.replace("#/components/schemas/", "");
  const target = spec.components.schemas[name];
  if (!target) throw new Error(`unresolved ${schema.$ref}`);
  return target;
}

function jsonBody(operation: Operation): SchemaObject {
  return resolveSchema(
    operation.requestBody!.content["application/json"]!.schema,
  );
}

function jsonResponse(operation: Operation, status: string): SchemaObject {
  return resolveSchema(
    operation.responses[status]!.content!["application/json"]!.schema,
  );
}

/** Drizzle-ish builder: every method returns itself, awaiting yields `result`. */
function chain(result: unknown, onSet?: (v: Record<string, unknown>) => void) {
  const promise = Promise.resolve(result);
  const proxy: unknown = new Proxy(promise, {
    get(target, prop) {
      if (prop === "then" || prop === "catch" || prop === "finally") {
        return (target[prop as "then"] as (...a: unknown[]) => unknown).bind(
          target,
        );
      }
      if (prop === "set" && onSet) {
        return (values: Record<string, unknown>) => {
          onSet(values);
          return proxy;
        };
      }
      return () => proxy;
    },
  });
  return proxy;
}

let app: FastifyInstance;
const registered: Array<[string, string]> = [];

beforeEach(async () => {
  vi.clearAllMocks();
  state.updateSets = [];
  registered.length = 0;
  mockAllowedUrl.mockResolvedValue(true);
  mockDb.update.mockImplementation(() =>
    chain(
      [
        {
          id: WEBHOOK_ID,
          url: "https://example.com/hook",
          events: ["post.published"],
          active: false,
          updated_at: new Date("2026-10-01T00:00:00Z"),
        },
      ],
      (values) => state.updateSets.push(values),
    ),
  );

  app = Fastify();
  app.addHook("onRoute", (route) => {
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    for (const method of methods) {
      if (method === "HEAD") continue;
      registered.push([
        method.toLowerCase(),
        route.url.replace(/:([A-Za-z]+)/g, "{$1}"),
      ]);
    }
  });
  await app.register(registerWebhooksRoutes, { prefix: "/v1" });
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

describe("v1 webhooks spec coverage", () => {
  it("documents every route the server registers", () => {
    expect(registered.length).toBeGreaterThan(0);
    for (const [method, path] of registered) {
      const operation = spec.paths[path]?.[method];
      expect(operation, `${method.toUpperCase()} ${path}`).toBeTruthy();
      expect(operation!.tags).toContain("Webhooks");
    }
  });

  it("lists exactly the subscribable events on create and update", () => {
    for (const [method, path] of [
      ["post", "/v1/webhooks"],
      ["patch", "/v1/webhooks/{id}"],
    ] as const) {
      const events = jsonBody(op(method, path)).properties!.events!;
      expect(events.items!.enum, `${method} ${path}`).toEqual([
        ...WEBHOOK_EVENTS,
      ]);
    }
  });
});

describe("PATCH /v1/webhooks/{id}", () => {
  const update = op("patch", "/v1/webhooks/{id}");

  it("documents the updatable fields and the 400", () => {
    const body = jsonBody(update);
    expect(Object.keys(body.properties ?? {}).sort()).toEqual([
      "active",
      "events",
      "url",
    ]);
    expect(body.required ?? []).toEqual([]);
    expect(body.properties!.events!.minItems).toBe(1);
    expect(update.responses["400"]).toBeTruthy();
  });

  it("accepts a body built from the documented schema", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/v1/webhooks/${WEBHOOK_ID}`,
      payload: {
        url: "https://example.com/hook",
        events: ["post.published"],
        active: false,
      },
    });
    expect(res.statusCode).toBe(200);
    expect(state.updateSets[0]).toMatchObject({
      url: "https://example.com/hook",
      events: ["post.published"],
      active: false,
    });

    const documented = Object.keys(
      jsonResponse(update, "200").properties ?? {},
    );
    for (const key of Object.keys(res.json() as object)) {
      expect(documented, key).toContain(key);
    }
  });

  it("answers the documented 400 for an empty events list", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/v1/webhooks/${WEBHOOK_ID}`,
      payload: { events: [] },
    });
    expect(res.statusCode).toBe(400);
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("answers the documented 400 for a non-public URL", async () => {
    mockAllowedUrl.mockResolvedValue(false);
    const res = await app.inject({
      method: "PATCH",
      url: `/v1/webhooks/${WEBHOOK_ID}`,
      payload: { url: "https://internal.example/hook" },
    });
    expect(res.statusCode).toBe(400);
    expect(mockDb.update).not.toHaveBeenCalled();
  });
});

describe("POST /v1/webhooks/{id}/test", () => {
  it("returns exactly the fields its documented schema declares", async () => {
    mockTestWebhook.mockResolvedValue({
      subscriptionId: WEBHOOK_ID,
      deliveryId: "0b7c5f0a-1c2d-4e3f-8a9b-0c1d2e3f4a5b",
      event: "webhook.test",
      url: "https://example.com/hook",
      status: "delivered",
      responseStatus: 200,
      attempts: 1,
      durationMs: 42,
      error: null,
    });

    const res = await app.inject({
      method: "POST",
      url: `/v1/webhooks/${WEBHOOK_ID}/test`,
    });
    expect(res.statusCode).toBe(200);

    const schema = jsonResponse(op("post", "/v1/webhooks/{id}/test"), "200");
    const documented = Object.keys(schema.properties ?? {}).sort();
    expect(Object.keys(res.json() as object).sort()).toEqual(documented);
    expect(documented).not.toContain("id");
    expect(documented).not.toContain("created_at");
    expect([...(schema.required ?? [])].sort()).toEqual(documented);
  });
});
