import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Video uploads go up to 500 MB, and YouTube, LinkedIn and Pinterest publish
 * from the Cloudflare worker, whose isolate gets 128 MB. Each read the whole
 * file (two or three copies at once), so a 60-100 MB clip killed the isolate
 * and the queue retried the crash into the DLQ. Bluesky read up to 500 MB
 * before checking its 100 MB cap.
 */

const h = vi.hoisted(() => ({
  media: {
    getMediaWithUrls: vi.fn(),
    getOrderedMediaWithUrls: vi.fn(),
    fetchMediaBytes: vi.fn(),
    fetchMediaByteRange: vi.fn(),
    getMediaByteSize: vi.fn(),
    prepareImageForPlatform: vi.fn(),
  },
  fetchAllowedMedia: vi.fn(),
}));

vi.mock("@/lib/publish-log", () => ({
  publishLog: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/validation", () => import("../lib/validation.js"));
vi.mock("@/lib/publish-validation", () => import("../lib/publish-validation.js"));
vi.mock("@/lib/token-refresh", () => ({
  getValidToken: vi.fn(async () => "yt-token"),
}));
vi.mock("@/lib/media-fetch.js", () => ({ fetchAllowedMedia: h.fetchAllowedMedia }));
vi.mock("@/lib/twitter-media-upload-fetch", () =>
  import("../lib/twitter-media-upload-fetch.js"),
);
// The real worker-size guard, with the lookups and downloads mocked out.
const { mediaModule } = vi.hoisted(() => ({
  mediaModule: async () => {
    const actual = await vi.importActual<
      typeof import("../lib/publish-platforms/media.js")
    >("../lib/publish-platforms/media.js");
    return {
      ...h.media,
      bufferedMediaTooLargeError: actual.bufferedMediaTooLargeError,
      PUBLISH_WORKER_MAX_BUFFERED_MEDIA_BYTES:
        actual.PUBLISH_WORKER_MAX_BUFFERED_MEDIA_BYTES,
    };
  },
}));
vi.mock("../lib/publish-platforms/media.js", () => mediaModule());
vi.mock("@/lib/publish-platforms/media", () => mediaModule());
// media.ts (loaded for the guard above) pulls these in.
vi.mock("@/db/schema", () => import("../db/schema.js"));
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/r2", () => ({
  isR2Configured: () => false,
  getR2KeyFromUrl: () => null,
}));
vi.mock("../lib/publish-platforms/thread-progress.js", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../lib/publish-platforms/thread-progress.js")
  >()),
  saveThreadProgress: vi.fn(async () => true),
}));

import {
  publishToYouTube,
  YOUTUBE_UPLOAD_CHUNK_BYTES,
} from "../lib/publish-platforms/youtube.js";
import { publishToBluesky } from "../lib/publish-platforms/bluesky.js";
import { uploadLinkedInVideo } from "../lib/linkedin-media.js";
import type { Pub } from "../lib/publish-platforms/types.js";

const MB = 1024 * 1024;
const VIDEO_URL = "https://media.test/uploads/user-1/clip.mp4";

function pubFor(platform: string): Pub {
  return {
    publicationId: "pub-1",
    connectedAccountId: "acct-1",
    platform,
    platformUserId: "did:plc:abc",
    platformUsername: "someone",
    platformMetadata: null,
  };
}

const videoPost = {
  id: "post-1",
  finalContent: "a clip",
  mediaIds: ["v-1"],
  metadata: null,
};

