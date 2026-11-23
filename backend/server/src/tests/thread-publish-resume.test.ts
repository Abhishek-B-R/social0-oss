/**
 * A thread that fails partway keeps what went live, and Retry continues it.
 *
 * X, Bluesky and Threads threads go out one platform call per part. When a
 * part after the first failed, the publication was marked failed with no
 * platformPostId / URL and nothing recording the live parts, and Retry ran the
 * chain again from part 1: a second root post on Bluesky and Threads, and on
 * X a duplicate-content 403 that could never be cleared while half the thread
 * was live. The same happened to a single tweet whose `published` write threw
 * after the tweet went out. Progress is now saved after every part
 * (`publish-platforms/thread-progress.ts`) and the next run resumes from it.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const {
  mockDb,
  mockDecrypt,
  mockCreateTweet,
  mockSaveProgress,
  getMediaWithUrls,
  getOrderedMediaWithUrls,
} = vi.hoisted(() => ({
  mockDb: { select: vi.fn(), update: vi.fn(), insert: vi.fn() },
  mockDecrypt: vi.fn(),
  mockCreateTweet: vi.fn(),
  mockSaveProgress: vi.fn(),
  getMediaWithUrls: vi.fn(),
  getOrderedMediaWithUrls: vi.fn(),
}));

vi.mock("../db/index.js", () => ({ db: mockDb }));
vi.mock("@social0/shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@social0/shared")>()),
  decryptToken: mockDecrypt,
}));
vi.mock("../lib/token-refresh.js", () => ({
  REFRESHABLE_PLATFORMS: new Set<string>(),
}));
vi.mock("../lib/linkedin-media.js", () => ({}));
vi.mock("../lib/twitter-media.js", () => ({
  uploadTwitterImage: vi.fn(),
  uploadTwitterVideo: vi.fn(),
}));
vi.mock("../lib/twitter-tweet-fetch.js", () => ({
  createTwitterTweetFetch: mockCreateTweet,
}));
vi.mock("../lib/publish-platforms/index.js", () => ({
  publishToPlatform: vi.fn(),
}));
vi.mock("@/lib/validation", () => import("../lib/validation.js"));
vi.mock("@/lib/publish-validation", () => import("../lib/publish-validation.js"));
vi.mock("@/lib/publish-log", () => ({
  publishLog: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../lib/publish-platforms/media.js", () => ({
  fetchMediaBytes: vi.fn(),
  getMediaWithUrls,
  getOrderedMediaWithUrls,
  prepareImageForPlatform: vi.fn(),
}));
vi.mock("../lib/publish-platforms/helpers.js", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../lib/publish-platforms/helpers.js")
  >()),
  sleep: async () => undefined,
}));
vi.mock("../lib/publish-platforms/thread-progress.js", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../lib/publish-platforms/thread-progress.js")
  >()),
  saveThreadProgress: mockSaveProgress,
}));

import { executePublish } from "../publish/execute-publish.js";
import { publishToBluesky } from "../lib/publish-platforms/bluesky.js";
import { publishToThreads } from "../lib/publish-platforms/threads.js";
import {
  partialThreadError,
  readThreadProgress,
  threadFingerprint,
  threadProgressMergeSql,
  THREAD_PROGRESS_KEY,
  type ThreadProgress,
} from "../lib/publish-platforms/thread-progress.js";
import type { Post, Pub } from "../lib/publish-platforms/types.js";

const POST_ID = "33333333-3333-4333-8333-333333333333";
const USER_ID = "user_1";
const PUB_ID = "pub-1";

function progressMetadata(
  extra: Record<string, unknown>,
  progress: Omit<ThreadProgress, "fingerprint">,
  fingerprint: string,
) {
  return {
    ...extra,
    [THREAD_PROGRESS_KEY]: { [PUB_ID]: { fingerprint, ...progress } },
  };
}

describe("thread progress", () => {
  const parts = [
    { text: "one", mediaIds: [] },
    { text: "two", mediaIds: ["m1"] },
  ];
  const fp = threadFingerprint(parts);

  it("fingerprints content, not identity", () => {
    expect(threadFingerprint(parts.map((p) => ({ ...p })))).toBe(fp);
    expect(threadFingerprint([parts[0], { text: "two!", mediaIds: ["m1"] }])).not.toBe(fp);
    expect(threadFingerprint([parts[0], { text: "two", mediaIds: [] }])).not.toBe(fp);
  });

  it("reads only matching, well-formed progress", () => {
    const ok = { fingerprint: fp, posted: 1, rootId: "r", lastId: "r" };
    const md = (entry: unknown) => ({ [THREAD_PROGRESS_KEY]: { [PUB_ID]: entry } });
    expect(readThreadProgress(md(ok), PUB_ID, fp, 2)).toEqual(ok);
    expect(readThreadProgress(md(ok), "other-pub", fp, 2)).toBeNull();
    expect(readThreadProgress(md({ ...ok, fingerprint: "x" }), PUB_ID, fp, 2)).toBeNull();
    expect(readThreadProgress(md({ ...ok, posted: 3 }), PUB_ID, fp, 2)).toBeNull();
    expect(readThreadProgress(md({ ...ok, posted: 0 }), PUB_ID, fp, 2)).toBeNull();
    expect(readThreadProgress(md({ ...ok, rootId: "" }), PUB_ID, fp, 2)).toBeNull();
    expect(readThreadProgress(null, PUB_ID, fp, 2)).toBeNull();
  });

  it("merges one publication's entry with typed parameters", () => {
    const { sql: text, params } = new PgDialect().sqlToQuery(
      threadProgressMergeSql(PUB_ID, {
        fingerprint: fp,
        posted: 1,
        rootId: "r",
        lastId: "r",
      }),
    );
    expect(text).toContain("jsonb_set(");
    // Untyped binds in jsonb_build_object fail with 42P18.
    expect(text).toMatch(/jsonb_build_object\(\$\d+::text, \$\d+::jsonb\)/);
    expect(text).toContain("||");
    expect(params).toContain(PUB_ID);
    expect(params).toContain(THREAD_PROGRESS_KEY);
  });

  it("says where Retry picks up only for a partial thread", () => {
    expect(partialThreadError("boom", 2, 3)).toContain("2 of 3");
    expect(partialThreadError("boom", 0, 3)).toBe("boom");
    expect(partialThreadError("boom", 3, 3)).toBe("boom");
  });
});

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

type Write = Record<string, unknown>;

function wireX(opts: {
  status: string;
  finalContent: string;
  metadata: Record<string, unknown> | null;
  failPublishedWrite?: boolean;
}): Write[] {
  const writes: Write[] = [];
  mockDb.select.mockImplementation((fields: Record<string, unknown>) => {
    if ("publicationIdle" in fields) {
      return chain([
        {
          publicationId: PUB_ID,
          publicationStatus: opts.status,
          platformPostUrl: null,
          connectedAccountId: "acc-1",
          platform: "twitter_x",
          platformUserId: "x-user",
          platformUsername: "acme",
          platformAccountType: null,
          encryptedAccessToken: "enc",
          encryptedRefreshToken: "enc-secret",
          tokenExpiresAt: null,
          tokenStatus: "active",
          platformMetadata: null,
          isTwitterPremium: false,
          accountIsActive: true,
          publicationIdle: false,
        },
      ]);
    }
    if ("finalContent" in fields) {
      return chain([
        {
          id: POST_ID,
          userId: USER_ID,
          finalContent: opts.finalContent,
          status: "publishing",
          mediaIds: [],
          metadata: opts.metadata,
        },
      ]);
    }
    return chain([]);
  });
  mockDb.update.mockImplementation(() => ({
    set: (values: Write) => ({
      where: () => ({
        returning: async () =>
          values.status === "publishing" || values.status === "failed"
            ? [{ id: PUB_ID }]
            : [],
        then: (
          resolve: (v: unknown) => unknown,
          reject: (e: unknown) => unknown,
        ) => {
          writes.push(values);
          if (opts.failPublishedWrite && values.status === "published") {
            return reject(new Error("connection reset"));
          }
          return resolve(undefined);
        },
      }),
    }),
  }));
  return writes;
}

const threadParts = [
  { text: "part one", mediaIds: [] as string[] },
  { text: "part two", mediaIds: [] as string[] },
  { text: "part three", mediaIds: [] as string[] },
];

describe("X threads resume instead of reposting", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("TWITTER_CONSUMER_KEY", "ck");
    vi.stubEnv("TWITTER_CONSUMER_SECRET", "cs");
    mockDecrypt.mockReturnValue("token");
    mockSaveProgress.mockResolvedValue(true);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("keeps the root and the live parts when a later part fails", async () => {
    const writes = wireX({
      status: "pending",
      finalContent: "part one",
      metadata: { twitterThread: { parts: threadParts } },
    });
    let n = 0;
    mockCreateTweet.mockImplementation(async () => {
      n += 1;
      if (n === 3) throw new Error("Service Unavailable");
      return { data: { id: `t${n}` } };
    });

    const result = await executePublish(POST_ID, USER_ID, PUB_ID);

    expect(result.results[0]?.status).toBe("failed");
    const failed = writes.find((w) => w.status === "failed");
    expect(failed).toMatchObject({
      platformPostId: "t1",
      platformPostUrl: "https://twitter.com/acme/status/t1",
    });
    expect(String(failed?.lastError)).toContain("2 of 3 thread parts are live");
    expect(mockSaveProgress.mock.calls.map((c) => c[2])).toEqual([
      expect.objectContaining({ posted: 1, rootId: "t1", lastId: "t1" }),
      expect.objectContaining({ posted: 2, rootId: "t1", lastId: "t2" }),
    ]);
  });

  it("Retry posts only the missing parts, replying to the last live one", async () => {
    const writes = wireX({
      status: "failed",
      finalContent: "part one",
      metadata: progressMetadata(
        { twitterThread: { parts: threadParts } },
        { posted: 2, rootId: "t1", lastId: "t2" },
        threadFingerprint(threadParts),
      ),
    });
    mockCreateTweet.mockResolvedValue({ data: { id: "t3" } });

    const result = await executePublish(POST_ID, USER_ID, PUB_ID);

    expect(mockCreateTweet).toHaveBeenCalledTimes(1);
    expect(mockCreateTweet.mock.calls[0]?.[0]).toMatchObject({
      text: "part three",
      reply: { in_reply_to_tweet_id: "t2" },
    });
    expect(result.results[0]?.status).toBe("published");
    expect(writes.find((w) => w.status === "published")).toMatchObject({
      platformPostId: "t1",
      platformPostUrl: "https://twitter.com/acme/status/t1",
    });
  });

  it("ignores progress recorded for different content", async () => {
    wireX({
      status: "failed",
      finalContent: "part one",
      metadata: progressMetadata(
        { twitterThread: { parts: threadParts } },
        { posted: 2, rootId: "t1", lastId: "t2" },
        threadFingerprint([{ text: "old", mediaIds: [] }]),
      ),
    });
    mockCreateTweet.mockResolvedValue({ data: { id: "new" } });

    await executePublish(POST_ID, USER_ID, PUB_ID);

    expect(mockCreateTweet).toHaveBeenCalledTimes(3);
  });

  it("a split (---) thread keeps its root too", async () => {
    const writes = wireX({
      status: "pending",
      finalContent: "a --- b --- c",
      metadata: null,
    });
    let n = 0;
    mockCreateTweet.mockImplementation(async () => {
      n += 1;
      if (n === 2) throw new Error("Too Many Requests");
      return { data: { id: `s${n}` } };
    });

    await executePublish(POST_ID, USER_ID, PUB_ID);

    expect(writes.find((w) => w.status === "failed")).toMatchObject({
      platformPostId: "s1",
      platformPostUrl: "https://twitter.com/acme/status/s1",
    });
  });

  it("a tweet whose status write failed is not tweeted again on Retry", async () => {
    wireX({
      status: "pending",
      finalContent: "hello",
      metadata: null,
      failPublishedWrite: true,
    });
    mockCreateTweet.mockResolvedValue({ data: { id: "solo" } });

    await executePublish(POST_ID, USER_ID, PUB_ID);

    expect(mockSaveProgress).toHaveBeenCalledWith(
      POST_ID,
      PUB_ID,
      expect.objectContaining({ posted: 1, rootId: "solo", lastId: "solo" }),
    );
    const saved = mockSaveProgress.mock.calls[0]?.[2] as ThreadProgress;

    mockCreateTweet.mockClear();
    const writes = wireX({
      status: "failed",
      finalContent: "hello",
      metadata: { [THREAD_PROGRESS_KEY]: { [PUB_ID]: saved } },
    });

    const retry = await executePublish(POST_ID, USER_ID, PUB_ID);

    expect(mockCreateTweet).not.toHaveBeenCalled();
    expect(retry.results[0]?.status).toBe("published");
    expect(writes.find((w) => w.status === "published")).toMatchObject({
      platformPostId: "solo",
    });
  });
});

const pub = (platform: string): Pub => ({
  publicationId: PUB_ID,
  connectedAccountId: "acc-1",
  platform,
  platformUserId: platform === "bluesky" ? "did:plc:abc" : "th-user",
  platformUsername: "alice",
  platformMetadata: null,
});

const twoParts = [
  { text: "first", mediaIds: [] as string[] },
  { text: "second", mediaIds: [] as string[] },
];

describe("Bluesky threads resume instead of reposting", () => {
  let records: Array<Record<string, unknown>>;
  let failOnCall: number | null;

  beforeEach(() => {
    vi.resetAllMocks();
    mockSaveProgress.mockResolvedValue(true);
    records = [];
    failOnCall = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("createSession")) {
          return Response.json({ accessJwt: "jwt", did: "did:plc:abc" });
        }
        if (url.includes("createRecord")) {
          const body = JSON.parse(String(init?.body)) as {
            record: Record<string, unknown>;
          };
          records.push(body.record);
          if (records.length === failOnCall) {
            return Response.json({ message: "Rate limited" }, { status: 429 });
          }
          const n = records.length;
          return Response.json({
            uri: `at://did:plc:abc/app.bsky.feed.post/r${n}`,
            cid: `c${n}`,
          });
        }
        throw new Error(`unexpected fetch ${url}`);
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  const post = (metadata: Record<string, unknown>): Post => ({
    id: POST_ID,
    finalContent: "first\n\nsecond",
    mediaIds: [],
    metadata,
  });

  it("keeps the root post when a later part fails", async () => {
    failOnCall = 2;
    const result = await publishToBluesky(
      pub("bluesky"),
      post({ twitterThread: { parts: twoParts } }),
      "alice.bsky.social",
      "app-pw",
    );

    expect(result).toMatchObject({
      status: "failed",
      platformPostId: "at://did:plc:abc/app.bsky.feed.post/r1",
      platformPostUrl: "https://bsky.app/profile/alice.bsky.social/post/r1",
    });
    expect(result.lastError).toContain("1 of 2 thread parts are live");
    expect(mockSaveProgress).toHaveBeenCalledWith(
      POST_ID,
      PUB_ID,
      expect.objectContaining({
        posted: 1,
        rootId: "at://did:plc:abc/app.bsky.feed.post/r1",
        rootCid: "c1",
      }),
    );
  });

  it("Retry replies to the live parts instead of creating a second root", async () => {
    const result = await publishToBluesky(
      pub("bluesky"),
      post(
        progressMetadata(
          { twitterThread: { parts: twoParts } },
          {
            posted: 1,
            rootId: "at://did:plc:abc/app.bsky.feed.post/root",
            rootCid: "rc",
            lastId: "at://did:plc:abc/app.bsky.feed.post/root",
            lastCid: "rc",
          },
          threadFingerprint(twoParts),
        ),
      ),
      "alice.bsky.social",
      "app-pw",
    );

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      text: "second",
      reply: {
        root: { uri: "at://did:plc:abc/app.bsky.feed.post/root", cid: "rc" },
        parent: { uri: "at://did:plc:abc/app.bsky.feed.post/root", cid: "rc" },
      },
    });
    expect(result).toMatchObject({
      status: "published",
      platformPostId: "at://did:plc:abc/app.bsky.feed.post/root",
    });
  });
});

describe("Threads threads resume instead of reposting", () => {
  let containers: Array<Record<string, string>>;
  let publishCalls: number;
  let failPublishOn: number | null;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    mockSaveProgress.mockResolvedValue(true);
    containers = [];
    publishCalls = 0;
    failPublishOn = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/me/threads?")) {
          containers.push(
            Object.fromEntries(new URLSearchParams(String(init?.body))),
          );
          return Response.json({ id: `container${containers.length}` });
        }
        if (url.includes("/threads_publish?")) {
          publishCalls += 1;
          if (publishCalls === failPublishOn) {
            return Response.json(
              { error: { message: "Server error" } },
              { status: 500 },
            );
          }
          return Response.json({ id: `th${publishCalls}` });
        }
        if (url.includes("fields=status")) {
          return Response.json({ status: "FINISHED" });
        }
        if (url.includes("fields=id%2Cpermalink") || url.includes("fields=id,permalink")) {
          return Response.json({ permalink: "https://www.threads.net/@alice/post/root" });
        }
        throw new Error(`unexpected fetch ${url}`);
      }),
    );
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const post = (metadata: Record<string, unknown>): Post => ({
    id: POST_ID,
    finalContent: "first\n\nsecond",
    mediaIds: [],
    metadata,
  });

  it("keeps the root post when a later part fails", async () => {
    failPublishOn = 2;
    const pending = publishToThreads(
      pub("threads"),
      post({ twitterThread: { parts: twoParts } }),
      "token",
    );
    await vi.runAllTimersAsync();
    const result = await pending;

    expect(result).toMatchObject({
      status: "failed",
      platformPostId: "th1",
      platformPostUrl: "https://www.threads.net/@alice/post/root",
    });
    expect(result.lastError).toContain("1 of 2 thread parts are live");
    expect(mockSaveProgress).toHaveBeenCalledWith(
      POST_ID,
      PUB_ID,
      expect.objectContaining({ posted: 1, rootId: "th1", lastId: "th1" }),
    );
  });

  it("Retry replies to the live parts instead of publishing a second root", async () => {
    const pending = publishToThreads(
      pub("threads"),
      post(
        progressMetadata(
          { twitterThread: { parts: twoParts } },
          { posted: 1, rootId: "root", lastId: "root" },
          threadFingerprint(twoParts),
        ),
      ),
      "token",
    );
    await vi.runAllTimersAsync();
    const result = await pending;

    expect(containers).toHaveLength(1);
    expect(containers[0]).toMatchObject({ text: "second", reply_to_id: "root" });
    expect(result).toMatchObject({ status: "published", platformPostId: "root" });
  });
});
