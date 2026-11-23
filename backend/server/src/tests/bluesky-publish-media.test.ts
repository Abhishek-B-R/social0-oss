import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Bluesky caps images at 1 MB, so most photos go through sharp before upload.
 * On the Cloudflare worker sharp is a stub that throws, and the publisher used
 * to swallow that per image: a thread part went out as text only and was
 * marked published, and a single post with one large and one small photo went
 * out with just the small one. A media failure has to fail the publication.
 */

const { fetchMediaBytes, getOrderedMediaWithUrls, prepareImageForPlatform } =
  vi.hoisted(() => ({
    fetchMediaBytes: vi.fn(),
    getOrderedMediaWithUrls: vi.fn(),
    prepareImageForPlatform: vi.fn(),
  }));

vi.mock("@/lib/publish-log", () => ({
  publishLog: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../lib/publish-platforms/media.js", () => ({
  fetchMediaBytes,
  getOrderedMediaWithUrls,
  prepareImageForPlatform,
}));
// Thread progress is a posts.metadata write; covered in thread-publish-resume.
vi.mock("../lib/publish-platforms/thread-progress.js", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../lib/publish-platforms/thread-progress.js")
  >()),
  saveThreadProgress: vi.fn(async () => true),
}));

import { publishToBluesky } from "../lib/publish-platforms/bluesky.js";
import type { Post, Pub } from "../lib/publish-platforms/types.js";

const SHARP_STUB_ERROR =
  "Image processing (sharp) is not available on the Cloudflare publish worker.";

const pub: Pub = {
  publicationId: "pub-1",
  connectedAccountId: "acct-1",
  platform: "bluesky",
  platformUserId: "did:plc:abc",
  platformUsername: "alice.bsky.social",
  platformMetadata: null,
};

const media = {
  small: { id: "m-small", url: "https://media.test/small.jpg", mimeType: "image/jpeg" },
  large: { id: "m-large", url: "https://media.test/large.jpg", mimeType: "image/jpeg" },
};

let createRecordBodies: Array<Record<string, unknown>>;
let uploadBlobStatus: number;

function installFetch() {
  createRecordBodies = [];
  const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("com.atproto.server.createSession")) {
      return Response.json({ accessJwt: "jwt", did: "did:plc:abc" });
    }
    if (url.startsWith("https://plc.directory/")) {
      return Response.json({
        service: [
          {
            id: "#atproto_pds",
            type: "AtprotoPersonalDataServer",
            serviceEndpoint: "https://pds.example.com",
          },
        ],
      });
    }
    if (url.includes("com.atproto.repo.uploadBlob")) {
      if (uploadBlobStatus !== 200) {
        return Response.json(
          { error: "BlobTooLarge", message: "This file is too large." },
          { status: uploadBlobStatus },
        );
      }
      return Response.json({ blob: { ref: "blob-ref" } });
    }
    if (url.includes("com.atproto.repo.createRecord")) {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      createRecordBodies.push(body);
      const n = createRecordBodies.length;
      return Response.json({
        uri: `at://did:plc:abc/app.bsky.feed.post/rk${n}`,
        cid: `cid${n}`,
      });
    }
    throw new Error(`unexpected fetch ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
}

beforeEach(() => {
  uploadBlobStatus = 200;
  installFetch();
  getOrderedMediaWithUrls.mockImplementation(async (ids: string[]) =>
    ids.map((id) => (id === media.large.id ? media.large : media.small)),
  );
  fetchMediaBytes.mockImplementation(async (url: string) =>
    new TextEncoder().encode(url).buffer,
  );
  // Behaves like the worker: under-limit images pass through, the large one
  // needs sharp and hits the stub.
  prepareImageForPlatform.mockImplementation(async (bytes: ArrayBuffer) => {
    if (new TextDecoder().decode(bytes) === media.large.url) {
      throw new Error(SHARP_STUB_ERROR);
    }
    return { buffer: Buffer.from(bytes), contentType: "image/jpeg" };
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function threadPost(parts: Array<{ text: string; mediaIds: string[] }>): Post {
  return {
    id: "post-1",
    finalContent: parts[0]?.text ?? "",
    mediaIds: null,
    metadata: { twitterThread: { parts } },
  };
}

describe("publishToBluesky thread media", () => {
  it("fails the thread instead of posting a part without its image", async () => {
    const result = await publishToBluesky(
      pub,
      threadPost([
        { text: "part one", mediaIds: [media.small.id] },
        { text: "part two", mediaIds: [media.large.id] },
      ]),
      "alice.bsky.social",
      "app-password",
    );

    expect(result.status).toBe("failed");
    expect(result.lastError).toContain("thread part 2");
    expect(result.lastError).toContain(SHARP_STUB_ERROR);
    // Media is uploaded before any record, so no half thread is left behind.
    expect(createRecordBodies).toHaveLength(0);
  });

  it("posts every part with its media and chains the replies", async () => {
    const result = await publishToBluesky(
      pub,
      threadPost([
        { text: "part one", mediaIds: [media.small.id] },
        { text: "part two", mediaIds: [media.small.id] },
      ]),
      "alice.bsky.social",
      "app-password",
    );

    expect(result.status).toBe("published");
    expect(createRecordBodies).toHaveLength(2);
    for (const body of createRecordBodies) {
      const record = body.record as { embed?: { $type: string; images: unknown[] } };
      expect(record.embed?.$type).toBe("app.bsky.embed.images");
      expect(record.embed?.images).toHaveLength(1);
    }
    const second = createRecordBodies[1].record as {
      reply?: { root: { uri: string }; parent: { uri: string } };
    };
    expect(second.reply?.root.uri).toBe("at://did:plc:abc/app.bsky.feed.post/rk1");
  });
});

describe("publishToBluesky single post media", () => {
  it("fails instead of publishing only the images that made it", async () => {
    const result = await publishToBluesky(
      pub,
      {
        id: "post-1",
        finalContent: "two photos",
        mediaIds: [media.small.id, media.large.id],
        metadata: null,
      },
      "alice.bsky.social",
      "app-password",
    );

    expect(result.status).toBe("failed");
    expect(result.lastError).toContain("image 2 of 2");
    expect(result.lastError).toContain(SHARP_STUB_ERROR);
    expect(createRecordBodies).toHaveLength(0);
  });

  it("surfaces Bluesky's reason when it rejects an upload", async () => {
    uploadBlobStatus = 400;
    const result = await publishToBluesky(
      pub,
      {
        id: "post-1",
        finalContent: "one photo",
        mediaIds: [media.small.id],
        metadata: null,
      },
      "alice.bsky.social",
      "app-password",
    );

    expect(result.status).toBe("failed");
    expect(result.lastError).toContain("This file is too large.");
    expect(createRecordBodies).toHaveLength(0);
  });
});
