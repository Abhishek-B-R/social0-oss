import { auth } from "./auth.js";
import { getRequestContext } from "./request-context.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * The JWE `session_data` cookie lets Better Auth answer getSession without
 * Postgres for up to `cookieCache.maxAge`. A revoked session (password reset,
 * "Sign out all devices", account deletion) therefore keeps working until the
 * cache expires. Reads may ride the cache; anything that changes state (mint
 * an API key, add a webhook, approve MCP, any RPC) must see a live session row.
 */
export function sessionReadMustBypassCookieCache(
  method: string | undefined,
): boolean {
  return !SAFE_METHODS.has((method ?? "GET").toUpperCase());
}

export async function getSessionFromRequest(request: {
  headers: Record<string, unknown>;
  method?: string;
}) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v);
    } else {
      headers.set(key, String(value));
    }
  }
  if (sessionReadMustBypassCookieCache(request.method)) {
    return auth.api.getSession({
      headers,
      query: { disableCookieCache: true },
    });
  }
  return auth.api.getSession({ headers });
}

/**
 * Session for a handler running inside `runRouteHandler` (REST routes under
 * handlers/**, connect/**). Same cookie-cache rule as the auth middleware:
 * POST/PUT/PATCH/DELETE must see a live session row, so a revoked session
 * cannot keep writing while its `session_data` cache is still valid.
 */
export async function getRouteSession() {
  return getSessionFromRequest(getRequestContext().req);
}
