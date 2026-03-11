import { auth } from "@/lib/auth";
import { db } from "@/db";
import { connectedAccounts, postPublications } from "@/db/schema";
import { eq, and, count } from "drizzle-orm";
import { headers } from "next/headers";
import { decryptToken } from "@/lib/encryption";
import { revokeTokenOnPlatform } from "@/lib/revoke-token";
import type { Platform } from "@/lib/platforms";

type RouteParams = { params: Promise<{ id: string }> };

/** GET returns account info and publication count for the disconnect confirmation modal. */
export async function GET(_request: Request, { params }: RouteParams) {
  const { id: accountId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [account] = await db
    .select({
      id: connectedAccounts.id,
      platform: connectedAccounts.platform,
      platformUsername: connectedAccounts.platformUsername,
    })
    .from(connectedAccounts)
    .where(
      and(
        eq(connectedAccounts.id, accountId),
        eq(connectedAccounts.userId, session.user.id)
      )
    )
    .limit(1);

  if (!account) {
    return Response.json({ error: "Account not found" }, { status: 404 });
  }

  const [row] = await db
    .select({ value: count() })
    .from(postPublications)
    .where(eq(postPublications.connectedAccountId, accountId));

  const publicationCount = Number(row?.value ?? 0);

  return Response.json({
    ...account,
    publicationCount,
  });
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const { id: accountId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [account] = await db
    .select()
    .from(connectedAccounts)
    .where(
      and(
        eq(connectedAccounts.id, accountId),
        eq(connectedAccounts.userId, session.user.id)
      )
    )
    .limit(1);

  if (!account) {
    return Response.json({ error: "Account not found" }, { status: 404 });
  }

  // 1. Revoke token on the platform (best effort — don't block on failure)
  try {
    const accessToken = decryptToken(account.encryptedAccessToken, account.id);
    await revokeTokenOnPlatform(account.platform as Platform, accessToken);
  } catch {
    // Log but continue — we still want to delete locally
  }

  // 2. Hard delete the account. Publications keep rows with connected_account_id = NULL (FK ON DELETE SET NULL).
  await db
    .delete(connectedAccounts)
    .where(eq(connectedAccounts.id, accountId));

  return Response.json({ success: true });
}
