/**
 * Terminal posts whose finalize never finished.
 *
 * The stale-`publishing` sweep was the only backstop for a finalize that never
 * ran, and it only looks at `publishing` posts. `recordPlatformResultServer`,
 * the CF worker, `executePublish` and the posts list all move a post to its
 * terminal status before finalize, so a process killed in between (every
 * deploy) left a post that read "published" with no webhook, no Auto-Plug /
 * Auto-Repost, its queue slot stuck in `processing`, and, when partial, no
 * failure email. This sweep finds those by finalize's own marker instead.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

const h = vi.hoisted(() => ({
  select: vi.fn(),
  where: vi.fn(),
  limit: vi.fn(),
  rows: [] as { id: string; userId: string }[],
}));

vi.mock("../db/index.js", () => ({ db: { select: h.select } }));

import {
  POST_FINALIZED_KEY,
  UNFINALIZED_GRACE_MS,
  UNFINALIZED_LOOKBACK_MS,
  UNFINALIZED_SWEEP_LIMIT,
  sweepUnfinalizedPosts,
  unfinalizedPostsWhere,
} from "../cron/sweep-unfinalized-posts.js";

const real = drizzle.mock();
const dialect = new PgDialect();
const render = (where: SQL | undefined) => dialect.sqlToQuery(where!);

const NOW = new Date("2026-10-21T12:00:00.000Z");

beforeEach(() => {
  vi.clearAllMocks();
  h.rows = [];
  h.select.mockImplementation((columns: Record<string, unknown>) => {
    // The candidate subquery is real SQL; the outer read returns the rows.
    if (!("userId" in columns)) return real.select(columns as never);
    return {
      from: () => ({
        where: (where: SQL) => {
          h.where(where);
          return {
            limit: (n: number) => {
              h.limit(n);
              return Promise.resolve(h.rows);
            },
          };
        },
      }),
    };
  });
});

describe("unfinalizedPostsWhere", () => {
  it("matches terminal posts without the finalize marker whose deliveries all settled in the window", () => {
    const after = new Date(NOW.getTime() - UNFINALIZED_LOOKBACK_MS);
    const before = new Date(NOW.getTime() - UNFINALIZED_GRACE_MS);
    const { sql, params } = render(unfinalizedPostsWhere(after, before));

    expect(sql).toContain(`"posts"."status" in ($1, $2, $3)`);
    expect(params.slice(0, 3)).toEqual(["published", "partial", "failed"]);
    // Keyed on finalize's own marker, not on the status.
    expect(sql).toMatch(/"posts"\."metadata" ->> \$\d+::text\) is null/);
    expect(params).toContain(POST_FINALIZED_KEY);
    // Candidate window on the deliveries, bound as UTC ISO strings.
    expect(sql).toContain(`select "post_id" from "post_publications"`);
    expect(params).toContain(after.toISOString());
    expect(params).toContain(before.toISOString());
    // Nothing still open, nothing inside the grace period.
    expect(sql).toContain("not exists (select 1 from post_publications pp");
    expect(sql).toContain("pp.status not in ('published', 'failed')");
    expect(sql).toMatch(/coalesce\(pp\.updated_at, pp\.created_at\) >= \$\d+/);
  });

  it("does not key the window on posts.updated_at, which finalize bumps every run", () => {
    const { sql } = render(
      unfinalizedPostsWhere(new Date(0), new Date(1)),
    );
    expect(sql).not.toContain(`"posts"."updated_at"`);
  });
});

describe("sweepUnfinalizedPosts", () => {
  it("asks for a finalize of each post it finds, bounded per tick", async () => {
    h.rows = [
      { id: "post-1", userId: "user-1" },
      { id: "post-2", userId: "user-2" },
    ];
    const request = vi.fn();

    const n = await sweepUnfinalizedPosts(request, NOW);

    expect(n).toBe(2);
    expect(h.limit).toHaveBeenCalledWith(UNFINALIZED_SWEEP_LIMIT);
    expect(request).toHaveBeenCalledWith(
      "post-1",
      "user-1",
      expect.any(String),
    );
    expect(request).toHaveBeenCalledWith(
      "post-2",
      "user-2",
      expect.any(String),
    );

    const { params } = render(h.where.mock.calls[0]![0] as SQL);
    expect(params).toContain(
      new Date(NOW.getTime() - UNFINALIZED_GRACE_MS).toISOString(),
    );
    expect(params).toContain(
      new Date(NOW.getTime() - UNFINALIZED_LOOKBACK_MS).toISOString(),
    );
  });

  it("asks for nothing when every terminal post was finalized", async () => {
    const request = vi.fn();
    await expect(sweepUnfinalizedPosts(request, NOW)).resolves.toBe(0);
    expect(request).not.toHaveBeenCalled();
  });
});
