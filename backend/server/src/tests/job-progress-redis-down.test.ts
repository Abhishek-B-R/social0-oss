import { describe, it, expect, afterEach } from "vitest";
import { createJobProgressStore, type JobProgressStore } from "@social0/shared";

/**
 * Job progress is a convenience layer over `publish_jobs` /`publish_job_events`.
 * With BullMQ's `maxRetriesPerRequest: null` a command issued while Redis was
 * unreachable waited forever, so an outage turned `POST /api/publish` and
 * `GET /api/jobs/:id` into requests that never answered. These cases pin the
 * degraded behaviour: fail fast, keep the durable write, answer from Postgres.
 */
const DEAD_REDIS_URL = "redis://127.0.0.1:6399";
/** Generous next to the 5s command timeout, tight enough to catch a hang. */
const FAIL_FAST_MS = 10_000;

let store: JobProgressStore | null = null;

afterEach(async () => {
  await store?.close();
  store = null;
});

describe("JobProgressStore with Redis unreachable", () => {
  it("reads resolve to null instead of hanging", async () => {
    store = createJobProgressStore(DEAD_REDIS_URL);
    const started = Date.now();
    await expect(store.getSnapshot("tracking-1")).resolves.toBeNull();
    expect(Date.now() - started).toBeLessThan(FAIL_FAST_MS);
  });

  it("still persists the job through the hooks and returns the snapshot", async () => {
    const seen: string[] = [];
    store = createJobProgressStore(DEAD_REDIS_URL, {
      onInit: async (snapshot) => {
        seen.push(snapshot.trackingId);
      },
    });

    const snapshot = await store.initJob({
      trackingId: "tracking-2",
      postId: "post-1",
      userId: "user-1",
      total: 2,
    });

    expect(snapshot.status).toBe("queued");
    expect(snapshot.total).toBe(2);
    expect(seen).toEqual(["tracking-2"]);
  });

  it("emit resolves to null rather than rejecting the publish", async () => {
    store = createJobProgressStore(DEAD_REDIS_URL);
    await expect(
      store.emit({
        trackingId: "tracking-3",
        postId: "post-1",
        userId: "user-1",
        phase: "fan_out",
      }),
    ).resolves.toBeNull();
  });
}, 30_000);
