import { NextResponse } from "next/server";
import { db } from "@/db";
import { connectedAccounts } from "@/db/schema";
import { and, eq, or, lt, isNull } from "drizzle-orm";
import { constantTimeEquals } from "@/lib/validation";
import {
  runTokenHealthCheck,
  filterAccountsNeedingHealthCheck,
  BATCH_SIZE,
  type AccountForHealthCheck,
} from "@/lib/token-health";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const expected = process.env.CRON_SECRET;

  if (!expected) {
    return NextResponse.json(
      { error: "Cron not configured" },
      { status: 503 },
    );
  }
  if (
    !authHeader ||
    !authHeader.startsWith("Bearer ") ||
    !constantTimeEquals(authHeader.slice(7), expected)
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

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
        eq(connectedAccounts.isActive, true),
        or(
          isNull(connectedAccounts.lastSyncedAt),
          lt(connectedAccounts.lastSyncedAt, twentyFourHoursAgo),
        ),
      ),
    );

  const toCheck = filterAccountsNeedingHealthCheck(accounts, {
    now,
    maxAgeMs: 24 * 60 * 60 * 1000,
    strictMaxAgeMs: 12 * 60 * 60 * 1000,
  });

  let processed = 0;
  for (let i = 0; i < toCheck.length; i += BATCH_SIZE) {
    const batch = toCheck.slice(i, i + BATCH_SIZE);
    await runTokenHealthCheck(batch, {
      now,
      tryRefreshYouTubeTikTok: true,
    });
    processed += batch.length;
  }

  return NextResponse.json({
    ok: true,
    total: accounts.length,
    checked: toCheck.length,
    processed,
  });
}
