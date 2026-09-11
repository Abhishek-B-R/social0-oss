import { describe, it, expect } from "vitest";
import {
  contentTypeMatchesMagicBytes,
  isAllowedMediaContentType,
  isGeneratedStorageFilename,
} from "../lib/media-upload-policy.js";

describe("isGeneratedStorageFilename", () => {
  it("accepts what presign mints", () => {
    for (const name of [
      "0f9e8d7c-6b5a-4321-8abc-1234567890ab.jpg",
      "0f9e8d7c-6b5a-4321-8abc-1234567890ab.jpeg",
      "0f9e8d7c-6b5a-4321-8abc-1234567890ab.mp4",
      "0f9e8d7c-6b5a-4321-8abc-1234567890ab.bin",
    ]) {
      expect(isGeneratedStorageFilename(name), name).toBe(true);
    }
  });

  it("rejects traversal, nesting and free-form names", () => {
    for (const name of [
      "../0f9e8d7c-6b5a-4321-8abc-1234567890ab.jpg",
      "sub/0f9e8d7c-6b5a-4321-8abc-1234567890ab.jpg",
      "0f9e8d7c-6b5a-4321-8abc-1234567890ab.jpg/../evil.jpg",
      "0f9e8d7c-6b5a-4321-8abc-1234567890ab",
      "avatar.jpg",
      "",
      "0F9E8D7C-6B5A-4321-8ABC-1234567890AB.jpg",
    ]) {
      expect(isGeneratedStorageFilename(name), name).toBe(false);
    }
  });
});

describe("media content types", () => {
  it("allows only the documented image and video types", () => {
    expect(isAllowedMediaContentType("image/png")).toBe(true);
    expect(isAllowedMediaContentType("video/mp4")).toBe(true);
    expect(isAllowedMediaContentType("image/svg+xml")).toBe(false);
    expect(isAllowedMediaContentType("text/html")).toBe(false);
    expect(isAllowedMediaContentType("application/octet-stream")).toBe(false);
  });

  it("rejects a declared type the bytes do not back", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]);
    const html = new Uint8Array([0x3c, 0x68, 0x74, 0x6d, 0x6c, 0, 0, 0]);
    expect(contentTypeMatchesMagicBytes("image/png", png)).toBe(true);
    expect(contentTypeMatchesMagicBytes("image/jpeg", png)).toBe(false);
    expect(contentTypeMatchesMagicBytes("image/png", html)).toBe(false);
    // Unknown declared types fall through to the default and are refused.
    expect(contentTypeMatchesMagicBytes("text/html", html)).toBe(false);
  });
});
