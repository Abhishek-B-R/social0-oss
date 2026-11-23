/**
 * An interrupted delivery is never sent again on its own.
 *
 * A run that dies mid-send (deploy, crash, killed isolate) leaves its row
 * `publishing`. The platform may already have created the post, so re-sending
 * it automatically can publish twice. Only a person retrying that delivery
 * from the dashboard takes it over; every other caller (queue redelivery,
 * cron, an API client calling publish again) marks it interrupted and leaves
 * it alone.
 */

import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb, mockDecrypt, mockHeartbeat, mockStopHeartbeat } = vi.hoisted(() => ({
  mockDb: { select: vi.fn(), update: vi.fn(), insert: vi.fn() },
  mockDecrypt: vi.fn(),
  mockHeartbeat: vi.fn(),
  mockStopHeartbeat: vi.fn(),
}));

vi.mock("../db/index.js", () => ({ db: mockDb }));
vi.mock("@social0/shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@social0/shared")>()),
  decryptToken: mockDecrypt,
}));
vi.mock("../lib/token-refresh.js", () => ({
  REFRESHABLE_PLATFORMS: new Set<string>(),
}));
vi.mock("../lib/linkedin-media.js", () => ({}));
vi.mock("../lib/twitter-media.js", () => ({}));
vi.mock("../lib/twitter-tweet-fetch.js", () => ({}));
vi.mock("../lib/publish-platforms/index.js", () => ({
  publishToPlatform: vi.fn(),
}));
vi.mock("@/lib/validation", () => import("../lib/validation.js"));
vi.mock("../lib/publication-lease.js", () => ({
  startPublicationHeartbeat: mockHeartbeat,
}));

import { INTERRUPTED_PUBLISH_ERROR } from "@social0/shared";
import { executePublish } from "../publish/execute-publish.js";

const POST_ID = "44444444-4444-4444-8444-444444444444";
const USER_ID = "user_1";
const PUB_ID = "pub-1";

function chain(result: unknown = []): unknown {
  const promise = Promise.resolve(result);
  const proxy: unknown = new Proxy(promise, {
    get(target, prop) {
      if (prop === "then" || prop === "catch" || prop === "finally") {
        return (target[prop as "then"] as (...a: unknown[]) => unknown).bind(target);
      }
      return () => proxy;
    },
  });
  return proxy;
}

type Row = { status: string; lastError: string | null; idle: boolean };
type Write = { values: Record<string, unknown>; where: SQL; returning: boolean };

const dialect = new PgDialect();
function render(where: SQL): { sql: string; params: unknown[] } {
  return dialect.sqlToQuery(where);
}

/**
 * One delivery whose state the conditional updates move like Postgres would:
 * the claim flips pending/failed, the takeover flips an idle `publishing`, and
 * the interrupt flips an idle `publishing` to failed.
 */
function wire(row: Row): { row: Row; writes: Write[] } {
  const writes: Write[] = [];
  mockDb.select.mockImplementation((fields: Record<string, unknown>) => {
    if ("publicationIdle" in fields) {
      return chain([
        {
          publicationId: PUB_ID,
          publicationStatus: row.status,
          publicationLastError: row.lastError,
          platformPostUrl: null,
          connectedAccountId: "acc-1",
          platform: "pinterest",
          platformUserId: "pin-user",
          platformUsername: "acme",
          platformAccountType: null,
          encryptedAccessToken: "enc",
          encryptedRefreshToken: null,
          tokenExpiresAt: null,
          tokenStatus: "active",
          platformMetadata: null,
          isTwitterPremium: false,
          publicationIdle: row.idle,
        },
      ]);
    }
    if ("finalContent" in fields) {
      return chain([
        { id: POST_ID, userId: USER_ID, finalContent: "hello", status: "publishing", mediaIds: [], metadata: null },
      ]);
    }
    return chain([]);
  });
  mockDb.update.mockImplementation(() => ({
    set: (values: Record<string, unknown>) => ({
      where: (where: SQL) => ({
        returning: async () => {
          writes.push({ values, where, returning: true });
          const { sql, params } = render(where);
          const excludesInterrupted =
            sql.includes('"last_error" <>') && params.includes(INTERRUPTED_PUBLISH_ERROR);
          if (values.status === "publishing") {
            const claimable =
              row.status === "pending" ||
              (row.status === "failed" &&
                !(excludesInterrupted && row.lastError === INTERRUPTED_PUBLISH_ERROR)) ||
              (row.status === "publishing" && row.idle);
            if (!claimable) return [];
            row.status = "publishing";
            row.lastError = null;
            row.idle = false;
            return [{ id: PUB_ID }];
          }
          if (values.status === "failed" && row.status === "publishing") {
            row.status = "failed";
            row.lastError = (values.lastError as string | null) ?? null;
            return [{ id: PUB_ID }];
          }
          return [];
        },
        then: (resolve: (v: unknown) => unknown) => {
          writes.push({ values, where, returning: false });
          return resolve(undefined);
        },
      }),
    }),
  }));
  return { row, writes };
}

