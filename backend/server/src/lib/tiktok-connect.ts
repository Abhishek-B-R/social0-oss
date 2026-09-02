/**
 * TikTok OAuth connect helpers.
 * Scopes: user.info.basic, video.upload, video.publish, video.list, user.info.stats.
 */

const OPEN_ID_RE = /^[a-f0-9-]{20,}$/i;

export function isLikelyTikTokOpenId(id: string): boolean {
  const t = id.trim();
  if (!t || t.startsWith("tiktok-") || t.startsWith("unknown-")) return false;
  return OPEN_ID_RE.test(t);
}

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
export function tiktokTokenHasBasicScope(scope: string | null): boolean {
  if (!scope) return true;
  return scope
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .includes("user.info.basic");
}

export type TikTokConnectProfile = {
  id: string;
  /** @handle when available; otherwise display name (may not be a valid handle). */
  username: string | null;
  /** Canonical https://www.tiktok.com/@handle when username is a real handle. */
  profileUrl: string | null;
  profileImageUrl: string | null;
};

type TikTokUserInfoBody = {
  data?: {
    user?: {
      open_id?: string;
      avatar_url?: string;
      avatar_large_url?: string;
      display_name?: string;
      username?: string;
      profile_deep_link?: string;
    };
  };
  error?: { code?: string; message?: string; log_id?: string };
};

function parseAvatarUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const u = raw.trim();
  return u.startsWith("http://") || u.startsWith("https://") ? u : null;
}

function isLikelyHandle(value: string): boolean {
  const handle = value.replace(/^@/, "").trim();
  return handle.length > 0 && !/\s/.test(handle) && /^[a-zA-Z0-9._]+$/.test(handle);
}

/**
 * Fetch profile via user.info fields. Prefer real `username` (+ profile_deep_link)
 * when user.info.profile is granted; fall back to display_name + avatar.
 */
export async function fetchTikTokConnectProfile(
  accessToken: string,
): Promise<TikTokConnectProfile | null> {
  const fieldSets = [
    "open_id,avatar_large_url,avatar_url,display_name,username,profile_deep_link",
    "open_id,avatar_url,display_name,username",
    "open_id,avatar_large_url,avatar_url,display_name",
    "open_id,avatar_url,display_name",
    "open_id",
  ] as const;

  for (const fields of fieldSets) {
    try {
      const response = await fetch(
        `https://open.tiktokapis.com/v2/user/info/?fields=${encodeURIComponent(fields)}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json; charset=UTF-8",
          },
        },
      );

      const body = (await response
        .json()
        .catch(() => ({}))) as TikTokUserInfoBody;
      const errCode = body.error?.code;
      if (errCode && errCode !== "ok") {
        console.error("[TikTok] userinfo error:", {
          httpStatus: response.status,
          code: errCode,
          message: body.error?.message,
          log_id: body.error?.log_id,
          fields,
        });
        continue;
      }

      const user = body.data?.user;
      const openId =
        typeof user?.open_id === "string" ? user.open_id.trim() : "";
      if (!openId) continue;

      const apiUsername =
        typeof user?.username === "string" ? user.username.trim() : "";
      const displayName =
        typeof user?.display_name === "string"
          ? user.display_name.trim() || null
          : null;
      const deepLink =
        typeof user?.profile_deep_link === "string"
          ? user.profile_deep_link.trim()
          : "";

      const handle = apiUsername && isLikelyHandle(apiUsername) ? apiUsername : null;
      const profileUrl = handle
        ? `https://www.tiktok.com/@${encodeURIComponent(handle)}`
        : deepLink && /^https:\/\//i.test(deepLink)
          ? deepLink
          : null;

      return {
        id: openId,
        // Prefer real @handle for platformUsername so View links work.
        username: handle ?? displayName,
        profileUrl,
        profileImageUrl:
          parseAvatarUrl(user?.avatar_large_url) ??
          parseAvatarUrl(user?.avatar_url),
      };
    } catch (err) {
      console.error("[TikTok] userinfo request failed:", err);
    }
  }

  return null;
}

/** Resolve profile for DB save after token exchange. */
export async function resolveTikTokConnectUser(
  tokens: TikTokOAuthTokens,
): Promise<
  | { ok: true; profile: TikTokConnectProfile }
  | { ok: false; reason: "missing_basic_scope" | "profile_fetch_failed" }
> {
  if (!tiktokTokenHasBasicScope(tokens.scope)) {
    console.error(
      "[TikTok] token missing user.info.basic scope:",
      tokens.scope,
    );
    return { ok: false, reason: "missing_basic_scope" };
  }

  const profile = await fetchTikTokConnectProfile(tokens.access_token);
  if (profile) {
    return { ok: true, profile };
  }

  if (tokens.open_id && isLikelyTikTokOpenId(tokens.open_id)) {
    return {
      ok: true,
      profile: {
        id: tokens.open_id,
        username: null,
        profileUrl: null,
        profileImageUrl: null,
      },
    };
  }

  return { ok: false, reason: "profile_fetch_failed" };
}
