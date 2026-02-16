import { auth } from "@/lib/auth";
import { db } from "@/db";
import { connectedAccounts, verification } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { headers } from "next/headers";
import { decryptToken, encryptToken } from "@/lib/encryption";
import crypto from "crypto";
import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { tokenId?: string; instagramAccountId?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }

  const { tokenId, instagramAccountId } = body;
  if (!tokenId || !instagramAccountId) {
    return Response.json(
      { error: "tokenId and instagramAccountId are required" },
      { status: 400 },
    );
  }

  const record = await db.query.verification.findFirst({
    where: eq(verification.id, tokenId),
  });

  if (!record || record.identifier !== "instagram_facebook_pages") {
    return Response.json({ error: "Invalid or expired token" }, { status: 400 });
  }

  if (new Date(record.expiresAt) < new Date()) {
    return Response.json({ error: "Token expired" }, { status: 400 });
  }

  try {
    const payload = JSON.parse(decryptToken(record.value, tokenId));
    if (payload.userId !== session.user.id) {
      return Response.json({ error: "Unauthorized" }, { status: 403 });
    }

    const pages = payload.pages as Array<{
      pageId: string;
      pageName: string;
      pageAccessToken: string;
      instagramAccountId: string;
      instagramUsername: string | null;
      instagramProfilePictureUrl: string | null;
    }>;

    const selectedPage = pages.find((p) => p.instagramAccountId === instagramAccountId);
    if (!selectedPage) {
      return Response.json({ error: "Instagram account not found" }, { status: 400 });
    }

    // Check if account already connected
    const existing = await db.query.connectedAccounts.findFirst({
      where: and(
        eq(connectedAccounts.userId, session.user.id),
        eq(connectedAccounts.platform, "instagram"),
        eq(connectedAccounts.platformUserId, selectedPage.instagramAccountId),
      ),
    });

    const accountId = crypto.randomUUID();

    if (existing) {
      // Update existing
      await db
        .update(connectedAccounts)
        .set({
          encryptedAccessToken: encryptToken(selectedPage.pageAccessToken, existing.id),
          encryptedRefreshToken: null,
          tokenExpiresAt: null,
          platformUsername: selectedPage.instagramUsername,
          profileImageUrl: selectedPage.instagramProfilePictureUrl,
          platformMetadata: {
            facebookPageId: selectedPage.pageId,
            instagramBusinessAccountId: selectedPage.instagramAccountId,
            connectionMethod: "facebook-page",
          },
          updatedAt: new Date(),
        })
        .where(eq(connectedAccounts.id, existing.id));
    } else {
      // Insert new account
      await db.insert(connectedAccounts).values({
        id: accountId,
        userId: session.user.id,
        platform: "instagram",
        platformUserId: selectedPage.instagramAccountId,
        platformUsername: selectedPage.instagramUsername,
        profileImageUrl: selectedPage.instagramProfilePictureUrl,
        encryptedAccessToken: encryptToken(selectedPage.pageAccessToken, accountId),
        encryptedRefreshToken: null,
        tokenExpiresAt: null,
        platformMetadata: {
          facebookPageId: selectedPage.pageId,
          instagramBusinessAccountId: selectedPage.instagramAccountId,
          connectionMethod: "facebook-page",
        },
      });
    }

    // Clean up verification record
    await db.delete(verification).where(eq(verification.id, tokenId));

    return Response.json({
      success: true,
      instagramUsername: selectedPage.instagramUsername,
      message: "Instagram account connected successfully",
    });
  } catch (err) {
    console.error("Error connecting Instagram account:", err);
    return Response.json({ error: "Invalid token data" }, { status: 400 });
  }
}
