import { env, appBaseUrl, getAuthApiBaseUrl } from "./env.js";
import { forwardedRequestOrigin } from "./forwarded-request-url.js";
import { getRequestContext } from "./request-context.js";
import { sanitizeReturnToPath } from "./safe-return-to.js";
import { normalizeAppUrl } from "./url-utils.js";

function toOrigin(url: string): string {
  return new URL(normalizeAppUrl(url)).origin;
}

/** Browser origins allowed for CORS + Better Auth credentialed requests. */
export function getCorsOrigins(): string[] {
  const explicit =
    env.CORS_ORIGINS?.split(",")
      .map((s) => s.trim())
      .filter(Boolean) ?? [];

  if (explicit.length > 0) {
    const origins = new Set<string>();
    for (const item of explicit) {
      try {
        origins.add(toOrigin(item));
      } catch {
        // skip invalid URLs
      }
    }
    return [...origins];
  }

  const origins = new Set<string>([
    "https://social0.app",
    "https://www.social0.app",
    "https://dev.social0.app",
  ]);
  for (const candidate of [env.APP_URL, env.NEXT_PUBLIC_APP_URL]) {
    if (!candidate) continue;
    try {
      origins.add(toOrigin(candidate));
    } catch {
      // skip invalid URLs
    }
  }
  if (env.NODE_ENV !== "production") {
    origins.add("https://localhost:3000");
    origins.add("http://localhost:3000");
  }
  return [...origins];
}

/** Allowed frontend origins for checkout return URLs, OAuth redirects, and auth. */
export function getTrustedAppOrigins(): string[] {
  const extra =
    env.TRUSTED_APP_ORIGINS?.split(",")
      .map((s) => s.trim())
      .filter(Boolean) ?? [];

  const candidates = [
    ...extra,
    env.APP_URL,
    env.NEXT_PUBLIC_APP_URL,
    ...getCorsOrigins(),
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

/** Platform OAuth redirect_uri — API host on split deploys (not SPA referer). */
export function getConnectCallbackBaseUrl(): string {
  return normalizeAppUrl(getAuthApiBaseUrl());
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

/** Absolute frontend URL after account picker POST (split deploy: JSON, not HTTP redirect). */
export function connectSelectSuccessUrl(
  success: string,
  returnTo?: string | null,
  request?: Request,
): string {
  const safe = sanitizeReturnToPath(returnTo) ?? "/dashboard/connections";
  const sep = safe.includes("?") ? "&" : "?";
  return appUrlForPath(`${safe}${sep}success=${success}`, request);
}
