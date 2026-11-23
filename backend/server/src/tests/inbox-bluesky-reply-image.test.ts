import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Bluesky rejects image blobs over 1,000,000 bytes, but uploads allow up to
 * 50 MB. The inbox comment-reply path used to send the R2 bytes to uploadBlob
 * untouched, so replying with an ordinary phone photo always failed. It has to
 * go through prepareImageForPlatform(..., "bluesky") like the publish path.
 */

const { fetchAllowedMedia, prepareImageForPlatform, blueskySession } =
  vi.hoisted(() => ({
    fetchAllowedMedia: vi.fn(),
    prepareImageForPlatform: vi.fn(),
    blueskySession: vi.fn(),
  }));

vi.mock("../lib/media-fetch.js", () => ({ fetchAllowedMedia }));
vi.mock("../lib/twitter-media.js", () => ({
  uploadTwitterImage: vi.fn(),
  uploadTwitterVideo: vi.fn(),
}));
vi.mock("../lib/publish-platforms/media.js", () => ({ prepareImageForPlatform }));
vi.mock("../lib/inbox/bluesky-session.js", () => ({
  blueskySession,
  blueskySessionAfter401: blueskySession,
}));

import { replyOnPlatform } from "../lib/inbox/reply-comment.js";

const RAW_SIZE = 3 * 1024 * 1024;
const PREPARED = Buffer.from("compressed-jpeg-bytes");

let uploadBodies: Array<{ body: unknown; contentType: string | null }>;
let createRecordBodies: Array<Record<string, unknown>>;

function installFetch() {
  uploadBodies = [];
  createRecordBodies = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("app.bsky.feed.getPostThread")) {
        return Response.json({
          thread: { post: { uri: "at://did:plc:x/app.bsky.feed.post/c", cid: "cid-c" } },
        });
      }
      if (url.includes("app.bsky.feed.getPosts")) {
        return Response.json({
          posts: [{ uri: "at://did:plc:abc/app.bsky.feed.post/root", cid: "cid-root" }],
        });
      }
      if (url.includes("com.atproto.repo.uploadBlob")) {
        const headers = new Headers(init?.headers);
        uploadBodies.push({ body: init?.body, contentType: headers.get("content-type") });
        const size = (init?.body as Uint8Array).byteLength;
        if (size > 1_000_000) {
          return Response.json({ error: "BlobTooLarge" }, { status: 400 });
        }
        return Response.json({ blob: { $type: "blob", ref: { $link: "bafy" }, size } });
      }
      if (url.includes("com.atproto.repo.createRecord")) {
        createRecordBodies.push(JSON.parse(String(init?.body)));
        return Response.json({ uri: "at://did:plc:abc/app.bsky.feed.post/reply" });
      }
      throw new Error(`unexpected fetch ${url}`);
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  installFetch();
  blueskySession.mockResolvedValue({ accessJwt: "jwt", did: "did:plc:abc" });
  fetchAllowedMedia.mockResolvedValue(
    new Response(new Uint8Array(RAW_SIZE), {
      headers: { "content-type": "image/png" },
    }),
  );
  prepareImageForPlatform.mockResolvedValue({
    buffer: PREPARED,
    contentType: "image/jpeg",
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Bluesky inbox comment reply with an image", () => {
  it("compresses the image for Bluesky before uploading the blob", async () => {
    const result = await replyOnPlatform({
      platform: "bluesky",
      commentId: "at://did:plc:x/app.bsky.feed.post/c",
      text: "thanks!",
      mediaUrl: "https://media.test/photo.png",
      mediaMimeType: "image/png",
      accessToken: "unused",
      accessSecret: "app-password",
      accountId: "acct-1",
      platformUserId: "did:plc:abc",
      platformPostId: "at://did:plc:abc/app.bsky.feed.post/root",
      accountHandle: "alice.bsky.social",
    });

    expect(result).toEqual({
      ok: true,
      replyId: "at://did:plc:abc/app.bsky.feed.post/reply",
    });
    expect(prepareImageForPlatform).toHaveBeenCalledTimes(1);
    const [bytes, platform, mime] = prepareImageForPlatform.mock.calls[0];
    expect((bytes as ArrayBuffer).byteLength).toBe(RAW_SIZE);
    expect(platform).toBe("bluesky");
    expect(mime).toBe("image/png");

    expect(uploadBodies).toHaveLength(1);
    expect(Buffer.from(uploadBodies[0].body as Uint8Array)).toEqual(PREPARED);
    expect(uploadBodies[0].contentType).toBe("image/jpeg");

    const record = createRecordBodies[0]?.record as { embed?: { images?: unknown[] } };
    expect(record.embed?.images).toHaveLength(1);
  });
});
