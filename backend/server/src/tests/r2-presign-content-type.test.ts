import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getPresignedUploadUrl } from "../lib/r2.js";

const R2_ENV = {
  R2_ENDPOINT: "https://account.r2.cloudflarestorage.com",
  R2_ACCESS_KEY_ID: "test-access-key",
  R2_SECRET_ACCESS_KEY: "test-secret-key",
  R2_BUCKET_NAME: "media",
  R2_PUBLIC_URL: "https://media.example.com",
} as const;

/**
 * The presigner drops Content-Type from the signature unless told otherwise,
 * which let whoever held the URL store an "image" as text/html or SVG on the
 * public media origin. The URL has to bind the type it was issued for.
 */
describe("getPresignedUploadUrl", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const [k, v] of Object.entries(R2_ENV)) {
      saved[k] = process.env[k];
      process.env[k] = v;
    }
  });

  afterEach(() => {
    for (const k of Object.keys(R2_ENV)) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("signs Content-Type (and Content-Length) into the PUT URL", async () => {
    const url = new URL(
      await getPresignedUploadUrl("uploads/user-1/a.gif", "image/gif", 1234),
    );
    const signed = (url.searchParams.get("X-Amz-SignedHeaders") ?? "").split(
      ";",
    );

    expect(signed).toContain("content-type");
    expect(signed).toContain("content-length");
    expect(signed).toContain("host");
    // Signed, not hoisted into the query string: the uploader must send the
    // header itself, and it has to match.
    expect(url.searchParams.has("Content-Type")).toBe(false);
  });

  it("produces a different signature for a different Content-Type", async () => {
    const sig = async (contentType: string) =>
      new URL(
        await getPresignedUploadUrl("uploads/user-1/a.gif", contentType, 1234),
      ).searchParams.get("X-Amz-Signature");

    // Same second, same key and length: only the type differs.
    const [gif, html] = await Promise.all([sig("image/gif"), sig("text/html")]);
    expect(gif).toBeTruthy();
    expect(gif).not.toBe(html);
  });
});
