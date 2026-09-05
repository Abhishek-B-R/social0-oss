/**
 * Classify "the token itself is dead" failures from platform APIs.
 *
 * A revoked or expired OAuth token comes back as a raw 401 (X: "Request
 * failed with code 401", Google: "Invalid Credentials"). Without this, that
 * surfaced as a generic fetch error that scripts and the dashboard treated
 * as a transient blip and retried forever. Mapping it to `scope_missing`
 * with a marker "scope" routes it through the existing reconnect path
 * (chip badge, banner, CLI/MCP "Reconnect needed") the same way a missing
 * OAuth scope does.
 */

/**
 * Marker placed in `missingScopes` when the token is expired or revoked
 * rather than short one scope. Consumers only check `missingScopes.length`;
 * the value is here so an API client can tell the two cases apart.
 */
export const TOKEN_EXPIRED_MARKER = "token_expired";

const AUTH_MESSAGE_RE =
  /\b401\b|unauthori[sz]ed|invalid or expired token|invalid credentials|could not authenticate|token (?:has )?expired|invalid_token|invalid access token|authentication (?:credentials|failed)|not authenticated/i;

/** X API v1.1/v2 error codes that mean the user token is no longer valid. */
const X_AUTH_ERROR_CODES = new Set([32, 89, 215]);

function statusOf(e: unknown): number | undefined {
  if (!e || typeof e !== "object") return undefined;
  const o = e as Record<string, unknown>;
  if (typeof o.code === "number" && o.code >= 100 && o.code < 600) return o.code;
  if (typeof o.status === "number") return o.status;
  const r = o.response as { status?: number } | undefined;
  if (typeof r?.status === "number") return r.status;
  return undefined;
}

function xErrorCodes(e: unknown): number[] {
  if (!e || typeof e !== "object") return [];
  const o = e as { data?: { errors?: Array<{ code?: unknown }> }; errors?: Array<{ code?: unknown }> };
  const list = o.data?.errors ?? o.errors ?? [];
  return list
    .map((x) => x?.code)
    .filter((c): c is number => typeof c === "number");
}

/**
 * True when the failure means the stored token no longer authenticates.
 * Accepts a thrown error, a `{ status }`-shaped response, or a plain message.
 */
export function isPlatformAuthError(e: unknown, status?: number): boolean {
  const code = status ?? statusOf(e);
  if (code === 401) return true;
  if (xErrorCodes(e).some((c) => X_AUTH_ERROR_CODES.has(c))) return true;
  const message =
    typeof e === "string" ? e : e instanceof Error ? e.message : "";
  return AUTH_MESSAGE_RE.test(message);
}

/** Copy shown next to the reconnect hint for an expired token. */
export function expiredTokenMessage(platformLabel: string): string {
  return `${platformLabel} session expired or was revoked - reconnect the account.`;
}
