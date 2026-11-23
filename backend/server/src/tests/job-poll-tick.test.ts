/**
 * The Cloudflare-path SSE stream polls Postgres every 1.5 s for up to 15
 * minutes, and every tick rebuilt the whole snapshot. It now probes a small
 * change marker and rebuilds only when the job moved.
 */
import { describe, expect, it, vi } from "vitest";
import { createJobPollTick } from "../lib/job-sse-stream.js";

describe("createJobPollTick", () => {
  it("loads the snapshot only when the job changed", async () => {
    let marker = "t1|processing|2";
    const snapshot = vi.fn(async () => ({ events: [] }));
    const tick = createJobPollTick({ marker: async () => marker, snapshot });

    expect(await tick()).not.toBeNull();
    expect(await tick()).toBeNull();
    expect(await tick()).toBeNull();
    expect(snapshot).toHaveBeenCalledTimes(1);

    marker = "t2|processing|3";
    expect(await tick()).not.toBeNull();
    expect(snapshot).toHaveBeenCalledTimes(2);
  });

  it("always reloads a job it cannot probe", async () => {
    const snapshot = vi.fn(async () => ({ events: [] }));
    const tick = createJobPollTick({ marker: async () => null, snapshot });

    await tick();
    await tick();

    expect(snapshot).toHaveBeenCalledTimes(2);
  });
});

describe("loadJobSnapshotFromDb", () => {
  it("loads at most MAX_SNAPSHOT_EVENTS events, oldest first", async () => {
    vi.resetModules();
    const limits: number[] = [];
    const newestFirst = [
      { trackingId: "t", postId: "p", userId: "u", phase: "completed", createdAt: new Date(3000) },
      { trackingId: "t", postId: "p", userId: "u", phase: "platform_success", createdAt: new Date(2000) },
      { trackingId: "t", postId: "p", userId: "u", phase: "queued", createdAt: new Date(1000) },
    ];
    vi.doMock("../lib/publish-job-tracking.js", () => ({
      hasPublishJobTables: async () => true,
      isMissingRelationError: () => false,
    }));
    vi.doMock("../db/index.js", () => ({
      db: {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: async () => [
                { trackingId: "t", postId: "p", userId: "u", status: "completed", total: 1, completed: 1, failed: 0, updatedAt: new Date() },
              ],
              orderBy: () => ({
                limit: async (n: number) => {
                  limits.push(n);
                  return [...newestFirst];
                },
              }),
            }),
          }),
        }),
      },
    }));
    const { loadJobSnapshotFromDb, MAX_SNAPSHOT_EVENTS } = await import("../lib/job-snapshot-from-db.js");

    const snapshot = await loadJobSnapshotFromDb("t");

    expect(limits).toEqual([MAX_SNAPSHOT_EVENTS]);
    expect(snapshot!.events.map((e) => e.phase)).toEqual(["queued", "platform_success", "completed"]);
    vi.doUnmock("../db/index.js");
    vi.doUnmock("../lib/publish-job-tracking.js");
  });
});
