/**
 * A Retry is a new publish attempt and gets its own outcome report.
 *
 * The failure email and the `post.*` webhook are claimed once per post
 * (`posts.metadata._failureEmailSentAt` / `_publishWebhookSentAt`) so the
 * concurrent finalizes of one attempt report it once. Nothing cleared those
 * latches, so a post that failed everywhere, was retried and then published
 * never sent `post.published` (webhook consumers kept it as failed forever),
 * and a retry that failed again sent no email or webhook. `executePublish`
 * now re-arms both latches once it owns rows of the new attempt.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const { mockDb, mockDecrypt, mockRearm } = vi.hoisted(() => ({
  mockDb: { select: vi.fn(), update: vi.fn(), insert: vi.fn() },
  mockDecrypt: vi.fn(),
  mockRearm: vi.fn(),
}));

vi.mock("../db/index.js", () => ({ db: mockDb }));
vi.mock("@social0/shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@social0/shared")>()),
  decryptToken: mockDecrypt,
}));
vi.mock("../lib/post-metadata-claim.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/post-metadata-claim.js")>()),
  rearmPublishOutcomeClaims: mockRearm,
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

import { executePublish } from "../publish/execute-publish.js";
import {
  PUBLISH_OUTCOME_KEYS,
  rearmMetadataKeysSql,
} from "../lib/post-metadata-claim.js";

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

/** `claimWins`: whether the conditional row claim returns the row. */
function wire(snapshotStatus: string, claimWins: boolean) {
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
          status: "failed",
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
        returning: async () =>
          values.status === "publishing" && claimWins ? [{ id: PUB_ID }] : [],
        then: (resolve: (v: unknown) => unknown) => resolve(undefined),
      }),
    }),
  }));
}

beforeEach(() => {
  vi.resetAllMocks();
  mockRearm.mockResolvedValue(undefined);
  // Stand-in for the platform call: a run that gets this far would publish.
  mockDecrypt.mockImplementation(() => {
    throw new Error("reached platform publish");
  });
});

describe("executePublish re-arms the outcome report for a new attempt", () => {
  it("re-arms when a Retry claims a failed delivery", async () => {
    wire("failed", true);

    await executePublish(POST_ID, USER_ID, PUB_ID);

    expect(mockRearm).toHaveBeenCalledTimes(1);
    expect(mockRearm).toHaveBeenCalledWith(POST_ID);
    // Re-armed before the platform call, so this attempt's finalize can claim.
    expect(mockRearm.mock.invocationCallOrder[0]!).toBeLessThan(
      mockDecrypt.mock.invocationCallOrder[0]!,
    );
  });

  it("does not touch the latches when another run owns the delivery", async () => {
    // Lost the race: that run's attempt re-arms, this one publishes nothing.
    wire("failed", false);

    await executePublish(POST_ID, USER_ID, PUB_ID);

    expect(mockRearm).not.toHaveBeenCalled();
    expect(mockDecrypt).not.toHaveBeenCalled();
  });

  it("still publishes the claimed delivery when the re-arm write fails", async () => {
    wire("failed", true);
    mockRearm.mockRejectedValue(new Error("db down"));

    const result = await executePublish(POST_ID, USER_ID, PUB_ID);

    // Not stranded in "publishing": the run went on to the platform call.
    expect(mockDecrypt).toHaveBeenCalledTimes(1);
    expect(result.results).toHaveLength(1);
  });
});

describe("rearmMetadataKeysSql", () => {
  const render = (fragment: Parameters<PgDialect["sqlToQuery"]>[0]) =>
    new PgDialect().sqlToQuery(fragment);

  it("re-arms the failure email, the publish webhook and the finalized marker", () => {
    // `_finalizedAt` too: a marker left from the previous attempt would hide
    // this attempt's unfinished finalize from the unfinalized-post sweep.
    expect([...PUBLISH_OUTCOME_KEYS].sort()).toEqual([
      "_failureEmailSentAt",
      "_finalizedAt",
      "_publishWebhookSentAt",
    ]);
  });

  it("drops every key with a text cast and matches only posts holding one", () => {
    const { value, anySet } = rearmMetadataKeysSql(PUBLISH_OUTCOME_KEYS);

    const v = render(value);
    expect(v.sql).toContain("coalesce");
    // jsonb has both `- text` and `- integer`; the cast picks the key form.
    expect(v.sql.match(/- \$\d+::text/g)).toHaveLength(PUBLISH_OUTCOME_KEYS.length);
    expect(v.params).toEqual([...PUBLISH_OUTCOME_KEYS]);

    const a = render(anySet);
    expect(a.sql.match(/->>\$\d+::text\) is not null/g)).toHaveLength(
      PUBLISH_OUTCOME_KEYS.length,
    );
    expect(a.sql).toContain(" or ");
    expect(a.sql.startsWith("(")).toBe(true);
    expect(a.params).toEqual([...PUBLISH_OUTCOME_KEYS]);
  });
});
