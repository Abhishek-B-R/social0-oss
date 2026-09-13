/**
 * TikTok's token payload shape, shared because token refresh runs in the
 * background worker as well as the API — the worker had its own inline copy
 * of this parser.
 */
export type TikTokOAuthTokens = {
  access_token: string;
  refresh_token: string | null;
  expires_in: number;
  open_id: string | null;
  scope: string | null;
};

/** Normalize TikTok token endpoint JSON (nested under `data` or flat). */
export function parseTikTokTokenResponse(
  raw: unknown,
): TikTokOAuthTokens | null {
  if (!raw || typeof raw !== "object") return null;
  const root = raw as Record<string, unknown>;
  const data = (root.data ?? root) as Record<string, unknown>;
  const accessToken =
    typeof data.access_token === "string" ? data.access_token.trim() : "";
  if (!accessToken) return null;

  return {
    access_token: accessToken,
    refresh_token:
      typeof data.refresh_token === "string" ? data.refresh_token : null,
    expires_in:
      typeof data.expires_in === "number" && data.expires_in > 0
        ? data.expires_in
        : 86400,
    open_id:
      typeof data.open_id === "string" && data.open_id.trim()
        ? data.open_id.trim()
        : null,
    scope: typeof data.scope === "string" ? data.scope : null,
  };
}

/** True when the access token includes user.info.basic (required for profile fetch). */
