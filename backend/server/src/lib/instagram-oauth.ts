/**
 * Instagram Login (Business Login) OAuth helpers.
 * Meta now often returns payloads wrapped as `{ data: [ { ... } ] }` instead of a flat object.
 */

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JsonObject;
}

/** Unwrap `{ data: [row] }` while keeping top-level fields (expires_in, etc.). */
export function unwrapInstagramDataPayload(raw: unknown): JsonObject {
  const obj = asObject(raw);
  if (!obj) return {};
  const data = obj.data;
  if (Array.isArray(data) && data.length > 0) {
    const row = asObject(data[0]);
    if (row) return { ...obj, ...row };
  }
  return obj;
}

export type InstagramShortLivedToken = {
  access_token: string;
  user_id: string;
  permissions?: string;
  expires_in?: number;
};

/**
 * Normalize the short-lived token response from
 * POST https://api.instagram.com/oauth/access_token
 */
export function normalizeInstagramTokenResponse(
  raw: unknown,
): InstagramShortLivedToken | null {
  const unwrapped = unwrapInstagramDataPayload(raw);
  const accessToken =
    typeof unwrapped.access_token === "string" ? unwrapped.access_token : null;
  const userIdRaw = unwrapped.user_id;
  const userId =
    typeof userIdRaw === "string" || typeof userIdRaw === "number"
      ? String(userIdRaw)
      : null;
  if (!accessToken || !userId) return null;
  const expiresIn =
    typeof unwrapped.expires_in === "number" && unwrapped.expires_in > 0
      ? unwrapped.expires_in
      : undefined;
  const permissions =
    typeof unwrapped.permissions === "string"
      ? unwrapped.permissions
      : undefined;
  return {
    access_token: accessToken,
    user_id: userId,
    ...(expiresIn != null ? { expires_in: expiresIn } : {}),
    ...(permissions != null ? { permissions } : {}),
  };
}

export type InstagramMeProfile = {
  /** Prefer Instagram professional account id (user_id); fall back to app-scoped id. */
  id: string;
  username: string | null;
  profileImageUrl: string | null;
};

/**
 * Parse GET graph.instagram.com/me (flat or `{ data: [...] }`).
 * Prefer `user_id` (IG professional id) over app-scoped `id`.
 */
export function parseInstagramMeResponse(
  raw: unknown,
): InstagramMeProfile | null {
  const row = unwrapInstagramDataPayload(raw);
  const userIdRaw = row.user_id ?? row.id;
  const id =
    typeof userIdRaw === "string" || typeof userIdRaw === "number"
      ? String(userIdRaw)
      : null;
  if (!id) return null;
  const username = typeof row.username === "string" ? row.username.trim() : "";
  const profileRaw = row.profile_picture_url;
  const profileImageUrl =
    typeof profileRaw === "string" &&
    (profileRaw.startsWith("http://") || profileRaw.startsWith("https://"))
      ? profileRaw
      : null;
  return {
    id,
    username: username || null,
    profileImageUrl,
  };
}
