/**
 * `GET /v1/posts/:id/events` ownership check (`loadPublishTimelineForOwnedPost`).
 *
 * API keys read the personal (main) pool only. Team-workspace posts carry the
 * owner's `userId`, so filtering on `userId` alone handed a workspace post's
 * publish timeline (platform error messages included) to the owner's API key,
 * while `GET /v1/posts/:id` 404'd the same post. The ownership query must also
 * require `workspace_id IS NULL`, and a non-UUID id must short-circuit to
 * "not found" without touching the database (same as `v1GetPost`).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

const { mockDb } = vi.hoisted(() => ({
  mockDb: { select: vi.fn() },
}));

vi.mock("../db/index.js", () => ({ db: mockDb }));

const { loadPublishTimelineForOwnedPost } = await import(
  "../lib/publish-timeline.js"
);

type Captured = { from?: unknown; where?: SQL };

/** Drizzle-style builder that records its args; awaiting yields `rows`. */
function selectChain(rows: unknown[], captured: Captured) {
  const chain: Record<string, unknown> = {};
  const self: Record<string, unknown> = new Proxy(chain, {
    get(_t, prop) {
      if (prop === "then") {
        return (resolve: (v: unknown) => void) => resolve(rows);
      }
      return (...args: unknown[]) => {
        if (prop === "from") captured.from = args[0];
        if (prop === "where") captured.where = args[0] as SQL;
        return self;
      };
    },
  });
  return self;
}

const dialect = new PgDialect();
const POST_ID = "11111111-2222-4333-8444-555555555555";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("loadPublishTimelineForOwnedPost", () => {
  it("scopes the ownership check to the personal pool", async () => {
    const ownership: Captured = {};
    // Ownership lookup finds nothing (a workspace post is filtered out).
    mockDb.select.mockReturnValueOnce(selectChain([], ownership));

    const result = await loadPublishTimelineForOwnedPost(POST_ID, "owner-1");

    expect(result).toBeNull();
    expect(mockDb.select).toHaveBeenCalledTimes(1);
    const { sql: text, params } = dialect.sqlToQuery(ownership.where!);
    expect(text).toContain('"posts"."user_id" = $');
    expect(text).toContain('"posts"."workspace_id" is null');
    expect(params).toEqual([POST_ID, "owner-1"]);
  });

  it("returns the timeline when the personal-pool post is owned", async () => {
    mockDb.select
      // ownership
      .mockReturnValueOnce(selectChain([{ id: POST_ID }], {}))
      // publish_job_events
      .mockReturnValueOnce(
        selectChain(
          [
            {
              id: "ev-1",
              phase: "published",
              platform: "x",
              message: null,
              createdAt: new Date("2026-10-01T00:00:00.000Z"),
            },
          ],
          {},
        ),
      )
      // resurface schedules, auto plugs
      .mockReturnValue(selectChain([], {}));

    const result = await loadPublishTimelineForOwnedPost(POST_ID, "owner-1");

    expect(result).toEqual([
      {
        id: "ev-1",
        phase: "published",
        platform: "x",
        message: null,
        createdAt: "2026-10-01T00:00:00.000Z",
      },
    ]);
  });

  it("treats a non-UUID id as not found without querying", async () => {
    const result = await loadPublishTimelineForOwnedPost("not-a-uuid", "owner-1");
    expect(result).toBeNull();
    expect(mockDb.select).not.toHaveBeenCalled();
  });
});
