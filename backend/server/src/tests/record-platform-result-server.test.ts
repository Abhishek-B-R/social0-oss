import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import type { PublishPlatformJob } from "@social0/shared";

const { mockDb, mockProgress, inserted, pubRows, demoted } = vi.hoisted(() => ({
  mockDb: { select: vi.fn(), update: vi.fn(), insert: vi.fn() },
  mockProgress: { emit: vi.fn() },
  /** `phase` of every `publish_job_events` row this module wrote. */
  inserted: [] as unknown[],
  pubRows: [] as { status: string }[],
  /** Every publication row this module actually marked failed. */
  demoted: [] as unknown[],
}));

vi.mock("../db/index.js", () => ({ db: mockDb }));
vi.mock("../lib/publish-job-tracking.js", () => ({
  resolveJobProgressStore: vi.fn().mockResolvedValue(mockProgress),
  safeDbPublishTracking: async (fn: () => Promise<unknown>) => fn(),
}));

import {
  recordPlatformResultServer,
  trackPlatformPhaseServer,
} from "../lib/record-platform-result-server.js";

const JOB = {
  trackingId: "track-1",
  postId: "post-1",
  userId: "user-1",
  publicationId: "pub-1",
  connectedAccountId: "acc-1",
  platform: "twitter_x",
} as unknown as PublishPlatformJob;

/** An API process: `app.jobProgress` is the store built with persist hooks. */
const APP = { jobProgress: mockProgress } as unknown as FastifyInstance;

const SNAPSHOT = {
  trackingId: "track-1",
  status: "processing",
  completed: 1,
  failed: 0,
  total: 1,
  events: [],
};

function wireDb() {
  inserted.length = 0;
  demoted.length = 0;
  mockDb.select.mockImplementation((cols: Record<string, unknown>) => {
    const rows = "total" in cols ? [{ total: 1 }] : pubRows;
    const chain = {
      from: () => chain,
      where: () => chain,
      orderBy: () => chain,
      limit: async () => rows,
      then: (resolve: (v: unknown) => unknown) => resolve(rows),
    };
    return chain;
  });
  mockDb.update.mockImplementation(() => ({
    set: (values: { status?: string }) => ({
      where: () => {
        // `UPDATE … WHERE status IS NULL OR status IN ('pending','failed')
        // RETURNING id`: only a row nobody is working on is demoted.
        const current = pubRows[0]?.status ?? null;
        const demotable =
          current === null || current === "pending" || current === "failed";
        const run = async () => {
          if (values.status === "failed" && demotable) {
            demoted.push(values.status);
            return [{ id: "pub-1" }];
          }
          return [];
        };
        return {
          returning: run,
          then: (resolve: (v: unknown) => unknown) => run().then(resolve),
        };
      },
    }),
  }));
  mockDb.insert.mockImplementation(() => ({
    values: async (values: { phase: unknown }) => {
      inserted.push(values.phase);
    },
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  wireDb();
  pubRows.length = 0;
  pubRows.push({ status: "published" });
});

/**
 * Scheduled X/TikTok jobs run on the API with `app.jobProgress` available, but
 * `initScheduledPublishTracking` only writes Postgres, so the store's `emit`
 * finds no Redis snapshot and returns `null` without running its persist hook.
 * Assuming the hook had run left those timelines stuck at "queued".
 */
describe("platform progress on the API when the store found no snapshot", () => {
  beforeEach(() => {
    mockProgress.emit.mockResolvedValue(null);
  });

  it("writes the phase event itself", async () => {
    await trackPlatformPhaseServer(APP, JOB, "platform_uploading", "Uploading");
    expect(inserted).toEqual(["platform_uploading"]);
  });

  it("writes the result and terminal events itself", async () => {
    await recordPlatformResultServer(APP, JOB, true, "Posted");
    expect(inserted).toEqual(["platform_success", "completed"]);
  });

  it("writes a failure and its terminal event itself", async () => {
    pubRows.length = 0;
    pubRows.push({ status: "failed" });
    await recordPlatformResultServer(APP, JOB, false, "Rejected");
    expect(inserted).toEqual(["platform_failed", "failed"]);
  });
});

describe("platform progress on the API when the hooked store ran", () => {
  beforeEach(() => {
    mockProgress.emit.mockResolvedValue(SNAPSHOT);
  });

  it("does not duplicate the phase event", async () => {
    await trackPlatformPhaseServer(APP, JOB, "platform_uploading", "Uploading");
    expect(inserted).toEqual([]);
  });

  it("does not duplicate the result or terminal events", async () => {
    await recordPlatformResultServer(APP, JOB, true, "Posted");
    expect(inserted).toEqual([]);
  });
});

describe("platform progress without an app (hook-less store)", () => {
  it("writes the events even when Redis had a snapshot", async () => {
    mockProgress.emit.mockResolvedValue(SNAPSHOT);
    await recordPlatformResultServer(null, JOB, true, "Posted");
    expect(inserted).toEqual(["platform_success", "completed"]);
  });
});

/**
 * A failure is only this run's to record on a delivery nobody is working on.
 * A duplicate job that lost the claim (or a runner that threw before reaching
 * the platform) used to write `failed` over a row another live run was still
 * uploading: the post finalized failed, the failure email and post.failed
 * webhook went out, and the Retry it offered posted the content twice.
 */
describe("platform failure on a delivery another run holds", () => {
  beforeEach(() => {
    mockProgress.emit.mockResolvedValue(null);
  });

  it("leaves a publishing row alone and reports nothing", async () => {
    pubRows.length = 0;
    pubRows.push({ status: "publishing" });
    await recordPlatformResultServer(APP, JOB, false, "Publish already in progress");
    expect(demoted).toEqual([]);
    expect(inserted).toEqual([]);
    expect(mockProgress.emit).not.toHaveBeenCalled();
    // No aggregate write either: only the publication update was attempted.
    expect(mockDb.update).toHaveBeenCalledTimes(1);
  });

  it("does not demote a published row", async () => {
    await recordPlatformResultServer(APP, JOB, false, "late failure");
    expect(demoted).toEqual([]);
  });

  it("still fails a delivery nobody claimed", async () => {
    pubRows.length = 0;
    pubRows.push({ status: "pending" });
    await recordPlatformResultServer(APP, JOB, false, "Rejected");
    expect(demoted).toEqual(["failed"]);
    expect(inserted).toEqual(["platform_failed"]);
  });
});
