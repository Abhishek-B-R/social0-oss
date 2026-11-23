/**
 * Webhook delivery log paging.
 *
 * The regression this pins: `webhook_deliveries.created_at` stores
 * microseconds, but the cursor handed back (`next_before` on /v1, the last
 * row's `createdAt` in the dashboard drawer) was a JS Date, truncated to the
 * millisecond, and the next page asked for `created_at < cursor`. Two
 * deliveries landing in the same millisecond across a page boundary meant the
 * older one was never returned on any page. Paging is now a (created_at, id)
 * keyset with the timestamp kept at full precision.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

const { mockDb, calls } = vi.hoisted(() => {
  const calls: { where: unknown[]; orderBy: unknown[][] } = {
    where: [],
    orderBy: [],
  };
  return { mockDb: { select: vi.fn() }, calls };
});

vi.mock("../db/index.js", () => ({ db: mockDb }));
vi.mock("@/db", () => ({ db: mockDb }));

/** Drizzle-ish builder that records where/orderBy and resolves to `result`. */
function chain(result: unknown): unknown {
  const promise = Promise.resolve(result);
  const proxy: unknown = new Proxy(promise, {
    get(target, prop) {
      if (prop === "then" || prop === "catch" || prop === "finally") {
        return (target[prop as "then"] as (...a: unknown[]) => unknown).bind(
          target,
        );
      }
      if (prop === "where") {
        return (arg: unknown) => {
          calls.where.push(arg);
          return proxy;
        };
      }
      if (prop === "orderBy") {
        return (...args: unknown[]) => {
          calls.orderBy.push(args);
          return proxy;
        };
      }
      return () => proxy;
    },
  });
  return proxy;
}

const {
  listWebhookDeliveriesForUser,
  parseDeliveryCursor,
} = await import("../services/webhooks.js");

const USER_ID = "user_1";
const WEBHOOK_ID = "11111111-1111-4111-8111-111111111111";
const ROW_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const dialect = new PgDialect();
const render = (fragment: unknown) => dialect.sqlToQuery(fragment as SQL);

function deliveryRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ROW_ID,
    deliveryId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    event: "post.scheduled",
    url: "https://hooks.example.com/x",
    status: "delivered",
    responseStatus: 200,
    attempts: 1,
    durationMs: 12,
    error: null,
    createdAt: new Date("2026-10-20T10:00:00.123Z"),
    createdAtExact: "2026-10-20T10:00:00.123456",
    ...overrides,
  };
}

/** First select: the ownership lookup. Second: the delivery page. */
function mockQueries(deliveries: unknown[]) {
  mockDb.select
    .mockImplementationOnce(() => chain([{ id: WEBHOOK_ID }]))
    .mockImplementationOnce(() => chain(deliveries));
}

beforeEach(() => {
  vi.resetAllMocks();
  calls.where.length = 0;
  calls.orderBy.length = 0;
});

describe("parseDeliveryCursor", () => {
  it("keeps the microseconds and the id of a minted cursor", () => {
    expect(
      parseDeliveryCursor(`2026-10-20T10:00:00.123456Z_${ROW_ID}`),
    ).toEqual({ createdAt: "2026-10-20T10:00:00.123456", id: ROW_ID });
  });

  it("still accepts a legacy ISO timestamp cursor", () => {
    expect(parseDeliveryCursor("2026-10-20T10:00:00.123Z")).toEqual({
      createdAt: "2026-10-20T10:00:00.123",
      id: null,
    });
    // Offsets normalise to the UTC wall clock the column stores.
    expect(parseDeliveryCursor("2026-10-20T15:30:00.000+05:30")).toEqual({
      createdAt: "2026-10-20T10:00:00.000",
      id: null,
    });
  });

  it("pages from the newest on garbage instead of reaching Postgres", () => {
    expect(parseDeliveryCursor(undefined)).toBeNull();
    expect(parseDeliveryCursor("")).toBeNull();
    expect(parseDeliveryCursor("not-a-date")).toBeNull();
    // Calendar overflow would make the ::timestamp cast throw.
    expect(
      parseDeliveryCursor(`2026-02-31T10:00:00.123456Z_${ROW_ID}`),
    ).toBeNull();
    expect(
      parseDeliveryCursor("2026-10-20T10:00:00.123456Z_not-a-uuid"),
    ).toBeNull();
  });
});

describe("listWebhookDeliveriesForUser paging", () => {
  it("mints each row's cursor from the full-precision timestamp and id", async () => {
    mockQueries([deliveryRow()]);
    const rows = await listWebhookDeliveriesForUser(USER_ID, WEBHOOK_ID, {
      limit: 1,
    });

    expect(rows).toHaveLength(1);
    const [row] = rows!;
    expect(row!.cursor).toBe(`2026-10-20T10:00:00.123456Z_${ROW_ID}`);
    expect(row).not.toHaveProperty("createdAtExact");
    // The cursor round-trips without losing the microseconds.
    expect(parseDeliveryCursor(row!.cursor)).toEqual({
      createdAt: "2026-10-20T10:00:00.123456",
      id: ROW_ID,
    });
  });

  it("orders by (created_at, id) and filters strictly after the cursor row", async () => {
    mockQueries([]);
    await listWebhookDeliveriesForUser(USER_ID, WEBHOOK_ID, {
      before: parseDeliveryCursor(`2026-10-20T10:00:00.123456Z_${ROW_ID}`),
    });

    const where = render(calls.where.at(-1));
    expect(where.sql).toContain(
      '("webhook_deliveries"."created_at", "webhook_deliveries"."id") < (',
    );
    expect(where.sql).toMatch(/\$\d+::timestamp, \$\d+::uuid\)/);
    // Full precision reaches Postgres: a same-millisecond older row
    // (…00.123100) sorts after this cursor and lands on the next page.
    expect(where.params).toContain("2026-10-20T10:00:00.123456");
    expect(where.params).toContain(ROW_ID);

    const order = calls.orderBy.at(-1)!.map((frag) => render(frag).sql);
    expect(order).toEqual([
      '"webhook_deliveries"."created_at" desc',
      '"webhook_deliveries"."id" desc',
    ]);
  });

  it("keeps the plain created_at bound for a legacy timestamp cursor", async () => {
    mockQueries([]);
    await listWebhookDeliveriesForUser(USER_ID, WEBHOOK_ID, {
      before: parseDeliveryCursor("2026-10-20T10:00:00.123Z"),
    });

    const where = render(calls.where.at(-1));
    expect(where.sql).toMatch(
      /"webhook_deliveries"\."created_at" < \$\d+::timestamp/,
    );
    expect(where.sql).not.toContain('"webhook_deliveries"."id") <');
    expect(where.params).toContain("2026-10-20T10:00:00.123");
  });

  it("returns null for someone else's webhook without querying deliveries", async () => {
    mockDb.select.mockImplementationOnce(() => chain([]));
    await expect(
      listWebhookDeliveriesForUser(USER_ID, WEBHOOK_ID),
    ).resolves.toBeNull();
    expect(mockDb.select).toHaveBeenCalledTimes(1);
  });
});
