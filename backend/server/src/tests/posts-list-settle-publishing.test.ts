/**
 * The posts list settles a post stuck in "publishing" only once every
 * delivery is terminal, and its UPDATE re-checks that. Reading Posts while
 * YouTube was still uploading (X published, TikTok failed) used to persist
 * "partial", which let deletePost orphan the upload and postAgain repost it.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

const h = vi.hoisted(() => ({
  update: vi.fn(),
  set: vi.fn(),
  where: vi.fn(),
}));

vi.mock("../db/index.js", () => ({ db: { update: h.update } }));

import {
  settledPublishingStatus,
  settlePublishingPosts,
  settlePublishingWhere,
} from "../lib/posts-list/settle-publishing.js";

const dialect = new PgDialect();
const render = (where: SQL | undefined) => dialect.sqlToQuery(where!);

const rows = (...statuses: string[]) => statuses.map((status) => ({ status }));

describe("settledPublishingStatus", () => {
  it("does not settle while a delivery is still pending or publishing", () => {
    expect(settledPublishingStatus(rows("published", "failed", "pending"))).toBeNull();
    expect(settledPublishingStatus(rows("published", "failed", "publishing"))).toBeNull();
    expect(settledPublishingStatus(rows("published", "pending"))).toBeNull();
  });

  it("settles mixed terminal rows as partial and all-published as published", () => {
    expect(settledPublishingStatus(rows("published", "failed", "failed"))).toBe("partial");
    expect(settledPublishingStatus(rows("published", "published"))).toBe("published");
  });

  it("leaves no rows and all-failed alone", () => {
    expect(settledPublishingStatus([])).toBeNull();
    expect(settledPublishingStatus(rows("failed", "failed"))).toBeNull();
  });
});

describe("settlePublishingWhere", () => {
  it("partial: still publishing and no open delivery, checked in the UPDATE", () => {
    const { sql, params } = render(settlePublishingWhere(["p1", "p2"], "partial"));
    expect(sql).toMatch(/"posts"\."status" = \$\d/);
    expect(params).toContain("publishing");
    expect(sql).toMatch(
      /not exists \(select 1 from post_publications pp where pp\.post_id = "posts"\."id" and pp\.status in \('pending', 'publishing'\)\)/,
    );
    expect(params).toEqual(expect.arrayContaining(["p1", "p2"]));
  });

  it("published: no delivery that is not published", () => {
    const { sql } = render(settlePublishingWhere(["p1"], "published"));
    expect(sql).toMatch(/"posts"\."status" = \$\d/);
    expect(sql).toMatch(/pp\.post_id = "posts"\."id" and pp\.status <> 'published'/);
  });
});

describe("settlePublishingPosts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.update.mockReturnValue({ set: h.set });
    h.set.mockReturnValue({ where: h.where });
    h.where.mockResolvedValue(undefined);
  });

  it("writes nothing for no ids", async () => {
    await settlePublishingPosts([], "partial");
    expect(h.update).not.toHaveBeenCalled();
  });

  it("writes the status behind the guarded where", async () => {
    await settlePublishingPosts(["p1"], "partial");
    expect(h.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: "partial" }),
    );
    const { sql } = render(h.where.mock.calls[0][0] as SQL);
    expect(sql).toContain("not exists");
    expect(sql).toContain("pp.status in ('pending', 'publishing')");
  });
});
