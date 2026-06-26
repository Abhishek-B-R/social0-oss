import { isSafeOutboundUrl, type SafeOutboundUrlOptions } from "./ssrf-guard.js";

const MAX_REDIRECTS = 5;

export type SafeFetchOptions = RequestInit &
  SafeOutboundUrlOptions & {
    maxRedirects?: number;
  };

/**
 * Server-side fetch that blocks SSRF: validates each URL (including redirect hops)
 * and does not follow redirects automatically without re-validation.
 */
export async function safeFetch(
  urlString: string,
  options: SafeFetchOptions = {},
): Promise<Response | null> {
  const { httpsOnly, maxRedirects = MAX_REDIRECTS, ...init } = options;
  let current = urlString;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    if (!isSafeOutboundUrl(current, { httpsOnly })) return null;

    const res = await fetch(current, { ...init, redirect: "manual" });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) return null;
      current = new URL(location, current).href;
      continue;
    }

    return res;
  }

  return null;
}
