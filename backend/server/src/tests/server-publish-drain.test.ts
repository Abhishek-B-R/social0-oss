/**
 * Scheduled and publish-now X/TikTok publishes run inside the API process
 * after their request has answered. A `pm2 reload` used to kill them
 * mid-upload (no signal handling), leaving the publication `publishing` until
 * the stale sweeper failed it an hour later — and a tweet X had already
 * accepted was then posted twice by the user's Retry. Shutdown now waits for
 * them, before the Redis connections they report progress through close.
 */

import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

const { mockRun } = vi.hoisted(() => ({ mockRun: vi.fn() }));

vi.mock("../publish/process-platform-server.js", () => ({
  runPlatformJobOnServer: mockRun,
}));

import {
  drainServerPublishJobs,
  serverPublishJobsInFlight,
  startPlatformJobOnServer,
  trackServerPublishJob,
} from "../publish/server-platform-jobs.js";
import { registerPublishDrain } from "../lib/graceful-shutdown.js";

const JOB = {
  postId: "post-1",
  userId: "user-1",
  publicationId: "pub-1",
  connectedAccountId: "acct-1",
  platform: "twitter_x" as const,
};

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

afterEach(async () => {
  vi.useRealTimers();
  await drainServerPublishJobs(1_000);
  mockRun.mockReset();
});

describe("in-process publish tracking", () => {
  it("tracks a started job until it settles, failures included", async () => {
    const run = deferred();
    mockRun.mockReturnValue(run.promise.then(() => Promise.reject(new Error("x down"))));
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});

    startPlatformJobOnServer(null, JOB, "[test] failed");
    expect(serverPublishJobsInFlight()).toBe(1);

    run.resolve();
    expect(await drainServerPublishJobs(1_000)).toBe(0);
    expect(errors).toHaveBeenCalledWith("[test] failed", "twitter_x", expect.any(Error));
    errors.mockRestore();
  });

  it("also waits for jobs started while it is draining", async () => {
    const first = deferred();
    const second = deferred();
    let secondDone = false;
    trackServerPublishJob(
      first.promise.then(() => {
        trackServerPublishJob(second.promise.then(() => void (secondDone = true)));
        setTimeout(second.resolve, 5);
      }),
    );

    setTimeout(first.resolve, 5);
    expect(await drainServerPublishJobs(1_000)).toBe(0);
    expect(secondDone).toBe(true);
  });

  it("gives up after the timeout and reports what is still running", async () => {
    const stuck = deferred();
    trackServerPublishJob(stuck.promise);

    expect(await drainServerPublishJobs(20)).toBe(1);

    stuck.resolve();
  });
});

describe("app.close() with registerPublishDrain", () => {
  it("lets in-flight publishes finish before plugins close their connections", async () => {
    const order: string[] = [];
    const app = Fastify();
    // Stands in for the queue plugin, registered first in `buildApp`, which
    // closes the Redis connection job progress is written through.
    app.addHook("onClose", async () => {
      order.push("redis closed");
    });
    registerPublishDrain(app, 1_000);
    await app.ready();

    const run = deferred();
    trackServerPublishJob(run.promise.then(() => void order.push("publish finished")));
    setTimeout(run.resolve, 20);

    await app.close();

    expect(order).toEqual(["publish finished", "redis closed"]);
    expect(serverPublishJobsInFlight()).toBe(0);
  });
});
