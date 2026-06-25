import { env } from "./env";
import { normalizeAppUrl } from "./url-utils";

function toOrigin(url: string): string {
  return new URL(normalizeAppUrl(url)).origin;
}

export function getTrustedAppOrigins(): string[] {
  const extra =
    process.env.TRUSTED_APP_ORIGINS?.split(",")
      .map((s) => s.trim())
      .filter(Boolean) ?? [];

  const candidates = [
    ...extra,
    env.BETTER_AUTH_URL,
    process.env.APP_URL,
    env.NEXT_PUBLIC_APP_URL,
  ].filter((v): v is string => Boolean(v));

  const origins = new Set<string>();
  for (const candidate of candidates) {
    try {
      origins.add(toOrigin(candidate));
    } catch {
      // skip invalid URLs
    }
  }
  return [...origins];
}

export function resolveAppUrlFromRequest(request?: Request): string {
  const trusted = getTrustedAppOrigins();
  const candidates: string[] = [];

  if (request) {
    const origin = request.headers.get("origin");
    if (origin) candidates.push(origin);

    const referer = request.headers.get("referer");
    if (referer) {
      try {
        candidates.push(new URL(referer).origin);
      } catch {
        // ignore invalid referer
      }
    }
  }

  for (const candidate of candidates) {
    try {
      const origin = toOrigin(candidate);
      if (trusted.includes(origin)) return normalizeAppUrl(origin);
    } catch {
      // ignore invalid candidate
    }
  }

  return normalizeAppUrl(env.BETTER_AUTH_URL ?? env.NEXT_PUBLIC_APP_URL);
}
