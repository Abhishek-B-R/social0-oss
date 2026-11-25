/**
 * Link preview checker: read a page's Open Graph / Twitter tags and say how
 * its card will look on each network. Pure (no DOM), so the Pages Function and
 * the tests share it.
 */
export type PreviewMeta = {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  imageAlt?: string;
  siteName?: string;
  type?: string;
  twitterCard?: string;
  twitterTitle?: string;
  twitterDescription?: string;
  twitterImage?: string;
  htmlTitle?: string;
  metaDescription?: string;
  canonical?: string;
  icon?: string;
};

const decode = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .trim();

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([a-zA-Z:_-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    out[m[1].toLowerCase()] = decode(m[3] ?? m[4] ?? m[5] ?? "");
  }
  return out;
}

function absolute(href: string | undefined, base: string): string | undefined {
  if (!href) return undefined;
  try {
    return new URL(href, base).toString();
  } catch {
    return undefined;
  }
}

/** Parse the <head> of `html` fetched from `url` (final URL after redirects). */
export function parseMeta(html: string, url: string): PreviewMeta {
  const head = html.slice(0, html.search(/<\/head>/i) > 0 ? html.search(/<\/head>/i) : 200_000);
  const meta: Record<string, string> = {};
  for (const m of head.matchAll(/<meta\b[^>]*>/gi)) {
    const a = attrs(m[0]);
    const key = (a.property ?? a.name ?? "").toLowerCase();
    if (key && a.content !== undefined && !(key in meta)) meta[key] = a.content;
  }
  const links = [...head.matchAll(/<link\b[^>]*>/gi)].map((m) => attrs(m[0]));
  const rel = (r: string) => links.find((l) => (l.rel ?? "").toLowerCase().split(/\s+/).includes(r))?.href;
  const title = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  return {
    url,
    title: meta["og:title"],
    description: meta["og:description"],
    image: absolute(meta["og:image"] ?? meta["og:image:url"] ?? meta["og:image:secure_url"], url),
    imageAlt: meta["og:image:alt"],
    siteName: meta["og:site_name"],
    type: meta["og:type"],
    twitterCard: meta["twitter:card"],
    twitterTitle: meta["twitter:title"],
    twitterDescription: meta["twitter:description"],
    twitterImage: absolute(meta["twitter:image"] ?? meta["twitter:image:src"], url),
    htmlTitle: title ? decode(title) : undefined,
    metaDescription: meta["description"],
    canonical: absolute(rel("canonical"), url),
    icon: absolute(rel("icon") ?? rel("shortcut") ?? rel("apple-touch-icon"), url) ?? absolute("/favicon.ico", url),
  };
}

export type Check = { level: "ok" | "warn" | "error"; text: string };
export type ImageInfo = { ok: boolean; width?: number; height?: number; bytes?: number; type?: string } | null;

/** What a network shows: falls back the way the networks do. */
export const cardTitle = (m: PreviewMeta) => m.title ?? m.twitterTitle ?? m.htmlTitle ?? new URL(m.url).hostname;
export const cardDescription = (m: PreviewMeta) => m.description ?? m.twitterDescription ?? m.metaDescription;
export const cardImage = (m: PreviewMeta, network: "x" | "other" = "other") =>
  network === "x" ? (m.twitterImage ?? m.image) : (m.image ?? m.twitterImage);