beforeEach(() => {
  vi.resetAllMocks();
  mockHeartbeat.mockReturnValue(mockStopHeartbeat);
  // Stand-in for the platform call: a run that gets this far would publish.
  mockDecrypt.mockImplementation(() => {
    throw new Error("reached platform publish");
  });
});

describe("executePublish and interrupted deliveries", () => {
  it("does not re-send an idle publishing delivery on an automatic re-entry", async () => {
    const { row } = wire({ status: "publishing", lastError: null, idle: true });

    const result = await executePublish(POST_ID, undefined, PUB_ID);

    expect(mockDecrypt).not.toHaveBeenCalled();
    expect(row).toMatchObject({ status: "failed", lastError: INTERRUPTED_PUBLISH_ERROR });
    expect(result.results).toEqual([
      { platform: "pinterest", connectedAccountId: "acc-1", status: "failed", error: INTERRUPTED_PUBLISH_ERROR },
    ]);
  });

  it("does not claim a delivery already marked interrupted on an automatic re-entry", async () => {
    const { row, writes } = wire({ status: "failed", lastError: INTERRUPTED_PUBLISH_ERROR, idle: true });

    const result = await executePublish(POST_ID, USER_ID);

    expect(mockDecrypt).not.toHaveBeenCalled();
    expect(row.status).toBe("failed");
    expect(writes.some((w) => w.values.status === "publishing" && w.returning)).toBe(false);
    expect(result.results[0]).toMatchObject({ status: "failed", error: INTERRUPTED_PUBLISH_ERROR });
    expect(result.results[0]?.inProgressElsewhere).toBeUndefined();
  });

  it("still retries an ordinary failed delivery automatically", async () => {
    wire({ status: "failed", lastError: "HTTP 500", idle: true });

    await executePublish(POST_ID, USER_ID);

    expect(mockDecrypt).toHaveBeenCalledTimes(1);
  });

  it("lets a person's retry take over an idle publishing delivery", async () => {
    wire({ status: "publishing", lastError: null, idle: true });

    await executePublish(POST_ID, USER_ID, PUB_ID, undefined, { takeOverInterrupted: true });

    expect(mockDecrypt).toHaveBeenCalledTimes(1);
  });

  it("lets a person's retry send a delivery marked interrupted", async () => {
    wire({ status: "failed", lastError: INTERRUPTED_PUBLISH_ERROR, idle: true });

    await executePublish(POST_ID, USER_ID, PUB_ID, undefined, { takeOverInterrupted: true });

    expect(mockDecrypt).toHaveBeenCalledTimes(1);
  });

  it("never takes over a delivery another live run is still renewing", async () => {
    wire({ status: "publishing", lastError: null, idle: false });

    const result = await executePublish(POST_ID, USER_ID, PUB_ID, undefined, { takeOverInterrupted: true });

    expect(mockDecrypt).not.toHaveBeenCalled();
    expect(result.results[0]?.inProgressElsewhere).toBe(true);
  });

  it("holds the lease on the deliveries it owns while it publishes, then stops", async () => {
    wire({ status: "pending", lastError: null, idle: false });

    await executePublish(POST_ID, USER_ID);

    expect(mockHeartbeat).toHaveBeenCalledWith(POST_ID, [PUB_ID]);
    expect(mockStopHeartbeat).toHaveBeenCalledTimes(1);
  });
});
