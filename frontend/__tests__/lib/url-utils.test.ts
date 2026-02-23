import { normalizeAppUrl } from "@/lib/url-utils";

describe("normalizeAppUrl", () => {
  it("forces https for non-localhost hostnames", () => {
    expect(normalizeAppUrl("http://example.com")).toBe("https://example.com");
    expect(normalizeAppUrl("http://myapp.vercel.app")).toBe(
      "https://myapp.vercel.app",
    );
  });

  it("preserves protocol for localhost", () => {
    expect(normalizeAppUrl("http://localhost:3000")).toBe(
      "http://localhost:3000",
    );
    expect(normalizeAppUrl("https://localhost:3000")).toBe(
      "https://localhost:3000",
    );
  });

  it("preserves protocol for 127.0.0.1", () => {
    expect(normalizeAppUrl("http://127.0.0.1:3000")).toBe(
      "http://127.0.0.1:3000",
    );
  });

  it("removes trailing slash", () => {
    expect(normalizeAppUrl("https://example.com/")).toBe(
      "https://example.com",
    );
    expect(normalizeAppUrl("https://example.com/path/")).toBe(
      "https://example.com/path",
    );
  });
});
