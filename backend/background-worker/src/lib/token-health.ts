/**
 * Lightweight token health check: cheapest API call per platform to validate "am I authenticated?".
 * Used by cron and on-demand when user opens Connections page.
 * For refreshable platforms near expiry (or after 401), attempts silent refresh first.
 */

import { db } from "../db/index.js";
import { connectedAccounts } from "../db/schema.js";
import { and, eq, or, lt, isNull, inArray } from "drizzle-orm";
import { decryptToken } from "@social0/shared";
import OAuth from "oauth-1.0a";
import crypto from "crypto";

const STRICT_RATE_LIMIT_PLATFORMS = new Set(["twitter_x", "instagram"]);
const BATCH_SIZE = 5;
const DELAY_MS = 200;

/** BYOK / static credentials: never run health check, never mark expired. */
export const BYOK_PLATFORMS = new Set(["bluesky"]);

/** Only run token health checks for platforms where tokens can actually expire. */
const PLATFORMS_WITH_EXPIRING_TOKENS = new Set([
  "linkedin",
  "instagram",
  "facebook",
  "threads",
  "youtube",
  "tiktok",
  "pinterest",
]);

/** Never show "expired" in UI for these platforms (BYOK + Twitter app passwords). */
export { NEVER_EXPIRES_PLATFORMS } from "@social0/shared";

