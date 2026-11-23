import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Two publish-engine media bugs:
 *
 * 1. publishToPlatform ran one global "max 20 media ids" check on the flat
 *    list before dispatch. A TikTok carousel of 21-35 photos, a thread of six
 *    parts with four images each (24 flattened ids), and an Instagram post with
 *    more images than it takes (which should be trimmed) all failed at publish
 *    time, after the post was scheduled and charged.
 * 2. YouTube, LinkedIn and Pinterest read a whole video (uploads go to 500 MB)
 *    into the 128 MB Cloudflare publish worker, two or three copies at once,
 *    and Bluesky pulled the whole file before checking its 100 MB cap.
 */

const h = vi.hoisted(() => ({
  publishers: {
    facebook: vi.fn(),
    bluesky: vi.fn(),
    youtube: vi.fn(),
    pinterest: vi.fn(),
    instagram: vi.fn(),
    tiktok: vi.fn(),
    threads: vi.fn(),
  },
  r2: {
    isR2Configured: vi.fn(() => false),
    getR2KeyFromUrl: vi.fn((): string | null => null),
    getR2ObjectBytes: vi.fn(),
    getR2ObjectByteRange: vi.fn(),
    getR2ObjectMetadata: vi.fn(),
  },
}));

vi.mock("@/lib/publish-log", () => ({
  publishLog: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
// vitest has no "@/" alias: point the real modules on these paths at their files.
vi.mock("@/lib/validation", () => import("../lib/validation.js"));
vi.mock("@/lib/publish-validation", () => import("../lib/publish-validation.js"));
vi.mock("@/lib/post-media-refs", () => import("../lib/post-media-refs.js"));
vi.mock("@/lib/twitter-media-upload-fetch", () =>
  import("../lib/twitter-media-upload-fetch.js"),
);
vi.mock("@/db/schema", () => import("../db/schema.js"));
vi.mock("@/db", () => ({ db: {} }));
vi.mock("../db/index.js", () => ({ db: {} }));
vi.mock("@/lib/r2", () => h.r2);

vi.mock("../lib/publish-platforms/facebook.js", () => ({
  publishToFacebook: h.publishers.facebook,
}));
vi.mock("../lib/publish-platforms/bluesky.js", () => ({
  publishToBluesky: h.publishers.bluesky,
}));
vi.mock("../lib/publish-platforms/youtube.js", () => ({
  publishToYouTube: h.publishers.youtube,
}));
vi.mock("../lib/publish-platforms/pinterest.js", () => ({
  publishToPinterest: h.publishers.pinterest,
}));
vi.mock("../lib/publish-platforms/instagram.js", () => ({
  publishToInstagram: h.publishers.instagram,
}));
vi.mock("../lib/publish-platforms/tiktok.js", () => ({
  publishToTikTok: h.publishers.tiktok,
}));
vi.mock("../lib/publish-platforms/threads.js", () => ({
  publishToThreads: h.publishers.threads,
}));

import { publishToPlatform } from "../lib/publish-platforms/index.js";
import type { Post, Pub } from "../lib/publish-platforms/types.js";
import { validatePostMediaCounts } from "../lib/post-media-refs.js";
import {
  bufferedMediaTooLargeError,
  fetchMediaByteRange,
  fetchMediaBytes,
  PUBLISH_WORKER_MAX_BUFFERED_MEDIA_BYTES,
} from "../lib/publish-platforms/media.js";

const ids = (n: number, prefix = "m") =>
  Array.from({ length: n }, (_, i) => `${prefix}-${i + 1}`);

function pubFor(platform: string): Pub {
  return {
    publicationId: "pub-1",
    connectedAccountId: "acct-1",
    platform,
    platformUserId: "user-1",
    platformUsername: "someone",
    platformMetadata: null,
  };
}

function threadOf(parts: string[][]): Post {
  return {
    id: "post-1",
    finalContent: "thread",
    mediaIds: parts.flat(),
    metadata: {
      twitterThread: {
        parts: parts.map((mediaIds, i) => ({ text: `part ${i + 1}`, mediaIds })),
      },
    },
  };
}

beforeEach(() => {
  for (const fn of Object.values(h.publishers)) {
    fn.mockReset();
    fn.mockResolvedValue({ status: "published" });
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.SOCIAL0_PUBLISH_WORKER;
});

describe("publishToPlatform media count", () => {
  it("passes a 35-photo TikTok carousel to the TikTok publisher", async () => {
    const result = await publishToPlatform(
      pubFor("tiktok"),
      { id: "post-1", finalContent: "photos", mediaIds: ids(35), metadata: null },
      "token",
      null,
    );

    expect(result.status).toBe("published");
    expect(h.publishers.tiktok).toHaveBeenCalledTimes(1);
  });

  it("passes a thread of six 4-image parts (24 flattened ids) to Bluesky and Threads", async () => {
    const post = threadOf(Array.from({ length: 6 }, (_, i) => ids(4, `p${i}`)));

    for (const platform of ["bluesky", "threads"] as const) {
      const result = await publishToPlatform(pubFor(platform), post, "token", null);
      expect(result.status).toBe("published");
      expect(h.publishers[platform]).toHaveBeenCalledTimes(1);
    }
  });

  it("leaves trimming 25 images to the Instagram publisher instead of failing", async () => {
    const result = await publishToPlatform(
      pubFor("instagram"),
      { id: "post-1", finalContent: "many", mediaIds: ids(25), metadata: null },
      "token",
      null,
    );

    expect(result.status).toBe("published");
    expect(h.publishers.instagram.mock.calls[0]?.[1].mediaIds).toHaveLength(25);
  });

  it("still refuses a malformed post past the abuse ceiling", async () => {
    const result = await publishToPlatform(
      pubFor("facebook"),
      { id: "post-1", finalContent: "spam", mediaIds: ids(36), metadata: null },
      "token",
      null,
    );

    expect(result.status).toBe("failed");
    expect(result.lastError).toBe("Maximum 35 media items per post.");
    expect(h.publishers.facebook).not.toHaveBeenCalled();
  });
});

describe("validatePostMediaCounts", () => {
  it("caps each thread part, not the flattened list", () => {
    expect(validatePostMediaCounts(ids(24), threadOf([ids(12), ids(12)]).metadata)).toBeNull();
    expect(
      validatePostMediaCounts(ids(36), threadOf([ids(36)]).metadata),
    ).toMatch(/Each post in a thread/);
  });

  it("caps a flat list that is bigger than its parts can hold", () => {
    expect(
      validatePostMediaCounts(ids(71), threadOf([ids(1), ids(1)]).metadata),
    ).toMatch(/Each post in a thread/);
  });

  it("caps every accountMedia list", () => {
    expect(
      validatePostMediaCounts([], { accountMedia: { "acct-1": ids(36) } }),
    ).toBe("Maximum 35 media items per post.");
    expect(
      validatePostMediaCounts([], { accountMedia: { tiktok: ids(35) } }),
    ).toBeNull();
  });
});

describe("media byte helpers", () => {
  const url = "http://localhost:5173/uploads/user-1/video.mp4";

  it("fetchMediaBytes hands back the R2 buffer without another full copy", async () => {
    h.r2.isR2Configured.mockReturnValue(true);
    const bytes = new Uint8Array([1, 2, 3, 4]);
    h.r2.getR2ObjectBytes.mockResolvedValue(bytes);

    const out = await fetchMediaBytes(url);

    expect(out).toBe(bytes.buffer);
    h.r2.isR2Configured.mockReturnValue(false);
  });

  it("fetchMediaByteRange asks for the range and refuses a whole-file answer", async () => {
    const fetchMock = vi.fn(async (_input: string | URL, init?: RequestInit) => {
      const range = new Headers(init?.headers).get("range");
      if (range === "bytes=2-5") {
        return new Response(new Uint8Array([2, 3, 4, 5]), { status: 206 });
      }
      return new Response(new Uint8Array(100), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchMediaByteRange(url, 2, 5)).resolves.toEqual(
      new Uint8Array([2, 3, 4, 5]),
    );
    await expect(
      fetchMediaByteRange(url, 0, 9, { retries: 0 }),
    ).rejects.toThrow(/ignored the byte range/);
  });

  it("only the publish worker refuses to buffer a large video", () => {
    const big = PUBLISH_WORKER_MAX_BUFFERED_MEDIA_BYTES + 1;
    expect(bufferedMediaTooLargeError(big, "LinkedIn")).toBeNull();

    process.env.SOCIAL0_PUBLISH_WORKER = "1";
    expect(bufferedMediaTooLargeError(big, "LinkedIn")).toMatch(/LinkedIn/);
    expect(
      bufferedMediaTooLargeError(PUBLISH_WORKER_MAX_BUFFERED_MEDIA_BYTES, "LinkedIn"),
    ).toBeNull();
    expect(bufferedMediaTooLargeError(null, "LinkedIn")).toBeNull();
  });
});
