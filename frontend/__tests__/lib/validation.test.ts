import {
  isValidUUID,
  sanitizeFilename,
  validateFileContent,
  constantTimeEquals,
} from "@/lib/validation";

describe("isValidUUID", () => {
  it("accepts valid RFC 4122 UUID", () => {
    expect(isValidUUID("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    expect(isValidUUID("6ba7b810-9dad-11d1-80b4-00c04fd430c8")).toBe(true);
  });

  it("rejects invalid formats", () => {
    expect(isValidUUID("not-a-uuid")).toBe(false);
    expect(isValidUUID("")).toBe(false);
    expect(isValidUUID("550e8400-e29b-41d4-a716")).toBe(false);
  });
});

describe("sanitizeFilename", () => {
  it("strips path components", () => {
    expect(sanitizeFilename("/foo/bar/baz.txt")).toBe("baz.txt");
  });

  it("removes null bytes and control chars", () => {
    expect(sanitizeFilename("a\x00b\x1fc")).not.toMatch(/[\x00-\x1f]/);
  });

  it("limits length to 255", () => {
    const long = "a".repeat(300);
    expect(sanitizeFilename(long).length).toBe(255);
  });
});

describe("validateFileContent", () => {
  it("validates JPEG magic bytes", async () => {
    const jpegStart = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x00]);
    expect(await validateFileContent(jpegStart, "image/jpeg")).toBe(true);
  });

  it("rejects wrong content for declared type", async () => {
    const wrong = Buffer.from([0x00, 0x00, 0x00, 0x00]);
    expect(await validateFileContent(wrong, "image/jpeg")).toBe(false);
  });

  it("allows unknown MIME type (returns true)", async () => {
    const any = Buffer.from([0x01, 0x02, 0x03]);
    expect(await validateFileContent(any, "application/octet-stream")).toBe(true);
  });
});

describe("constantTimeEquals", () => {
  it("returns true for equal strings", () => {
    expect(constantTimeEquals("secret", "secret")).toBe(true);
  });

  it("returns false for different length", () => {
    expect(constantTimeEquals("a", "ab")).toBe(false);
  });

  it("returns false for different same-length strings", () => {
    expect(constantTimeEquals("secret", "secreT")).toBe(false);
  });
});
