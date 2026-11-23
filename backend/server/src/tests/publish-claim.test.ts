/**
 * One delivery, one platform post.
 *
 * Two runs for the same publication — a /v1 or /api/publish client retrying
 * after a timeout, two Retry clicks, the cron racing Publish now — run in
 * parallel CF isolates (max_concurrency 10) and can both read a row as
 * `pending`. `executePublish` used to flip it to `publishing` with an
 * unconditional update and then decide from its stale read, so both runs
 * posted the same content. The claim is now a conditional update whose
 * RETURNING decides who publishes, and the enqueue side refuses to fan a post
 * out again while it is already `publishing`.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb, mockDecrypt, mockLoadTargets, mockDispatch, mockProgressStore } =
  vi.hoisted(() => ({
    mockDb: { select: vi.fn(), update: vi.fn(), insert: vi.fn() },
    mockDecrypt: vi.fn(),
    mockLoadTargets: vi.fn(),
    mockDispatch: vi.fn(),
    mockProgressStore: vi.fn(),
  }));

vi.mock("../db/index.js", () => ({ db: mockDb }));
vi.mock("@social0/shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@social0/shared")>()),
  decryptToken: mockDecrypt,
}));
vi.mock("../lib/token-refresh.js", () => ({
  REFRESHABLE_PLATFORMS: new Set<string>(),
}));
// Platform clients: never reached (decryptToken stops the run first), and they
// import through the `@/` alias, which vitest here does not resolve.
vi.mock("../lib/linkedin-media.js", () => ({}));
vi.mock("../lib/twitter-media.js", () => ({}));
vi.mock("../lib/twitter-tweet-fetch.js", () => ({}));
vi.mock("../lib/publish-platforms/index.js", () => ({
  publishToPlatform: vi.fn(),
}));
vi.mock("@/lib/validation", () => import("../lib/validation.js"));
vi.mock("../lib/publish-load-targets.js", () => ({
  loadPublicationTargets: mockLoadTargets,
}));
vi.mock("../lib/publish-job-tracking.js", () => ({
  resolveJobProgressStore: mockProgressStore,
  safeDbPublishTracking: vi.fn(),
}));
vi.mock("../services/publish-dispatch.js", () => ({
  assertPublishDispatchConfigured: vi.fn(),
  useCloudflarePublishDispatch: () => true,
  dispatchPlatformJob: mockDispatch,
}));
vi.mock("../publish/process-platform-server.js", () => ({
  runPlatformJobOnServer: vi.fn(),
}));
vi.mock("../publish/finalize-post.js", () => ({
  maybeFinalizePostPublish: vi.fn(),
}));

import { executePublish } from "../publish/execute-publish.js";
import {
  prepareAndEnqueuePublish,
  PostClaimLostError,
} from "../services/publish-enqueue.js";

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

const POST_ID = "33333333-3333-4333-8333-333333333333";
const USER_ID = "user_1";
const PUB_ID = "pub-1";

function publicationRow(status: string) {
  return {
    publicationId: PUB_ID,
    publicationStatus: status,
    platformPostUrl: null,
    connectedAccountId: "acc-1",
    platform: "pinterest",
    platformUserId: "pin-user",
    platformUsername: "acme",
    platformAccountType: null,
    encryptedAccessToken: "enc",
    encryptedRefreshToken: null,
    tokenExpiresAt: null,
    tokenStatus: "active",
    platformMetadata: null,
    isTwitterPremium: false,
    publicationIdle: false,
  };
}

/**
 * Every run reads the same snapshot; the database hands each publication to
 * the first conditional claim only, as `UPDATE … WHERE status IN (…)
 * RETURNING` does.
 */
function wireExecutePublish(snapshotStatus: string) {
  const claimedBy = new Set<string>();
  mockDb.select.mockImplementation((fields: Record<string, unknown>) => {
    if ("publicationIdle" in fields) {
      return chain([publicationRow(snapshotStatus)]);
    }
    if ("finalContent" in fields) {
      return chain([
        {
          id: POST_ID,
          userId: USER_ID,
          finalContent: "hello",
          status: "publishing",
          mediaIds: [],
          metadata: null,
        },
      ]);
    }
    return chain([]);
  });
  mockDb.update.mockImplementation(() => ({
    set: (values: { status?: string }) => ({
      where: () => ({
        returning: async () => {
          if (values.status !== "publishing") return [];
          if (claimedBy.has(PUB_ID)) return [];
          claimedBy.add(PUB_ID);
          return [{ id: PUB_ID }];
        },
        then: (resolve: (v: unknown) => unknown) => resolve(undefined),
      }),
    }),
  }));
}

beforeEach(() => {
  vi.resetAllMocks();
  mockProgressStore.mockResolvedValue({ initJob: vi.fn(), emit: vi.fn() });
  // Stand-in for the platform call: a run that gets this far would publish.
  mockDecrypt.mockImplementation(() => {
    throw new Error("reached platform publish");
  });
});

