/**
 * GET /tools-api/link-preview?url=… → the page's preview tags + og:image size,
 * for the free link preview checker. Guards against SSRF (scheme, port,
 * local/private hosts, every redirect re-checked), caps time and size, and
 * caches results for 10 minutes.
 */
import { imageSize, parseMeta, unsafeUrl } from "../../src/lib/link-preview";

const UA = "Mozilla/5.0 (compatible; Social0LinkPreview/1.0; +https://social0.app/free-tools/link-preview-checker)";
const MAX_HTML = 600_000;
const MAX_IMG_PROBE = 64 * 1024;

const json = (body: unknown, status = 200, cache = 0) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": cache ? `public, max-age=${cache}` : "no-store",
      "X-Robots-Tag": "noindex",
    },
  });

/** Fetch following up to 4 redirects, re-checking every hop. */
async function safeFetch(url: string, accept: string, extra: Record<string, string> = {}): Promise<{ res: Response; finalUrl: string }> {
  let current = url;
  for (let hop = 0; hop < 5; hop++) {
    const bad = unsafeUrl(current);
    if (bad) throw new Error(bad);
    const res = await fetch(current, {
      redirect: "manual",
      headers: { "User-Agent": UA, Accept: accept, ...extra },
      signal: AbortSignal.timeout(8000),
    });
    const loc = res.headers.get("Location");
    if (res.status >= 300 && res.status < 400 && loc) {
      current = new URL(loc, current).toString();
      continue;
    }
    return { res, finalUrl: current };
  }
  throw new Error("Too many redirects.");
}

async function readCapped(res: Response, max: number): Promise<Uint8Array> {
  const reader = res.body?.getReader();
  if (!reader) return new Uint8Array();
  const parts: Uint8Array[] = [];
  let size = 0;
  while (size < max) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    parts.push(value);
    size += value.length;
  }
  await reader.cancel().catch(() => undefined);
  const out = new Uint8Array(Math.min(size, max));
  let o = 0;
  for (const p of parts) {
    const take = Math.min(p.length, out.length - o);
    out.set(p.subarray(0, take), o);
    o += take;
    if (o >= out.length) break;
  }
  return out;
}

export const onRequestGet = async ({ request }: { request: Request }) => {
  const raw = new URL(request.url).searchParams.get("url")?.trim() ?? "";
  if (!raw) return json({ error: "Add a link to check." }, 400);
  const target = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  const bad = unsafeUrl(target);
  if (bad) return json({ error: bad }, 400);

  const cache = (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request(`https://social0.app/tools-api/link-preview?url=${encodeURIComponent(target)}`);
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  try {
    const { res, finalUrl } = await safeFetch(target, "text/html,application/xhtml+xml");
    if (!res.ok) return json({ error: `The page answered ${res.status}. Networks can't build a card from it either.` }, 200);
    const type = res.headers.get("Content-Type") ?? "";
    if (!/html/i.test(type)) return json({ error: `That link is ${type || "not a web page"}, not a web page.` }, 200);
    const html = new TextDecoder().decode(await readCapped(res, MAX_HTML));
    const meta = parseMeta(html, finalUrl);

    let image: { ok: boolean; width?: number; height?: number; bytes?: number; type?: string } | null = null;
    const imgUrl = meta.image ?? meta.twitterImage;
    if (imgUrl && !unsafeUrl(imgUrl)) {
      try {
        const { res: ir } = await safeFetch(imgUrl, "image/*", { Range: `bytes=0-${MAX_IMG_PROBE - 1}` });
        const itype = ir.headers.get("Content-Type") ?? "";
        const total = ir.headers.get("Content-Range")?.split("/")[1] ?? ir.headers.get("Content-Length");
        const bytes = await readCapped(ir, MAX_IMG_PROBE);
        image = { ok: ir.ok && itype.startsWith("image/"), type: itype, bytes: total ? Number(total) || undefined : undefined, ...(imageSize(bytes) ?? {}) };
      } catch {
        image = { ok: false };
      }
    }
    const out = json({ meta, image }, 200, 600);
    await cache.put(cacheKey, out.clone());
    return out;
  } catch (e) {
    const msg = e instanceof Error && e.name === "TimeoutError" ? "The page took too long to answer." : e instanceof Error ? e.message : "Couldn't fetch that page.";
    return json({ error: msg }, 200);
  }
};