export type AccountForHealthCheck = {
  id: string;
  platform: string;
  encryptedAccessToken: string;
  encryptedRefreshToken: string | null;
  tokenExpiresAt: Date | null;
  lastSyncedAt: Date | null;
  tokenStatus: string | null;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Cheapest validation request per platform. Returns response status (200, 401, 403, or other). */
async function verifyToken(
  platform: string,
  accessToken: string,
  accessSecret: string | null,
): Promise<number> {
  switch (platform) {
    case "linkedin": {
      const r = await fetch("https://api.linkedin.com/v2/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      return r.status;
    }
    case "twitter_x": {
      if (!accessSecret) {
        const r = await fetch(
          "https://api.twitter.com/1.1/account/verify_credentials.json?skip_status=true",
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        return r.status;
      }
      const consumerKey = process.env.TWITTER_CONSUMER_KEY;
      const consumerSecret = process.env.TWITTER_CONSUMER_SECRET;
      if (!consumerKey || !consumerSecret) return 500;
      const oauth = new OAuth({
        consumer: { key: consumerKey, secret: consumerSecret },
        signature_method: "HMAC-SHA1",
        hash_function(base: string, key: string) {
          return crypto.createHmac("sha1", key).update(base).digest("base64");
        },
      });
      const url =
        "https://api.twitter.com/1.1/account/verify_credentials.json?skip_status=true";
      const authHeader = oauth.toHeader(
        oauth.authorize(
          { url, method: "GET" },
          { key: accessToken, secret: accessSecret },
        ),
      );
      const r = await fetch(url, {
        headers: authHeader as unknown as Record<string, string>,
      });
      return r.status;
    }
    case "instagram": {
      const r = await fetch("https://graph.instagram.com/me?fields=id", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      return r.status;
    }
    case "facebook": {
      const r = await fetch("https://graph.facebook.com/me?fields=id", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      return r.status;
    }
    case "threads": {
      const r = await fetch("https://graph.threads.net/me?fields=id", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      return r.status;
    }
    case "youtube": {
      const { isYouTubeAccessTokenUsable } = await import("./youtube-token.js");
      return (await isYouTubeAccessTokenUsable(accessToken)) ? 200 : 401;
    }
    case "tiktok": {
      const r = await fetch(
        "https://open.tiktokapis.com/v2/user/info/?fields=open_id",
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      return r.status;
    }
    case "bluesky": {
      const r = await fetch(
        "https://bsky.social/xrpc/com.atproto.server.getSession",
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      return r.status;
    }
    case "pinterest": {
      // Use same base as rest of app (sandbox); sandbox tokens are invalid on production API
      const r = await fetch("https://api.pinterest.com/v5/user_account", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      return r.status;
    }
    default:
      return 500;
  }
}

/** How far ahead of expiry we proactively refresh during health sweeps. */
function proactiveRefreshHorizonMs(platform: string): number {
  switch (platform) {
    case "linkedin":
      return 7 * 24 * 60 * 60 * 1000;
    case "instagram":
    case "threads":
    case "facebook":
      return 14 * 24 * 60 * 60 * 1000;
    case "pinterest":
      return 24 * 60 * 60 * 1000;
    case "youtube":
    case "tiktok":
    default:
      return 60 * 60 * 1000;
  }
}

const REFRESH_ON_HEALTH = new Set([
  "youtube",
  "tiktok",
  "linkedin",
  "instagram",
  "threads",
  "facebook",
  "pinterest",
]);

/**
 * Run token health check for a list of accounts. Updates lastSyncedAt and tokenStatus.
 * When tryRefresh is on, refreshable platforms near expiry (or after 401) refresh instead of flipping expired.
 */
export async function runTokenHealthCheck(
  accounts: AccountForHealthCheck[],
  options: {
    now?: Date;
    /** @deprecated use tryRefresh — kept so existing callers keep working */
    tryRefreshYouTubeTikTok?: boolean;
    tryRefresh?: boolean;
    twitterAccessSecretByAccountId?: Map<string, string>;
  } = {},
): Promise<void> {
  const now = options.now ?? new Date();
  const tryRefresh =
    options.tryRefresh ?? options.tryRefreshYouTubeTikTok ?? false;
  const twitterSecrets = options.twitterAccessSecretByAccountId;

  // Collect results during API calls; write to DB in 2 batched updates at end
  const toMarkActive: string[] = [];
  const toMarkExpired: string[] = [];

  for (let i = 0; i < accounts.length; i++) {
    if (i > 0) await sleep(DELAY_MS);

    const account = accounts[i];
    if (!PLATFORMS_WITH_EXPIRING_TOKENS.has(account.platform)) {
      continue;
    }
    let accessToken: string;
    let accessSecret: string | null = null;

    try {
      accessToken = decryptToken(account.encryptedAccessToken, account.id);
      if (account.platform === "twitter_x" && account.encryptedRefreshToken)
        accessSecret = decryptToken(account.encryptedRefreshToken, account.id);
      else if (twitterSecrets?.has(account.id))
        accessSecret = twitterSecrets.get(account.id) ?? null;
    } catch {
      toMarkExpired.push(account.id);
      continue;
    }

    if (tryRefresh && REFRESH_ON_HEALTH.has(account.platform)) {
      const exp = account.tokenExpiresAt
        ? new Date(account.tokenExpiresAt).getTime()
        : null;
      const horizon =
        now.getTime() + proactiveRefreshHorizonMs(account.platform);
      if (exp != null && exp < horizon) {
        try {
          const { getValidToken } = await import("./token-refresh.js");
          await getValidToken(account.id, account.platform);
          toMarkActive.push(account.id);
        } catch {
          toMarkExpired.push(account.id);
        }
        continue;
      }
    }

    const status = await verifyToken(
      account.platform,
      accessToken,
      accessSecret,
    );

    if (status === 200) {
      toMarkActive.push(account.id);
    } else if (status === 401 || status === 403) {
      if (tryRefresh && REFRESH_ON_HEALTH.has(account.platform)) {
        try {
          const { getValidToken } = await import("./token-refresh.js");
          await getValidToken(account.id, account.platform, {
            forceRefresh: true,
          });
          toMarkActive.push(account.id);
          continue;
        } catch {
          // fall through to expired
        }
      }
      toMarkExpired.push(account.id);
    }
    // Other statuses: leave tokenStatus/lastSyncedAt unchanged
  }

  // Batch writes - 2 queries max regardless of how many accounts were checked
  if (toMarkActive.length > 0) {
    await db
      .update(connectedAccounts)
      .set({ lastSyncedAt: now, tokenStatus: "active", updatedAt: now })
      .where(inArray(connectedAccounts.id, toMarkActive));
  }
  if (toMarkExpired.length > 0) {
    await db
      .update(connectedAccounts)
      .set({ tokenStatus: "expired", updatedAt: now })
      .where(inArray(connectedAccounts.id, toMarkExpired));
  }
}

/**
 * Fetch account IDs that need health check: active, and (lastSyncedAt < now - 24h OR lastSyncedAt IS NULL).
 * For strict rate-limit platforms, require lastSyncedAt < now - 12h.
 */
export function filterAccountsNeedingHealthCheck(
  accounts: AccountForHealthCheck[],
  options: {
    now?: Date;
    maxAgeMs?: number;
    strictMaxAgeMs?: number;
  } = {},
): AccountForHealthCheck[] {
  const now = options.now ?? new Date();
  const maxAgeMs = options.maxAgeMs ?? 24 * 60 * 60 * 1000;
  const strictMaxAgeMs = options.strictMaxAgeMs ?? 12 * 60 * 60 * 1000;

  return accounts.filter((a) => {
    const last = a.lastSyncedAt ? new Date(a.lastSyncedAt).getTime() : 0;
    const cutoff = STRICT_RATE_LIMIT_PLATFORMS.has(a.platform)
      ? strictMaxAgeMs
      : maxAgeMs;
    return last < now.getTime() - cutoff;
  });
}

/**
 * On-demand: run token health check for a user's accounts not checked in the last 6 hours.
 * Call from Connections page load.
 */
export async function runTokenHealthCheckForUser(
  userId: string,
): Promise<void> {
  const now = new Date();
  const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);

  const accounts = await db
    .select({
      id: connectedAccounts.id,
      platform: connectedAccounts.platform,
      encryptedAccessToken: connectedAccounts.encryptedAccessToken,
      encryptedRefreshToken: connectedAccounts.encryptedRefreshToken,
      tokenExpiresAt: connectedAccounts.tokenExpiresAt,
      lastSyncedAt: connectedAccounts.lastSyncedAt,
      tokenStatus: connectedAccounts.tokenStatus,
    })
    .from(connectedAccounts)
    .where(
      and(
        eq(connectedAccounts.userId, userId),
        eq(connectedAccounts.isActive, true),
        or(
          isNull(connectedAccounts.lastSyncedAt),
          lt(connectedAccounts.lastSyncedAt, sixHoursAgo),
        ),
      ),
    );

  if (accounts.length === 0) return;

  const toCheck = filterAccountsNeedingHealthCheck(accounts, {
    now,
    maxAgeMs: 6 * 60 * 60 * 1000,
    strictMaxAgeMs: 6 * 60 * 60 * 1000,
  });

  for (let i = 0; i < toCheck.length; i += BATCH_SIZE) {
    const batch = toCheck.slice(i, i + BATCH_SIZE);
    await runTokenHealthCheck(batch, {
      now,
      tryRefresh: true,
    });
  }
}

export { BATCH_SIZE, DELAY_MS, STRICT_RATE_LIMIT_PLATFORMS };