describe("executePublish publication claim", () => {
  it("publishes a pending delivery once when two runs race for it", async () => {
    wireExecutePublish("pending");

    const [a, b] = await Promise.all([
      executePublish(POST_ID, USER_ID, PUB_ID),
      executePublish(POST_ID, USER_ID, PUB_ID),
    ]);

    expect(mockDecrypt).toHaveBeenCalledTimes(1);
    const errors = [a, b].map((r) => r.results[0]?.error).sort();
    expect(errors).toEqual([
      "Publish already in progress",
      "reached platform publish",
    ]);
  });

  it("retries a failed delivery once when two Retry calls race", async () => {
    wireExecutePublish("failed");

    await Promise.all([
      executePublish(POST_ID, USER_ID, PUB_ID),
      executePublish(POST_ID, USER_ID, PUB_ID),
    ]);

    expect(mockDecrypt).toHaveBeenCalledTimes(1);
  });

  it("skips a delivery another run claimed after this run read it", async () => {
    wireExecutePublish("pending");
    // The other run's claim landed between our read and our claim.
    await executePublish(POST_ID, USER_ID, PUB_ID);
    mockDecrypt.mockClear();

    const late = await executePublish(POST_ID, USER_ID, PUB_ID);

    expect(mockDecrypt).not.toHaveBeenCalled();
    expect(late.results).toEqual([
      expect.objectContaining({
        status: "failed",
        error: "Publish already in progress",
        // Runners key off this to skip recording a failure on the other
        // run's row (which demoted it to `failed` mid-upload).
        inProgressElsewhere: true,
      }),
    ]);
  });

  it("marks only the losing run's result as held elsewhere", async () => {
    wireExecutePublish("pending");

    const [a, b] = await Promise.all([
      executePublish(POST_ID, USER_ID, PUB_ID),
      executePublish(POST_ID, USER_ID, PUB_ID),
    ]);

    const flags = [a, b]
      .map((r) => Boolean(r.results[0]?.inProgressElsewhere))
      .sort();
    expect(flags).toEqual([false, true]);
  });
});

/**
 * Runners no longer demote a "publishing" row (it may be another live run's),
 * so the run that owns a claim must settle it itself when it cannot finish.
 */
describe("executePublish settles the rows it owns", () => {
  it("fails an owned delivery whose handler threw before recording an outcome", async () => {
    wireExecutePublish("pending");
    const updates: { status?: string; returning: boolean }[] = [];
    let failedWrites = 0;
    mockDb.update.mockImplementation(() => ({
      set: (values: { status?: string }) => ({
        where: () => ({
          returning: async () => {
            updates.push({ status: values.status, returning: true });
            return [{ id: PUB_ID }];
          },
          then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
            updates.push({ status: values.status, returning: false });
            // failPublication's own write fails, so the handler rejects.
            if (values.status === "failed" && failedWrites++ === 0) {
              return reject(new Error("connection reset"));
            }
            return resolve(undefined);
          },
        }),
      }),
    }));

    const result = await executePublish(POST_ID, USER_ID, PUB_ID);

    // Claim, then the conditional "publishing → failed" cleanup.
    expect(updates.filter((u) => u.returning).map((u) => u.status)).toEqual([
      "publishing",
      "failed",
    ]);
    expect(result.results).toEqual([
      expect.objectContaining({ status: "failed", error: "connection reset" }),
    ]);
  });

  it("keeps a whole-post publish 'publishing' while another run holds a row", async () => {
    const OTHER = "pub-2";
    mockDb.select.mockImplementation((fields: Record<string, unknown>) => {
      if ("publicationIdle" in fields) {
        return chain([
          publicationRow("pending"),
          { ...publicationRow("publishing"), publicationId: OTHER, connectedAccountId: "acc-2" },
        ]);
      }
      if ("finalContent" in fields) {
        return chain([
          { id: POST_ID, userId: USER_ID, finalContent: "hello", status: "scheduled", mediaIds: [], metadata: null },
        ]);
      }
      return chain([]);
    });
    const postStatuses: string[] = [];
    mockDb.update.mockImplementation(() => ({
      set: (values: { status?: string }) => ({
        where: () => ({
          returning: async () => (values.status === "publishing" ? [{ id: PUB_ID }] : []),
          then: (resolve: (v: unknown) => unknown) => {
            if (values.status) postStatuses.push(values.status);
            return resolve(undefined);
          },
        }),
      }),
    }));

    const result = await executePublish(POST_ID, USER_ID);

    expect(result.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ connectedAccountId: "acc-2", inProgressElsewhere: true }),
      ]),
    );
    // The owned row failed (decrypt stand-in), but the post must not be
    // written "failed"/"partial" while acc-2 is still uploading.
    expect(postStatuses).not.toContain("partial");
    expect(postStatuses.filter((s) => s === "failed")).toHaveLength(1); // the row
  });
});

describe("prepareAndEnqueuePublish post claim", () => {
  function wireEnqueue(status: string, casWins = true) {
    mockLoadTargets.mockResolvedValue([
      { publicationId: PUB_ID, connectedAccountId: "acc-1", platform: "pinterest" },
    ]);
    mockDb.select.mockImplementation(() => chain([{ status }]));
    mockDb.update.mockImplementation(() =>
      chain(casWins ? [{ id: POST_ID }] : []),
    );
  }

  function publishNow() {
    return prepareAndEnqueuePublish(
      null,
      { postId: POST_ID, userId: USER_ID },
      { priority: "now", trackingId: "track-1" },
    );
  }

  it("does not fan out a post that is already publishing", async () => {
    wireEnqueue("publishing");

    await expect(publishNow()).rejects.toBeInstanceOf(PostClaimLostError);
    expect(mockDb.update).not.toHaveBeenCalled();
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("does not fan out when another request claimed the post first", async () => {
    wireEnqueue("scheduled", false);

    await expect(publishNow()).rejects.toBeInstanceOf(PostClaimLostError);
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("fans out once it holds the claim", async () => {
    wireEnqueue("scheduled", true);

    await publishNow();
    expect(mockDispatch).toHaveBeenCalledTimes(1);
  });
});
