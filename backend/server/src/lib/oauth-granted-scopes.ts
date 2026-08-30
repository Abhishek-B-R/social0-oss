/** Persist the scopes the user actually granted so analytics/inbox can stop nagging reconnect. */

import { PLATFORM_OAUTH_CONFIG, type Platform } from "./platforms.js";

export function scopeStringFromToken(tokens: {
  scope?: unknown;
} | null | undefined): string | null {
  const raw = tokens?.scope;
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  if (Array.isArray(raw)) {
    const parts = raw.filter((s): s is string => typeof s === "string" && s.trim() !== "");
    return parts.length ? parts.join(",") : null;
  }
  return null;
}

/**
 * TikTok echoes the granted subset on the token. Other providers often omit `scope`;
 * after a successful consent we store the scopes we requested.
 */
export function grantedScopesForConnect(
  platform: Platform,
  tokens?: { scope?: unknown } | null,
): string | null {
  const fromToken = scopeStringFromToken(tokens);
  if (fromToken) return fromToken;
  return PLATFORM_OAUTH_CONFIG[platform]?.scope ?? null;
}
