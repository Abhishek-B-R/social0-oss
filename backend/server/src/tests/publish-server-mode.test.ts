/**
 * Without Cloudflare, publishes run on the API process.
 *
 * `PUBLISH_DISPATCH=bullmq` used to enqueue every platform job to
 * `platform-publish-*` BullMQ queues, and nothing in this repository consumed
 * them: the caller got 202, the post sat in `publishing`, and nothing ran. The
 * scheduled cron never supported that mode at all. `PUBLISH_DISPATCH=server`
 * (and `bullmq`, its old name) now runs every platform through the same
 * in-process path X and TikTok use, from both publish-now and the cron.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb, mockLoadTargets, mockStartOnServer, mockCfEnqueue, mockProgressStore } =
  vi.hoisted(() => ({
    mockDb: { select: vi.fn(), update: vi.fn(), insert: vi.fn() },
    mockLoadTargets: vi.fn(),
    mockStartOnServer: vi.fn(),
    mockCfEnqueue: vi.fn(),
    mockProgressStore: vi.fn(),
  }));

vi.mock("../db/index.js", () => ({ db: mockDb }));
vi.mock("@social0/shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@social0/shared")>()),
  cfEnqueuePlatformJob: mockCfEnqueue,
}));
vi.mock("../lib/publish-load-targets.js", () => ({
  loadPublicationTargets: mockLoadTargets,
}));
vi.mock("../lib/publish-job-tracking.js", () => ({
  resolveJobProgressStore: mockProgressStore,
  safeDbPublishTracking: vi.fn(),
}));
vi.mock("../publish/server-platform-jobs.js", () => ({
  startPlatformJobOnServer: mockStartOnServer,
}));
vi.mock("../publish/finalize-post.js", () => ({
  maybeFinalizePostPublish: vi.fn(),
}));

import { getServerSidePublishPlatforms, SUPPORTED_PLATFORMS } from "@social0/shared";
import { prepareAndEnqueuePublish } from "../services/publish-enqueue.js";
import {
  assertPublishDispatchConfigured,
  queueNameForJob,
  useCloudflarePublishDispatch,
} from "../services/publish-dispatch.js";

const POST_ID = "33333333-3333-4333-8333-333333333333";

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

const ENV_KEYS = ["PUBLISH_DISPATCH", "CF_PUBLISH_WORKER_URL", "CF_PUBLISH_HMAC_SECRET"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  vi.resetAllMocks();
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  delete process.env.CF_PUBLISH_WORKER_URL;
  delete process.env.CF_PUBLISH_HMAC_SECRET;
  mockProgressStore.mockResolvedValue({ initJob: vi.fn(), emit: vi.fn() });
  mockLoadTargets.mockResolvedValue([
    { publicationId: "pub-li", connectedAccountId: "acc-li", platform: "linkedin" },
    { publicationId: "pub-ig", connectedAccountId: "acc-ig", platform: "instagram" },
    { publicationId: "pub-x", connectedAccountId: "acc-x", platform: "twitter_x" },
  ]);
  mockDb.select.mockImplementation(() => chain([{ status: "scheduled" }]));
  mockDb.update.mockImplementation(() => chain([{ id: POST_ID }]));
  mockDb.insert.mockImplementation(() => chain([]));
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe.each(["server", "bullmq"])("PUBLISH_DISPATCH=%s", (mode) => {
  beforeEach(() => {
    process.env.PUBLISH_DISPATCH = mode;
  });

  it("is a configured dispatch mode", () => {
    expect(() => assertPublishDispatchConfigured()).not.toThrow();
    expect(useCloudflarePublishDispatch()).toBe(false);
  });

  it("runs every platform job on the API and enqueues nothing", async () => {
    const result = await prepareAndEnqueuePublish(
      null,
      { postId: POST_ID, userId: "user_1" },
      { priority: "now", trackingId: "track-1" },
    );

    expect(result.backend).toBe("server");
    expect(result.enqueued).toBe(3);
    expect(mockStartOnServer.mock.calls.map((c) => (c[1] as { platform: string }).platform)).toEqual([
      "linkedin",
      "instagram",
      "twitter_x",
    ]);
    expect(mockCfEnqueue).not.toHaveBeenCalled();
  });

  it("sends the scheduled cron's jobs to the API for every platform", () => {
    expect([...getServerSidePublishPlatforms()].sort()).toEqual([...SUPPORTED_PLATFORMS].sort());
  });

  it("reports no queue", () => {
    expect(queueNameForJob("now")).toBe("server");
  });
});

describe("without PUBLISH_DISPATCH or Cloudflare credentials", () => {
  it("still refuses to accept a publish nothing would run", () => {
    delete process.env.PUBLISH_DISPATCH;
    expect(() => assertPublishDispatchConfigured()).toThrow(/PUBLISH_DISPATCH=server/);
  });
});

describe("PUBLISH_DISPATCH=cloudflare", () => {
  it("keeps only X, TikTok and Bluesky on the API", () => {
    process.env.PUBLISH_DISPATCH = "cloudflare";
    expect([...getServerSidePublishPlatforms()].sort()).toEqual(["bluesky", "tiktok", "twitter_x"]);
  });
});
