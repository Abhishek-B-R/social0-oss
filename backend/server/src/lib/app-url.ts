import { env, appBaseUrl } from "./env.js";
import { forwardedRequestOrigin } from "./forwarded-request-url.js";
import { getRequestContext } from "./request-context.js";
import { sanitizeReturnToPath } from "./safe-return-to.js";
import { normalizeAppUrl } from "./url-utils.js";

function toOrigin(url: string): string {
  return new URL(normalizeAppUrl(url)).origin;
}

/** Allowed frontend origins for checkout return URLs, OAuth redirects, and auth. */
export function getTrustedAppOrigins(): string[] {
  const extra =
    env.TRUSTED_APP_ORIGINS?.split(",")
      .map((s) => s.trim())
      .filter(Boolean) ?? [];

  const candidates = [
    ...extra,
    env.BETTER_AUTH_URL,
    env.APP_URL,
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

function pickTrustedOrigin(
  candidate: string,
  trusted: string[],
): string | null {
  try {
    const origin = toOrigin(candidate);
    if (trusted.includes(origin)) return origin;
  } catch {
    // ignore invalid candidate
  }
  return null;
}

function requestOriginCandidates(request?: Request): string[] {
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

  try {
    const { req } = getRequestContext();
    candidates.push(forwardedRequestOrigin(req));
  } catch {
    // no Fastify request context (e.g. background jobs)
  }

  return candidates;
}

/** Resolve the app base URL from the incoming request, falling back to env. */
export function resolveAppUrlFromRequest(request?: Request): string {
  const trusted = getTrustedAppOrigins();

  for (const candidate of requestOriginCandidates(request)) {
    const match = pickTrustedOrigin(candidate, trusted);
    if (match) return normalizeAppUrl(match);
  }

  return normalizeAppUrl(appBaseUrl());
}

/** Absolute frontend URL for a safe in-app path (OAuth / dashboard redirects). */
export function appUrlForPath(path: unknown, request?: Request): string {
  const safe =
    sanitizeReturnToPath(path) ??
    sanitizeReturnToPath("/dashboard") ??
    "/dashboard";
  const base = resolveAppUrlFromRequest(request);
  return new URL(safe, `${base}/`).toString();
}
