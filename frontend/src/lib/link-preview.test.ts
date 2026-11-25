import { describe, expect, it } from "vitest";
import { checkPreview, parseMeta, unsafeUrl } from "./link-preview";

const html = `<html><head>
<title>Fallback &amp; title</title>
<meta content="Social0 &#39;tools&#39;" property="og:title">
<meta property="og:description" content="Free tools">
<meta property='og:image' content='/og.png'>
<meta name="twitter:card" content="summary_large_image">
<meta name="description" content="meta desc">
<link rel="canonical" href="https://social0.app/free-tools">
<link rel="icon" href="/favicon.svg">
</head><body><meta property="og:title" content="ignored"></body></html>`;

describe("parseMeta", () => {
  const m = parseMeta(html, "https://social0.app/free-tools");
  it("reads OG and Twitter tags in any attribute order and decodes entities", () => {
    expect(m.title).toBe("Social0 'tools'");
    expect(m.htmlTitle).toBe("Fallback & title");
    expect(m.twitterCard).toBe("summary_large_image");
  });
  it("makes image, canonical and icon URLs absolute", () => {
    expect(m.image).toBe("https://social0.app/og.png");
    expect(m.icon).toBe("https://social0.app/favicon.svg");
    expect(m.canonical).toBe("https://social0.app/free-tools");
  });
});

describe("checkPreview", () => {
  it("flags a missing image as an error", () => {
    const c = checkPreview({ url: "https://a.com", title: "x" }, null);
    expect(c.some((x) => x.level === "error" && x.text.includes("og:image"))).toBe(true);
  });
  it("warns about a square image and passes a 1200x630 one", () => {
    const m = { url: "https://a.com", title: "t", description: "d", image: "https://a.com/i.png", twitterCard: "summary_large_image", imageAlt: "a" };
    expect(checkPreview(m, { ok: true, width: 800, height: 800 }).some((x) => x.text.includes("1.91:1"))).toBe(true);
    expect(checkPreview(m, { ok: true, width: 1200, height: 630 }).every((x) => x.level === "ok")).toBe(true);
  });
});

describe("unsafeUrl", () => {
  it("allows public https sites", () => {
    expect(unsafeUrl("https://social0.app/pricing")).toBeNull();
  });
  it("blocks local, private, odd ports and other schemes", () => {
    for (const u of ["http://localhost:3000", "http://127.0.0.1", "https://10.0.0.5/x", "https://192.168.1.1", "http://169.254.169.254/latest", "https://a.com:8443", "file:///etc/passwd", "https://intranet", "http://[::1]/", "https://user:pw@a.com"]) {
      expect(unsafeUrl(u)).not.toBeNull();
    }
  });
});

import { imageSize } from "./link-preview";
describe("imageSize", () => {
  it("reads PNG, GIF and JPEG headers", () => {
    const png = new Uint8Array(24); png.set([0x89, 0x50, 0x4e, 0x47]); png.set([0, 0, 4, 0xb0], 16); png.set([0, 0, 2, 0x76], 20);
    expect(imageSize(png)).toEqual({ width: 1200, height: 630 });
    const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x20, 0x03, 0x58, 0x02]);
    expect(imageSize(gif)).toEqual({ width: 800, height: 600 });
    const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0, 0, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0x76, 0x04, 0xb0, 0x03]);
    expect(imageSize(jpg)).toEqual({ width: 1200, height: 630 });
  });
  it("returns null for unknown data", () => {
    expect(imageSize(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});
