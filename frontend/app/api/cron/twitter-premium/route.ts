import { NextResponse } from "next/server";
import { db } from "@/db";
import { connectedAccounts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { refreshTwitterPremiumStatus } from "@/lib/twitter-premium";
import { verifyCronAuth } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Daily recheck of X Premium status for all connected Twitter accounts. */
export async function GET(request: Request) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  if (!process.env.TWITTER_CONSUMER_KEY || !process.env.TWITTER_CONSUMER_SECRET) {
    return NextResponse.json(
      { error: "Twitter OAuth credentials not configured" },
      { status: 503 },
    );
  }

  const xAccounts = await db
    .select({ id: connectedAccounts.id })
    .from(connectedAccounts)
    .where(eq(connectedAccounts.platform, "twitter_x"));

  let updated = 0;
  let errors = 0;
  let lastError: string | null = null;

  for (const account of xAccounts) {
    try {
      const result = await refreshTwitterPremiumStatus(account.id);
      if (result?.ok === false && result.freeTierBlocked) {
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
      if (result?.ok === true) {
        updated++;
      } else {
        errors++;
      }
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
