import { db } from "../db/index.js";
import { connectedAccounts } from "../db/schema.js";
import { eq } from "drizzle-orm";
import crypto from "crypto";
import OAuth from "oauth-1.0a";
import { decryptToken } from "@social0/shared";

function getOAuth() {
  const consumerKey = process.env.TWITTER_CONSUMER_KEY;
  const consumerSecret = process.env.TWITTER_CONSUMER_SECRET;
  if (!consumerKey || !consumerSecret) return null;
  return {
    oauth: new OAuth({
      consumer: { key: consumerKey, secret: consumerSecret },
      signature_method: "HMAC-SHA1",
      hash_function(base: string, key: string) {
        return crypto.createHmac("sha1", key).update(base).digest("base64");
      },
    }),
    consumerKey,
    consumerSecret,
  };
}

export type RefreshTwitterPremiumResult =
  | { ok: true; premium: boolean }
  | { ok: false; freeTierBlocked?: boolean };

/**
 * Check X Premium status for a single Twitter account and update DB.
 * Reused by: cron (daily), OAuth callback (on connect), and refresh-premium API.
 */
export async function refreshTwitterPremiumStatus(
  accountId: string,
): Promise<RefreshTwitterPremiumResult | null> {
  const auth = getOAuth();
  if (!auth) return null;

  const [account] = await db
    .select({
      id: connectedAccounts.id,
      platform: connectedAccounts.platform,
      encryptedAccessToken: connectedAccounts.encryptedAccessToken,
      encryptedRefreshToken: connectedAccounts.encryptedRefreshToken,
    })
    .from(connectedAccounts)
    .where(eq(connectedAccounts.id, accountId))
    .limit(1);

  if (!account || account.platform !== "twitter_x") return null;

  let accessToken: string;
  let accessSecret: string | null = null;
  try {
    accessToken = decryptToken(account.encryptedAccessToken, account.id);
    if (account.encryptedRefreshToken) {
      accessSecret = decryptToken(account.encryptedRefreshToken, account.id);
    }
  } catch {
    return null;
  }
  if (!accessSecret) return null;

  const url =
    "https://api.twitter.com/2/users/me?user.fields=subscription_type";
  const authHeader = auth.oauth.toHeader(
    auth.oauth.authorize({ url, method: "GET" }, {
      key: accessToken,
      secret: accessSecret,
    }),
  );

  const res = await fetch(url, {
    headers: authHeader as unknown as Record<string, string>,
  });
  const data = (await res.json().catch(() => ({}))) as {
    data?: { subscription_type?: string };
    errors?: Array<{ message?: string; code?: number }>;
  };

  if (!res.ok || data.errors?.length) {
    const errMsg = data.errors?.[0]?.message ?? "";
    const errCode = data.errors?.[0]?.code;
    const isFreeTier =
      res.status === 403 &&
      (errCode === 453 ||
        /subset of Twitter API|limited.*endpoints|free tier/i.test(errMsg));
    if (isFreeTier) {
      return { ok: false, freeTierBlocked: true };
    }
    return null;
  }

  const subType = data?.data?.subscription_type;
  const premium = subType === "Premium" || subType === "PremiumPlus";

  await db
    .update(connectedAccounts)
    .set({ isTwitterPremium: premium, updatedAt: new Date() })
    .where(eq(connectedAccounts.id, accountId));

  return { ok: true, premium };
}
