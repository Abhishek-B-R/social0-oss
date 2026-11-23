/**
 * Auto-Repost / Auto-Plug saved with a scheduled or queued post
 * (`metadata.bulkAutoFeatures`).
 *
 * They were only set up on `executePublish`'s whole-post branch, and only
 * when every network published. A scheduled post never takes that branch:
 * the cron hands each platform to a per-publication job, so its Auto-Repost
 * and Auto-Plug were silently dropped. Setup now runs from
 * `maybeFinalizePostPublish`, which every path awaits, gated on the X delivery
 * itself — so X publishing while another network fails still counts.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockDb,
  inserts,
  mockClaim,
  mockRelease,
  mockResurfaceAllowed,
  mockAutoPlugAllowed,
} = vi.hoisted(() => ({
  mockDb: { select: vi.fn(), update: vi.fn(), insert: vi.fn() },
  /** Values of every INSERT, in order. */
  inserts: [] as Record<string, unknown>[],
  mockClaim: vi.fn(),
  mockRelease: vi.fn(),
  mockResurfaceAllowed: vi.fn(),
  mockAutoPlugAllowed: vi.fn(),
}));

vi.mock("../db/index.js", () => ({ db: mockDb }));
vi.mock("../lib/post-metadata-claim.js", () => ({
  claimPostMetadataKey: mockClaim,
  releasePostMetadataKey: mockRelease,
}));
vi.mock("../lib/plan-limits.js", () => ({
  checkResurfaceAllowed: mockResurfaceAllowed,
  checkAutoPlugAllowed: mockAutoPlugAllowed,
}));

import {
  BULK_AUTO_FEATURES_SETUP_KEY,
  setupBulkAutoFeaturesAfterPublish,
} from "../publish/bulk-auto-features.js";
import { sanitizePostMetadata } from "../lib/post-metadata-sanitize.js";

/** Drizzle-ish builder: every method returns itself, awaiting yields `result`. */
function chain(result: unknown = []): unknown {
  const promise = Promise.resolve(result);
  const proxy: unknown = new Proxy(promise, {
    get(target, prop) {
      if (prop === "then" || prop === "catch" || prop === "finally") {
        return (target[prop as "then"] as (...a: unknown[]) => unknown).bind(
          target,
        );
      }
      return () => proxy;
    },
  });
  return proxy;
}

const POST_ID = "44444444-4444-4444-8444-444444444444";
const USER_ID = "user_1";

const FEATURES = {
  bulkAutoFeatures: {
    autoRepostConfig: { intervalHours: 6, maxResurfaces: 3 },
    autoPlugConfig: {
      metricType: "likes" as const,
      threshold: 50,
      plugComment: "Check out the full guide",
    },
  },
};

/**
 * Answer each SELECT by the columns it asks for, the way the real queries
 * differ: post metadata, post status, the X delivery, existing rows.
 */
function wireDb(opts: { postStatus: string; metadata?: unknown }) {
  let idSelects = 0;
  mockDb.select.mockImplementation((fields: Record<string, unknown>) => {
    if ("metadata" in fields) {
      return chain([{ metadata: opts.metadata ?? FEATURES }]);
    }
    if ("status" in fields) {
      return chain([{ id: POST_ID, status: opts.postStatus }]);
    }
    if ("existingAutoPlugId" in fields) {
      return chain([
        {
          connectedAccountId: "acc-x",
          platformPostId: "tweet-1",
          existingAutoPlugId: null,
        },
      ]);
    }
    // Resurface's two `{ id }` selects, in order: the published X delivery
    // exists, and the post has no resurface schedule yet.
    idSelects += 1;
    return chain(idSelects === 1 ? [{ id: "pub-x" }] : []);
  });
  mockDb.insert.mockImplementation(() => ({
    values: (values: Record<string, unknown>) => {
      inserts.push(values);
      return chain([{ id: "sched-1" }]);
    },
  }));
}

beforeEach(() => {
  vi.resetAllMocks();
  inserts.length = 0;
  mockClaim.mockResolvedValue(true);
  mockRelease.mockResolvedValue(undefined);
  mockResurfaceAllowed.mockResolvedValue(true);
  mockAutoPlugAllowed.mockResolvedValue(true);
});

describe("setupBulkAutoFeaturesAfterPublish", () => {
  it("sets up Auto-Repost and Auto-Plug when X published but another network failed (partial)", async () => {
    wireDb({ postStatus: "partial" });

    await setupBulkAutoFeaturesAfterPublish({
      postId: POST_ID,
      userId: USER_ID,
      publications: [
        { platform: "twitter_x", status: "published" },
        { platform: "linkedin", status: "failed" },
      ],
    });

    expect(mockClaim).toHaveBeenCalledWith(POST_ID, BULK_AUTO_FEATURES_SETUP_KEY);
    expect(inserts).toContainEqual(
      expect.objectContaining({
        postId: POST_ID,
        platform: "x",
        intervalHours: 6,
        maxResurfaces: 3,
        isActive: true,
      }),
    );
    expect(inserts).toContainEqual(
      expect.objectContaining({ scheduleId: "sched-1", status: "pending" }),
    );
    expect(inserts).toContainEqual(
      expect.objectContaining({
        postId: POST_ID,
        platformPostId: "tweet-1",
        metricThreshold: 50,
        status: "watching",
      }),
    );
  });

  it("does nothing while the X delivery is not published", async () => {
    wireDb({ postStatus: "partial" });

    await setupBulkAutoFeaturesAfterPublish({
      postId: POST_ID,
      userId: USER_ID,
      publications: [
        { platform: "twitter_x", status: "failed" },
        { platform: "linkedin", status: "published" },
      ],
    });

    expect(mockDb.select).not.toHaveBeenCalled();
    expect(mockClaim).not.toHaveBeenCalled();
    expect(inserts).toEqual([]);
  });

  it("does nothing when another finalize already set them up", async () => {
    wireDb({ postStatus: "published" });
    mockClaim.mockResolvedValue(false);

    await setupBulkAutoFeaturesAfterPublish({
      postId: POST_ID,
      userId: USER_ID,
      publications: [{ platform: "twitter_x", status: "published" }],
    });

    expect(inserts).toEqual([]);
  });

  it("does not claim a post with no saved auto features", async () => {
    wireDb({ postStatus: "published", metadata: { source: { kind: "user" } } });

    await setupBulkAutoFeaturesAfterPublish({
      postId: POST_ID,
      userId: USER_ID,
      publications: [{ platform: "twitter_x", status: "published" }],
    });

    expect(mockClaim).not.toHaveBeenCalled();
  });

  it("hands the claim back when a setup failed, and never throws", async () => {
    wireDb({ postStatus: "published" });
    mockAutoPlugAllowed.mockRejectedValue(new Error("db down"));

    await expect(
      setupBulkAutoFeaturesAfterPublish({
        postId: POST_ID,
        userId: USER_ID,
        publications: [{ platform: "twitter_x", status: "published" }],
      }),
    ).resolves.toBeUndefined();

    expect(mockRelease).toHaveBeenCalledWith(
      POST_ID,
      BULK_AUTO_FEATURES_SETUP_KEY,
    );
  });

  it("keeps the latch key out of client-supplied metadata", () => {
    expect(
      sanitizePostMetadata({
        [BULK_AUTO_FEATURES_SETUP_KEY]: "2026-01-01T00:00:00.000Z",
        keep: 1,
      }),
    ).toEqual({ keep: 1 });
  });
});
