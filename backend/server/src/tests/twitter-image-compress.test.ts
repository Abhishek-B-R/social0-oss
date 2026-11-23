import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";

const X_IMAGE_LIMIT = 5 * 1024 * 1024;

const { uploadMedia, fetchAllowedMedia } = vi.hoisted(() => ({
  uploadMedia: vi.fn(async (_buf: Buffer, _opts: { mimeType: string }) => "media-1"),
  fetchAllowedMedia: vi.fn(),
}));

vi.mock("twitter-api-v2", () => ({
  TwitterApi: class {
    v1 = { uploadMedia };
  },
}));

vi.mock("@/lib/media-fetch", () => ({ fetchAllowedMedia }));

// vitest has no "@/" alias: point the real modules on this path at their files.
vi.mock("@/lib/twitter-errors", () => import("../lib/twitter-errors.js"));
vi.mock("@/lib/twitter-media-upload-fetch", () =>
  import("../lib/twitter-media-upload-fetch.js"),
);
vi.mock("@/lib/publish-platforms/media", () =>
  import("../lib/publish-platforms/media.js"),
);
vi.mock("@/lib/publish-validation", () => import("../lib/publish-validation.js"));
vi.mock("@/lib/validation", () => import("../lib/validation.js"));
vi.mock("@/lib/r2", () => import("../lib/r2.js"));
vi.mock("@/db/schema", () => import("../db/schema.js"));
// media.ts pulls in the DB client for its lookup helpers; the compressor never
// touches it, so keep the test off any connection pool.
vi.mock("@/db", () => ({ db: {} }));

import { uploadTwitterImage } from "../lib/twitter-media.js";

function respond(bytes: Buffer, contentType: string): Response {
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: { "content-type": contentType },
  });
}

/** Random-noise PNG: incompressible, so it lands well over X's 5 MB cap. */
async function oversizedPng(): Promise<Buffer> {
  const width = 1600;
  const height = 1600;
  const png = await sharp(randomBytes(width * height * 3), {
    raw: { width, height, channels: 3 },
  })
    .png({ compressionLevel: 0 })
    .toBuffer();
  expect(png.length).toBeGreaterThan(X_IMAGE_LIMIT);
  return png;
}

describe("uploadTwitterImage compression", () => {
  beforeEach(() => {
    process.env.TWITTER_CONSUMER_KEY = "test-key";
    process.env.TWITTER_CONSUMER_SECRET = "test-secret";
    delete process.env.SOCIAL0_PUBLISH_WORKER;
    uploadMedia.mockClear();
    fetchAllowedMedia.mockReset();
  });

  it("compresses an image over 5 MB before sending it to X", async () => {
    fetchAllowedMedia.mockResolvedValue(respond(await oversizedPng(), "image/png"));

    await expect(uploadTwitterImage("https://media.test/a.png", "t", "s")).resolves.toBe(
      "media-1",
    );

    const [sent, opts] = uploadMedia.mock.calls[0];
    expect(sent.length).toBeLessThanOrEqual(X_IMAGE_LIMIT);
    expect(opts.mimeType).toBe("image/jpeg");
  }, 30_000);

  it("sends an image under the limit unchanged with its own content type", async () => {
    const small = await sharp({
      create: { width: 8, height: 8, channels: 3, background: "#ff0000" },
    })
      .png()
      .toBuffer();
    fetchAllowedMedia.mockResolvedValue(respond(small, "image/png"));

    await uploadTwitterImage("https://media.test/b.png", "t", "s");

    const [sent, opts] = uploadMedia.mock.calls[0];
    expect(Buffer.compare(sent, small)).toBe(0);
    expect(opts.mimeType).toBe("image/png");
  });

  it("never re-encodes a GIF, even past 5 MB, so animation survives", async () => {
    const gif = Buffer.concat([
      Buffer.from("GIF89a", "latin1"),
      Buffer.alloc(X_IMAGE_LIMIT + 1024),
    ]);
    // Storage sometimes reports a generic type; the magic bytes still mark it.
    fetchAllowedMedia.mockResolvedValue(respond(gif, "application/octet-stream"));

    await uploadTwitterImage("https://media.test/c.gif", "t", "s");

    const [sent, opts] = uploadMedia.mock.calls[0];
    expect(sent.length).toBe(gif.length);
    expect(opts.mimeType).toBe("image/gif");
  });
});
