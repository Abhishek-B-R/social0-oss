import type { Platform } from "./platforms.js";
import { isLikelyTikTokOpenId } from "./tiktok-connect.js";

/**
 * Reconnect ("Reconnect" on an existing account) picks the row by its id, not
 * by the identity the provider hands back. If the user picks a different
 * account at the provider (Google's account chooser, a second X login in the
 * browser), writing those tokens onto the row would make every scheduled post
 * for account A publish as account B. This decides whether the returned
 * identity is the one the row belongs to.
 *
 * - `same`: the returned identity is the stored one. Update the row.
 * - `stored_unknown`: the row has no comparable id (legacy/synthetic id, or a
 *   YouTube row keyed by a Google account id from before channel ids). Nothing
 *   to compare against, so the update proceeds as it always has.
 * - `different`: a different account came back. Do not touch the row.
 * - `returned_unknown`: the provider profile lookup failed, so we cannot tell
 *   whose tokens these are. Do not touch the row.
 */
export type ReauthIdentityVerdict =
  | "same"
  | "stored_unknown"
  | "different"
  | "returned_unknown";

/** YouTube channel ids: `UC` + 22 base64url chars. */
const YOUTUBE_CHANNEL_ID_RE = /^UC[A-Za-z0-9_-]{22}$/;

/**
 * The callback falls back to `${platform}-${Date.now()}` / `unknown-${Date.now()}`
 * when the provider profile lookup fails. Those name nobody.
 */
export function isSyntheticPlatformUserId(
  platform: Platform,
  id: string | null | undefined,
): boolean {
  const t = id?.trim() ?? "";
  if (!t) return true;
  return t.startsWith(`${platform}-`) || t.startsWith("unknown-");
}

export function checkReauthIdentity(input: {
  platform: Platform;
  storedPlatformUserId: string | null | undefined;
  returnedPlatformUserId: string | null | undefined;
  /** Other ids the provider returned for the same account (e.g. Instagram app-scoped id). */
  returnedAliasIds?: readonly (string | null | undefined)[];
}): ReauthIdentityVerdict {
  const { platform } = input;
  const stored = input.storedPlatformUserId?.trim() ?? "";
  const returned = input.returnedPlatformUserId?.trim() ?? "";

  if (isSyntheticPlatformUserId(platform, stored)) return "stored_unknown";
  if (platform === "tiktok" && !isLikelyTikTokOpenId(stored)) {
    return "stored_unknown";
  }
  // Pre-channel-id rows hold the Google account id; the callback upgrades them.
  if (platform === "youtube" && !YOUTUBE_CHANNEL_ID_RE.test(stored)) {
    return "stored_unknown";
  }

  if (isSyntheticPlatformUserId(platform, returned)) return "returned_unknown";
  // A channel row reconnected with a Google account id: the chosen Google
  // account has no channel we could read, so it cannot be this channel.
  if (platform === "youtube" && !YOUTUBE_CHANNEL_ID_RE.test(returned)) {
    return "returned_unknown";
  }

  const candidates = new Set<string>([returned]);
  for (const alias of input.returnedAliasIds ?? []) {
    const a = alias?.trim();
    if (a) candidates.add(a);
  }
  return candidates.has(stored) ? "same" : "different";
}

export function reauthIdentityAllowsUpdate(
  verdict: ReauthIdentityVerdict,
): boolean {
  return verdict === "same" || verdict === "stored_unknown";
}

/** Where a refused reconnect lands; the SPA maps `error` to copy. */
export function reauthRefusedPath(
  platform: Platform,
  verdict: ReauthIdentityVerdict,
): string {
  const error =
    verdict === "different" ? "reauth_account_mismatch" : "reauth_profile_failed";
  return `/dashboard/connections?error=${error}&platform=${platform}`;
}
