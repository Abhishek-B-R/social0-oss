import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb, r2, state } = vi.hoisted(() => ({
  mockDb: {
    query: { mediaUploads: { findFirst: vi.fn() } },
    insert: vi.fn(),
  },
  r2: {
    getR2ObjectMetadata: vi.fn(),
    getR2ObjectByteRange: vi.fn(),
    deleteR2Object: vi.fn(),
  },
  state: { confirmedRow: null as { id: string } | null },
}));

vi.mock("../db/index.js", () => ({ db: mockDb }));
vi.mock("../middleware/auth.js", () => ({
  resolveRequestActor: vi
    .fn()
    .mockResolvedValue({ userId: "user-1", source: "session" }),
  unauthorized: () => ({ error: "Unauthorized" }),
  notImplemented: () => ({ error: "Not implemented" }),
}));
vi.mock("../lib/workspace/session.js", () => ({
  requireWorkspacePermissionForActor: vi.fn().mockResolvedValue({
    ok: true,
    ctx: {
      resourceUserId: "user-1",
      workspaceId: null,
      permissions: new Set(["view_connections", "create_posts"]),
    },
  }),
}));
vi.mock("../lib/ratelimit.js", () => ({
  // Any non-null limiter: the mocked enforceRateLimit decides.
  slidingWindowLimiter: () => ({}),
  uploadLimiter: null,
  enforceRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
}));
vi.mock("../lib/env.js", () => ({
  env: { R2_PUBLIC_URL: "https://media.example.com" },
}));
vi.mock("../lib/r2.js", () => ({
  isR2Configured: () => true,
  getPresignedUploadUrl: vi.fn(),
  ...r2,
}));

import { registerMediaApiRoutes } from "../routes/api/media.js";

const STORAGE_FILENAME = "0b3c8a52-4d7e-4f0a-9c1e-2a6f5b7d8e90.png";
const KEY = `uploads/user-1/${STORAGE_FILENAME}`;
const PNG_MAGIC = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0, 0, 0,
]);

async function confirm(fileSize: number) {
  const app = Fastify();
  await registerMediaApiRoutes(app);
  const res = await app.inject({
    method: "POST",
    url: "/media/confirm",
    payload: {
      key: KEY,
      storageFilename: STORAGE_FILENAME,
      originalFilename: "photo.png",
      contentType: "image/png",
      fileSize,
    },
  });
  await app.close();
  return res.statusCode;
}

/**
 * An upload confirm rejects for good can never be confirmed later, so nothing
 * would ever reference or delete it: it has to go when it is rejected.
 */
describe("POST /api/media/confirm cleans up uploads it rejects", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.confirmedRow = null;
    mockDb.query.mediaUploads.findFirst.mockImplementation(
      async () => state.confirmedRow,
    );
    r2.getR2ObjectMetadata.mockResolvedValue({ contentLength: 4_000_000 });
    r2.getR2ObjectByteRange.mockResolvedValue(PNG_MAGIC);
    r2.deleteR2Object.mockResolvedValue(undefined);
  });

  it("deletes an object whose size does not match the declared one", async () => {
    expect(await confirm(1_000)).toBe(400);
    expect(r2.deleteR2Object).toHaveBeenCalledWith(KEY);
  });

  it("deletes an object whose bytes do not match the declared type", async () => {
    r2.getR2ObjectByteRange.mockResolvedValue(new Uint8Array(16));

    expect(await confirm(4_000_000)).toBe(400);
    expect(r2.deleteR2Object).toHaveBeenCalledWith(KEY);
  });

  it("keeps an object an earlier confirm already turned into media", async () => {
    state.confirmedRow = { id: "media-1" };

    expect(await confirm(1_000)).toBe(400);
    expect(r2.deleteR2Object).not.toHaveBeenCalled();
  });

  it("still rejects when the delete itself fails", async () => {
    r2.deleteR2Object.mockRejectedValue(new Error("R2 down"));

    expect(await confirm(1_000)).toBe(400);
  });

  it("leaves the object alone when it could not be checked at all", async () => {
    r2.getR2ObjectByteRange.mockRejectedValue(new Error("timeout"));

    expect(await confirm(4_000_000)).toBe(400);
    expect(r2.deleteR2Object).not.toHaveBeenCalled();
  });

  it("rejects and deletes an object stored under a different Content-Type", async () => {
    // GIF/PNG magic bytes with a text/html body behind them, PUT as text/html.
    r2.getR2ObjectMetadata.mockResolvedValue({
      contentLength: 4_000_000,
      contentType: "text/html",
    });

    expect(await confirm(4_000_000)).toBe(400);
    expect(r2.deleteR2Object).toHaveBeenCalledWith(KEY);
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it("accepts an object stored under the declared type, parameters aside", async () => {
    r2.getR2ObjectMetadata.mockResolvedValue({
      contentLength: 4_000_000,
      contentType: "IMAGE/PNG; charset=binary",
    });
    mockDb.insert.mockReturnValue({
      values: () => ({ returning: async () => [{ id: "media-new" }] }),
    });

    expect(await confirm(4_000_000)).toBe(200);
    expect(r2.deleteR2Object).not.toHaveBeenCalled();
  });
});
