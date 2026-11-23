/**
 * `/v1/media/confirm` must hold the same line as the dashboard confirm: the
 * per-type size cap, the allowed type list, and the hourly upload budget.
 * Without them, presign as `video/mp4` (500 MB) then confirm as `image/png`
 * registered a 500 MB "image" that image publish paths load whole into memory.
 */

import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb, r2, enforceRateLimit, insertedValues } = vi.hoisted(() => ({
  mockDb: {
    query: { mediaUploads: { findFirst: vi.fn() } },
    insert: vi.fn(),
  },
  r2: {
    getR2ObjectMetadata: vi.fn(),
    getR2ObjectByteRange: vi.fn(),
    getPresignedUploadUrl: vi.fn(),
  },
  enforceRateLimit: vi.fn(),
  insertedValues: [] as unknown[],
}));

vi.mock("../db/index.js", () => ({ db: mockDb }));
vi.mock("../lib/env.js", () => ({
  env: { R2_PUBLIC_URL: "https://media.example.com" },
}));
vi.mock("../lib/r2.js", () => ({ isR2Configured: () => true, ...r2 }));
vi.mock("../lib/ratelimit.js", () => ({
  // Any non-null limiter: the mocked enforceRateLimit decides.
  slidingWindowLimiter: () => ({}),
  uploadLimiter: { kind: "upload" },
  enforceRateLimit,
}));
vi.mock("../middleware/api-auth.js", () => ({
  requireV1ApiKey: async () => undefined,
  v1UserId: () => "user-1",
}));

import { MAX_IMAGE_SIZE_BYTES, MAX_VIDEO_SIZE_BYTES } from "../lib/media-upload-policy.js";
import { registerMediaRoutes } from "../routes/v1/media.js";
import { v1ConfirmMedia } from "../services/v1-media.js";

const STORAGE_FILENAME = "0b3c8a52-4d7e-4f0a-9c1e-2a6f5b7d8e90.png";
const KEY = `uploads/user-1/${STORAGE_FILENAME}`;
const PNG_MAGIC = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0, 0, 0,
]);

function confirmInput(overrides: Partial<Parameters<typeof v1ConfirmMedia>[1]> = {}) {
  return {
    key: KEY,
    storage_filename: STORAGE_FILENAME,
    original_filename: "a.png",
    content_type: "image/png",
    size_bytes: 4_000_000,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  insertedValues.length = 0;
  mockDb.query.mediaUploads.findFirst.mockResolvedValue(null);
  mockDb.insert.mockReturnValue({
    values: (v: unknown) => {
      insertedValues.push(v);
      return { returning: async () => [{ id: "media-1", url: "u" }] };
    },
  });
  r2.getR2ObjectMetadata.mockResolvedValue({
    contentLength: 4_000_000,
    contentType: "image/png",
  });
  r2.getR2ObjectByteRange.mockResolvedValue(PNG_MAGIC);
  r2.getPresignedUploadUrl.mockResolvedValue("https://r2.example.com/put");
  enforceRateLimit.mockResolvedValue({ allowed: true });
});

describe("v1ConfirmMedia caps", () => {
  it("registers a normal image", async () => {
    const out = await v1ConfirmMedia("user-1", confirmInput());
    expect(out).toEqual({ ok: true, id: "media-1", url: "u" });
    expect(insertedValues).toHaveLength(1);
  });

  it("rejects a video-sized object confirmed as an image", async () => {
    const size = MAX_VIDEO_SIZE_BYTES;
    r2.getR2ObjectMetadata.mockResolvedValue({
      contentLength: size,
      contentType: "image/png",
    });

    const out = await v1ConfirmMedia("user-1", confirmInput({ size_bytes: size }));

    expect(out.ok).toBe(false);
    expect(insertedValues).toHaveLength(0);
    // Rejected before touching storage.
    expect(r2.getR2ObjectMetadata).not.toHaveBeenCalled();
  });

  it("rejects when the real length is over the cap even if the declared size is not", async () => {
    // Declared exactly at the cap, real object 1 KB over: inside the size
    // tolerance, but over the cap.
    r2.getR2ObjectMetadata.mockResolvedValue({
      contentLength: MAX_IMAGE_SIZE_BYTES + 1024,
      contentType: "image/png",
    });

    const out = await v1ConfirmMedia(
      "user-1",
      confirmInput({ size_bytes: MAX_IMAGE_SIZE_BYTES }),
    );

    expect(out.ok).toBe(false);
    expect(insertedValues).toHaveLength(0);
  });

  it("rejects a type outside the allowed list", async () => {
    const out = await v1ConfirmMedia(
      "user-1",
      confirmInput({ content_type: "image/svg+xml" }),
    );
    expect(out).toEqual({ ok: false, error: "Unsupported file type: image/svg+xml" });
    expect(insertedValues).toHaveLength(0);
  });

  it("rejects re-labelling an object presigned as another type", async () => {
    r2.getR2ObjectMetadata.mockResolvedValue({
      contentLength: 4_000_000,
      contentType: "video/mp4",
    });

    const out = await v1ConfirmMedia("user-1", confirmInput());

    expect(out.ok).toBe(false);
    expect(insertedValues).toHaveLength(0);
  });

  it("still confirms when storage reports no content type", async () => {
    r2.getR2ObjectMetadata.mockResolvedValue({ contentLength: 4_000_000 });
    const out = await v1ConfirmMedia("user-1", confirmInput());
    expect(out.ok).toBe(true);
  });
});

describe("/v1/media upload budget", () => {
  async function post(url: string, payload: object) {
    const app = Fastify();
    await registerMediaRoutes(app);
    const res = await app.inject({ method: "POST", url, payload });
    await app.close();
    return res;
  }

  it("applies the upload limiter to presign and confirm under a v1 key", async () => {
    await post("/media/presign", {
      filename: "a.png",
      content_type: "image/png",
      size_bytes: 4_000_000,
    });
    await post("/media/confirm", confirmInput());

    expect(enforceRateLimit).toHaveBeenCalledTimes(2);
    for (const call of enforceRateLimit.mock.calls) {
      expect(call).toEqual([{ kind: "upload" }, "v1:upload:user-1"]);
    }
  });

  it("returns 429 with Retry-After and does no work when over budget", async () => {
    enforceRateLimit.mockResolvedValue({
      allowed: false,
      status: 429,
      error: "Too many requests",
      reset: Date.now() + 30_000,
    });

    const res = await post("/media/presign", {
      filename: "a.png",
      content_type: "image/png",
      size_bytes: 4_000_000,
    });

    expect(res.statusCode).toBe(429);
    expect(res.headers["retry-after"]).toBeDefined();
    expect(r2.getPresignedUploadUrl).not.toHaveBeenCalled();
  });
});
