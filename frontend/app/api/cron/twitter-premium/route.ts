import { NextResponse } from "next/server";
import { db } from "@/db";
import { connectedAccounts } from "@/db/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";
import OAuth from "oauth-1.0a";
import { decryptToken } from "@/lib/encryption";
import { verifyCronAuth } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Daily recheck of X Premium status for all connected Twitter accounts. */
export async function GET(request: Request) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const consumerKey = process.env.TWITTER_CONSUMER_KEY;
  const consumerSecret = process.env.TWITTER_CONSUMER_SECRET;
  if (!consumerKey || !consumerSecret) {
    return NextResponse.json(
      { error: "Twitter OAuth credentials not configured" },
      { status: 503 },
    );
  }

  const xAccounts = await db
    .select({
      id: connectedAccounts.id,
      encryptedAccessToken: connectedAccounts.encryptedAccessToken,
      encryptedRefreshToken: connectedAccounts.encryptedRefreshToken,
    })
    .from(connectedAccounts)
    .where(eq(connectedAccounts.platform, "twitter_x"));

  let updated = 0;
  let errors = 0;
  let lastError: string | null = null;

  const oauth = new OAuth({
    consumer: { key: consumerKey, secret: consumerSecret },
    signature_method: "HMAC-SHA1",
    hash_function(base: string, key: string) {
      return crypto.createHmac("sha1", key).update(base).digest("base64");
    },
  });

  for (const account of xAccounts) {
    try {
      const accessToken = decryptToken(
        account.encryptedAccessToken,
        account.id,
      );
      const accessSecret = account.encryptedRefreshToken
        ? decryptToken(account.encryptedRefreshToken, account.id)
        : null;
      if (!accessSecret) continue;

      const url =
        "https://api.twitter.com/2/users/me?user.fields=subscription_type";
      const authHeader = oauth.toHeader(
        oauth.authorize({ url, method: "GET" }, {
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
          return NextResponse.json(
            {
              ok: false,
              error:
                "X Premium check failed: Your Twitter API project is on the free tier. The subscription_type field requires Basic tier or higher. Upgrade at developer.twitter.com to enable Premium badge detection.",
              freeTierBlocked: true,
              total: xAccounts.length,
              updated,
              errors: errors + 1,
            },
            { status: 403 },
          );
        }
        lastError = errMsg || `HTTP ${res.status}`;
        errors++;
        continue;
      }

      const subType = data?.data?.subscription_type;
      const premium =
        subType === "Premium" || subType === "PremiumPlus";

      await db
        .update(connectedAccounts)
        .set({ isTwitterPremium: premium, updatedAt: new Date() })
        .where(eq(connectedAccounts.id, account.id));

      updated++;
    } catch (e) {
      lastError = e instanceof Error ? e.message : "Unknown error";
      errors++;
    }
  }

  return NextResponse.json({
    ok: true,
    total: xAccounts.length,
    updated,
    errors,
    ...(lastError && { lastError }),
  });
}