export function checkPreview(m: PreviewMeta, img: ImageInfo): Check[] {
  const c: Check[] = [];
  const title = m.title ?? m.twitterTitle;
  if (!title) c.push({ level: "error", text: "No og:title. Networks fall back to the page <title>, or just the domain." });
  else if (title.length > 60) c.push({ level: "warn", text: `Title is ${title.length} characters; most cards cut it around 60.` });
  else c.push({ level: "ok", text: `Title set (${title.length} characters).` });

  const desc = m.description ?? m.twitterDescription;
  if (!desc) c.push({ level: "warn", text: "No og:description. Facebook and LinkedIn show less context without it." });
  else if (desc.length > 160) c.push({ level: "warn", text: `Description is ${desc.length} characters; cards show about the first 160.` });
  else c.push({ level: "ok", text: "Description set." });

  const image = m.image ?? m.twitterImage;
  if (!image) c.push({ level: "error", text: "No og:image. The link shows as a plain text card with no picture." });
  else if (!image.startsWith("https://")) c.push({ level: "warn", text: "og:image is not HTTPS; some networks won't load it." });
  if (image && img) {
    if (!img.ok) c.push({ level: "error", text: "The og:image URL doesn't load (error or not an image)." });
    else {
      if (img.width && img.height) {
        const ratio = img.width / img.height;
        if (img.width < 600) c.push({ level: "warn", text: `Image is ${img.width} x ${img.height}; under 600 px wide shows as a small thumbnail. Use 1200 x 630.` });
        else if (Math.abs(ratio - 1.91) > 0.25) c.push({ level: "warn", text: `Image is ${img.width} x ${img.height} (${ratio.toFixed(2)}:1); large cards are 1.91:1, so it gets cropped. Use 1200 x 630.` });
        else c.push({ level: "ok", text: `Image ${img.width} x ${img.height}, a good card shape.` });
      }
      if (img.bytes && img.bytes > 5_000_000) c.push({ level: "warn", text: `Image is ${(img.bytes / 1e6).toFixed(1)} MB; X skips images over 5 MB.` });
    }
  }
  if (!m.twitterCard) c.push({ level: "warn", text: "No twitter:card. X shows a small card; add summary_large_image for the big one." });
  else c.push({ level: "ok", text: `twitter:card is ${m.twitterCard}.` });
  if (!m.imageAlt && image) c.push({ level: "warn", text: "No og:image:alt, so screen readers get no description of the image." });
  if (m.canonical && m.canonical.replace(/\/$/, "") !== m.url.replace(/\/$/, "")) c.push({ level: "warn", text: `Canonical points to ${m.canonical}; networks may use that URL instead.` });
  return c;
}

/** Block URLs a public fetcher must never call (SSRF): non-http(s), odd ports, local and private hosts. */
export function unsafeUrl(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return "That isn't a valid URL.";
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return "Only http and https links can be checked.";
  if (u.port && u.port !== "80" && u.port !== "443") return "Only standard ports (80 and 443) can be checked.";
  if (u.username || u.password) return "Links with a username or password can't be checked.";
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return "Local addresses can't be checked.";
  if (!h.includes(".") && !h.includes(":")) return "That doesn't look like a web address. Try something like example.com/page.";
  const v4 = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224) return "Private addresses can't be checked.";
  }
  if (h.includes(":")) return "IP addresses can't be checked; use a domain name.";
  return null;
}

/** Width/height from the first bytes of a PNG, GIF, JPEG or WebP; null when unknown. */
export function imageSize(b: Uint8Array): { width: number; height: number } | null {
  const u16 = (i: number) => (b[i] << 8) | b[i + 1];
  const u16le = (i: number) => b[i] | (b[i + 1] << 8);
  const u32 = (i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
  if (b[0] === 0x89 && b[1] === 0x50 && b.length >= 24) return { width: u32(16), height: u32(20) };
  if (b[0] === 0x47 && b[1] === 0x49 && b.length >= 10) return { width: u16le(6), height: u16le(8) };
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null;
      const marker = b[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { width: u16(i + 7), height: u16(i + 5) };
      i += 2 + u16(i + 2);
    }
    return null;
  }
  if (b.length >= 30 && String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP") {
    const kind = String.fromCharCode(...b.slice(12, 16));
    if (kind === "VP8X") return { width: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), height: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) };
    if (kind === "VP8 ") return { width: u16le(26) & 0x3fff, height: u16le(28) & 0x3fff };
    if (kind === "VP8L") {
      const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
  }
  return null;
}