beforeEach(() => {
  for (const fn of Object.values(h.media)) fn.mockReset();
  h.fetchAllowedMedia.mockReset();
  h.media.fetchMediaByteRange.mockImplementation(
    async (_url: string, start: number, end: number) =>
      new Uint8Array(end - start + 1),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.SOCIAL0_PUBLISH_WORKER;
});

describe("YouTube upload", () => {
  function installYouTubeFetch() {
    const contentRanges: string[] = [];
    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("uploadType=resumable")) {
        return new Response(null, {
          status: 200,
          headers: { location: "https://upload.test/session-1" },
        });
      }
      if (url === "https://upload.test/session-1") {
        const range = new Headers(init?.headers).get("content-range") ?? "";
        contentRanges.push(range);
        const [, end, total] = /bytes \d+-(\d+)\/(\d+)/.exec(range) ?? [];
        if (Number(end) + 1 < Number(total)) {
          return new Response(null, {
            status: 308,
            headers: { range: `bytes=0-${end}` },
          });
        }
        return Response.json({ id: "yt-video-1" });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    return { fetchMock, contentRanges };
  }

  it("sends a large video in ranged chunks without reading it whole", async () => {
    const total = 2 * YOUTUBE_UPLOAD_CHUNK_BYTES + 5 * MB;
    h.media.getMediaWithUrls.mockResolvedValue([
      { url: VIDEO_URL, mimeType: "video/mp4", sizeBytes: total },
    ]);
    h.media.getMediaByteSize.mockImplementation(async (_u: string, size: number) => size);
    const { contentRanges } = installYouTubeFetch();

    const result = await publishToYouTube(pubFor("youtube"), videoPost, "unused");

    expect(result.status).toBe("published");
    expect(result.platformPostId).toBe("yt-video-1");
    expect(h.media.fetchMediaBytes).not.toHaveBeenCalled();
    const c = YOUTUBE_UPLOAD_CHUNK_BYTES;
    expect(contentRanges).toEqual([
      `bytes 0-${c - 1}/${total}`,
      `bytes ${c}-${2 * c - 1}/${total}`,
      `bytes ${2 * c}-${total - 1}/${total}`,
    ]);
  });

  it("refuses a video over YouTube's cap before downloading or calling YouTube", async () => {
    h.media.getMediaWithUrls.mockResolvedValue([
      { url: VIDEO_URL, mimeType: "video/mp4", sizeBytes: 600 * MB },
    ]);
    h.media.getMediaByteSize.mockImplementation(async (_u: string, size: number) => size);
    const { fetchMock } = installYouTubeFetch();

    const result = await publishToYouTube(pubFor("youtube"), videoPost, "unused");

    expect(result.status).toBe("failed");
    expect(result.error).toBe("Video too large");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(h.media.fetchMediaByteRange).not.toHaveBeenCalled();
  });

  it("still uploads a video whose size is unknown by reading it whole", async () => {
    h.media.getMediaWithUrls.mockResolvedValue([
      { url: VIDEO_URL, mimeType: "video/mp4", sizeBytes: null },
    ]);
    h.media.getMediaByteSize.mockResolvedValue(null);
    h.media.fetchMediaBytes.mockResolvedValue(new ArrayBuffer(3 * MB));
    const { contentRanges } = installYouTubeFetch();

    const result = await publishToYouTube(pubFor("youtube"), videoPost, "unused");

    expect(result.status).toBe("published");
    expect(contentRanges).toEqual([`bytes 0-${3 * MB - 1}/${3 * MB}`]);
  });
});

describe("Bluesky video", () => {
  it("refuses a video over 100 MB before downloading it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        if (String(input).includes("com.atproto.server.createSession")) {
          return Response.json({ accessJwt: "jwt", did: "did:plc:abc" });
        }
        throw new Error(`unexpected fetch ${String(input)}`);
      }),
    );
    h.media.getOrderedMediaWithUrls.mockResolvedValue([
      { id: "v-1", url: VIDEO_URL, mimeType: "video/mp4", sizeBytes: 300 * MB },
    ]);

    const result = await publishToBluesky(
      pubFor("bluesky"),
      videoPost,
      "someone.bsky.social",
      "app-password",
    );

    expect(result.status).toBe("failed");
    expect(result.lastError).toMatch(/too large for Bluesky/);
    expect(h.media.fetchMediaBytes).not.toHaveBeenCalled();
  });
});

describe("LinkedIn video on the publish worker", () => {
  it("refuses a video too big to buffer before downloading or registering it", async () => {
    process.env.SOCIAL0_PUBLISH_WORKER = "1";
    h.media.getMediaByteSize.mockResolvedValue(90 * MB);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      uploadLinkedInVideo(VIDEO_URL, "li-token", "urn:li:person:1"),
    ).rejects.toThrow(/LinkedIn uploads from the publish worker/);
    expect(h.fetchAllowedMedia).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("buffers as before on the API process", async () => {
    h.media.getMediaByteSize.mockResolvedValue(90 * MB);
    h.fetchAllowedMedia.mockRejectedValue(new Error("reached the download"));

    await expect(
      uploadLinkedInVideo(VIDEO_URL, "li-token", "urn:li:person:1"),
    ).rejects.toThrow("reached the download");
  });
});
