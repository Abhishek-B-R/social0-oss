/**
 * TikTok publish-time backfill must never hand a publication another post's
 * video. The match is persisted onto post_publications and never re-resolved,
 * so a wrong one showed a neighbor's views and likes forever and counted that
 * video twice in overview totals.
 *
 * - A still-processing or private publish (`publish/status` OK, no public id)
 *   keeps its `ttpub:` id: only a dead publish id may fall back to video.list.
 * - Videos another publication of the account already owns are skipped.
 * - Two candidates in the window, or a candidate another unresolved
 *   publication could own, is ambiguous: keep the `ttpub:` id.
 * - Persisting refuses a video id another publication of the account holds.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

const { mockDb } = vi.hoisted(() => ({ mockDb: { update: vi.fn(), select: vi.fn() } }));
vi.mock("../db/index.js", () => ({ db: mockDb }));

const { fetchPlatformPublicationMetrics } = await import(
  "../lib/analytics/fetch-platform-metrics.js"
);
const { persistResolvedPlatformPostId, tikTokBackfillContextFromRows } = await import(
  "../lib/analytics/tiktok-video-claims.js"
);
const { pickTikTokVideoByPublishTime } = await import("../lib/tiktok-post-id.js");

const PUBLISHED_B = new Date("2026-03-01T10:10:00.000Z");
const PUBLISHED_A = new Date("2026-03-01T10:00:00.000Z");
const VIDEO_A = "7000000000000000001";
const VIDEO_B = "7000000000000000002";
const sec = (d: Date, offsetMs = 0) => Math.floor((d.getTime() + offsetMs) / 1000);

type Route = (body: Record<string, unknown>) => unknown;

/** Routes TikTok endpoints by path and records which were called. */
function tiktokFetch(routes: Record<string, Route>) {
  const calls: string[] = [];
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const path = new URL(url).pathname;
    calls.push(path);
    const route = routes[path];
    if (!route) throw new Error(`unexpected fetch ${path}`);
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    return new Response(JSON.stringify(route(body)), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  return { fn, calls };
}

const STATUS = "/v2/post/publish/status/fetch/";
const LIST = "/v2/video/list/";
const QUERY = "/v2/video/query/";

const deadPublishId = () => ({
  error: { code: "invalid_publish_id", message: "publish_id is invalid" },
});
const ok = (data: unknown) => ({ data, error: { code: "ok" } });
const queryVideo: Route = (body) => {
  const ids = (body.filters as { video_ids: string[] }).video_ids;
  return ok({ videos: [{ id: ids[0], view_count: 10, like_count: 2 }] });
};

function tiktokInput(loadContext = vi.fn(async () => ({}))) {
  return {
    platform: "tiktok",
    platformPostId: "ttpub:v_pub_b",
    platformUserId: "me",
    accessToken: "token",
    publishedAt: PUBLISHED_B,
    loadTikTokBackfillContext: loadContext,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  mockDb.update.mockReset();
});

describe("pickTikTokVideoByPublishTime", () => {
  const near = [
    { id: VIDEO_A, create_time: sec(PUBLISHED_A, 30_000) },
    { id: VIDEO_B, create_time: sec(PUBLISHED_B, 30_000) },
  ];

  it("refuses to guess between two videos inside the window", () => {
    expect(pickTikTokVideoByPublishTime(near, PUBLISHED_B)).toBeNull();
  });

  it("skips a video another publication already owns", () => {
    expect(
      pickTikTokVideoByPublishTime(near, PUBLISHED_B, {
        claimedVideoIds: new Set([VIDEO_A]),
      }),
    ).toBe(VIDEO_B);
  });

  it("never matches a neighbor's video when ours is not listed", () => {
    // Only A's video is listed and A owns it: nothing left for B.
    expect(
      pickTikTokVideoByPublishTime([near[0]], PUBLISHED_B, {
        claimedVideoIds: new Set([VIDEO_A]),
      }),
    ).toBeNull();
  });

  it("refuses a candidate another unresolved publication could own", () => {
    // A is also still a ttpub id: A's video is unique in B's window, but it
    // is just as close to A's publish time.
    expect(
      pickTikTokVideoByPublishTime([near[0]], PUBLISHED_B, {
        rivalPublishedAt: [PUBLISHED_A],
      }),
    ).toBeNull();
    expect(pickTikTokVideoByPublishTime([near[0]], PUBLISHED_A)).toBe(VIDEO_A);
  });

  it("counts a video repeated across pages once", () => {
    expect(
      pickTikTokVideoByPublishTime([near[1], { ...near[1] }], PUBLISHED_B),
    ).toBe(VIDEO_B);
  });
});

describe("TikTok analytics resolve", () => {
  it("keeps a pending publish on its ttpub id and never lists videos", async () => {
    const loadContext = vi.fn(async () => ({}));
    const { fn, calls } = tiktokFetch({
      [STATUS]: () => ok({ status: "PROCESSING_UPLOAD", publicaly_available_post_id: [] }),
      [LIST]: () => ok({ videos: [{ id: VIDEO_A, create_time: sec(PUBLISHED_A) }] }),
      [QUERY]: queryVideo,
    });
    vi.stubGlobal("fetch", fn);

    const result = await fetchPlatformPublicationMetrics(tiktokInput(loadContext));

    expect(result.status).toBe("error");
    expect(result.resolvedPlatformPostId).toBeUndefined();
    expect(calls).toEqual([STATUS]);
    expect(loadContext).not.toHaveBeenCalled();
  });

  it("does not backfill on a transient publish-status failure", async () => {
    const { fn, calls } = tiktokFetch({
      [STATUS]: () => ({ error: { code: "internal_error", message: "try later" } }),
    });
    vi.stubGlobal("fetch", fn);

    const result = await fetchPlatformPublicationMetrics(tiktokInput());

    expect(result).toMatchObject({ status: "error", error: "try later" });
    expect(calls).toEqual([STATUS]);
  });

  it("backfills a dead publish id with the one unclaimed video", async () => {
    const { fn } = tiktokFetch({
      [STATUS]: deadPublishId,
      [LIST]: () =>
        ok({
          videos: [
            { id: VIDEO_B, create_time: sec(PUBLISHED_B, 20_000) },
            { id: VIDEO_A, create_time: sec(PUBLISHED_A, 20_000) },
          ],
          has_more: false,
        }),
      [QUERY]: queryVideo,
    });
    vi.stubGlobal("fetch", fn);
    const loadContext = vi.fn(async () => ({ claimedVideoIds: new Set([VIDEO_A]) }));

    const result = await fetchPlatformPublicationMetrics(tiktokInput(loadContext));

    expect(result.status).toBe("ok");
    expect(result.resolvedPlatformPostId).toBe(VIDEO_B);
    expect(result.metrics.views).toBe(10);
    expect(loadContext).toHaveBeenCalledOnce();
  });

  it("keeps the ttpub id when a dead publish id has two candidates", async () => {
    const { fn, calls } = tiktokFetch({
      [STATUS]: deadPublishId,
      [LIST]: () =>
        ok({
          videos: [
            { id: VIDEO_B, create_time: sec(PUBLISHED_B, 20_000) },
            { id: VIDEO_A, create_time: sec(PUBLISHED_A, 20_000) },
          ],
          has_more: false,
        }),
      [QUERY]: queryVideo,
    });
    vi.stubGlobal("fetch", fn);

    const result = await fetchPlatformPublicationMetrics(tiktokInput());

    expect(result).toMatchObject({ status: "error", error: "publish_id is invalid" });
    expect(result.resolvedPlatformPostId).toBeUndefined();
    expect(calls).not.toContain(QUERY);
  });

  it("reads past a page boundary before deciding the match is unique", async () => {
    // Page 1 ends just after B's publish time; A's video sits on page 2,
    // still inside B's window. Picking on page 1 alone would claim it.
    const { fn, calls } = tiktokFetch({
      [STATUS]: deadPublishId,
      [LIST]: (body) =>
        body.cursor == null
          ? ok({
              videos: [{ id: VIDEO_B, create_time: sec(PUBLISHED_B, 60_000) }],
              has_more: true,
              cursor: 1,
            })
          : ok({
              videos: [{ id: VIDEO_A, create_time: sec(PUBLISHED_B, -5 * 60_000) }],
              has_more: false,
            }),
      [QUERY]: queryVideo,
    });
    vi.stubGlobal("fetch", fn);

    const result = await fetchPlatformPublicationMetrics(tiktokInput());

    expect(calls.filter((c) => c === LIST)).toHaveLength(2);
    expect(result.resolvedPlatformPostId).toBeUndefined();
  });

  it("skips the backfill when the caller cannot vouch for claimed ids", async () => {
    const { fn, calls } = tiktokFetch({ [STATUS]: deadPublishId });
    vi.stubGlobal("fetch", fn);
    const { loadTikTokBackfillContext: _omit, ...input } = tiktokInput();

    const result = await fetchPlatformPublicationMetrics(input);

    expect(result.status).toBe("error");
    expect(calls).toEqual([STATUS]);
  });
});

describe("TikTok backfill context", () => {
  it("splits other publications into claimed ids and unresolved rivals", () => {
    const ctx = tikTokBackfillContextFromRows([
      { platformPostId: VIDEO_A, publishedAt: PUBLISHED_A, status: "published" },
      { platformPostId: "ttpub:v_pub_c", publishedAt: PUBLISHED_B, status: "published" },
      { platformPostId: "ttpub:v_pub_d", publishedAt: PUBLISHED_B, status: "failed" },
      { platformPostId: "ttpub:v_pub_e", publishedAt: null, status: "published" },
    ]);
    expect([...ctx.claimedVideoIds]).toEqual([VIDEO_A]);
    expect(ctx.rivalPublishedAt).toEqual([PUBLISHED_B]);
  });
});

describe("persistResolvedPlatformPostId", () => {
  function updateChain(returned: unknown[], captured: { where?: SQL }) {
    const chain = {
      set: () => chain,
      where: (w: SQL) => {
        captured.where = w;
        return chain;
      },
      returning: async () => returned,
    };
    return chain;
  }

  it("only writes when no other publication of the account holds the id", async () => {
    const captured: { where?: SQL } = {};
    mockDb.update.mockReturnValue(updateChain([], captured));
    // The NOT EXISTS subquery is built from db.select; give it a real builder.
    const { QueryBuilder } = await import("drizzle-orm/pg-core");
    mockDb.select.mockImplementation((fields: never) => new QueryBuilder().select(fields));

    const stored = await persistResolvedPlatformPostId({
      publicationId: "pub-b",
      connectedAccountId: "acc-1",
      platformPostId: VIDEO_A,
    });

    expect(stored).toBe(false);
    const { sql: text, params } = new PgDialect().sqlToQuery(captured.where!);
    expect(text.toLowerCase()).toContain("not exists");
    expect(params).toEqual(expect.arrayContaining(["pub-b", "acc-1", VIDEO_A]));
  });

  it("reports a successful write", async () => {
    mockDb.update.mockReturnValue(updateChain([{ id: "pub-b" }], {}));
    const { QueryBuilder } = await import("drizzle-orm/pg-core");
    mockDb.select.mockImplementation((fields: never) => new QueryBuilder().select(fields));

    await expect(
      persistResolvedPlatformPostId({
        publicationId: "pub-b",
        connectedAccountId: "acc-1",
        platformPostId: VIDEO_B,
      }),
    ).resolves.toBe(true);
  });

  it("treats the unique index catching a concurrent write as not stored", async () => {
    const clash = Object.assign(new Error("duplicate key"), {
      code: "23505",
      constraint: "post_publications_account_platform_post_unique",
    });
    const chain = {
      set: () => chain,
      where: () => chain,
      returning: async () => {
        throw clash;
      },
    };
    mockDb.update.mockReturnValue(chain);
    const { QueryBuilder } = await import("drizzle-orm/pg-core");
    mockDb.select.mockImplementation((fields: never) => new QueryBuilder().select(fields));

    await expect(
      persistResolvedPlatformPostId({
        publicationId: "pub-b",
        connectedAccountId: "acc-1",
        platformPostId: VIDEO_A,
      }),
    ).resolves.toBe(false);
  });
});
