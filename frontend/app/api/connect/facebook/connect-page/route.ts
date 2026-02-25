import { auth } from "@/lib/auth";
import { db } from "@/db";
import { connectedAccounts, verification } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { decryptToken, encryptToken } from "@/lib/encryption";
import crypto from "crypto";
import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: { tokenId?: string; pageId?: string };
  try {
    body = await req.json();
  } catch (err) {
    if ((err as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) {
      throw err;
    }
    if (err instanceof Error && err.message === "NEXT_REDIRECT") {
      throw err;
    }
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }
  const { tokenId, pageId } = body;
  if (!tokenId || !pageId) {
    return Response.json(
      { error: "tokenId and pageId are required" },
      { status: 400 },
    );
  }
  const record = await db.query.verification.findFirst({
    where: eq(verification.id, tokenId),
  });
  if (!record || record.identifier !== "facebook_pages") {
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
    const pages = Array.isArray(payload.pages)
      ? (payload.pages as { id: string; name: string; access_token: string }[])
      : [];
    const page = pages.find((p) => p.id === pageId);
    if (!page) {
      return Response.json({ error: "Page not found" }, { status: 400 });
    }
    let profileImageUrl: string | null = null;
    try {
      const pageRes = await fetch(
        `https://graph.facebook.com/v21.0/${page.id}?fields=id,name,picture`,
        { headers: { Authorization: `Bearer ${page.access_token}` } },
      );
      if (pageRes.ok) {
        const pageData = await pageRes.json();
        const url = pageData.picture?.data?.url;
        if (typeof url === "string" && (url.startsWith("http://") || url.startsWith("https://"))) {
          profileImageUrl = url;
        }
      }
    } catch (err) {
      if ((err as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) {
        throw err;
      }
      if (err instanceof Error && err.message === "NEXT_REDIRECT") {
        throw err;
      }
      console.error("Facebook page picture fetch failed:", err);
    }

    const existing = await db.query.connectedAccounts.findFirst({
      where: and(
        eq(connectedAccounts.userId, session.user.id),
        eq(connectedAccounts.platform, "facebook"),
        eq(connectedAccounts.platformUserId, page.id),
      ),
    });

    const accountId = existing?.id ?? crypto.randomUUID();
    const encryptedAccessToken = encryptToken(page.access_token, accountId);

    if (existing) {
      await db
        .update(connectedAccounts)
        .set({
          platformUsername: page.name,
          profileImageUrl,
          encryptedAccessToken,
          encryptedRefreshToken: null,
          tokenExpiresAt: null,
          isActive: true,
          updatedAt: new Date(),
        })
        .where(eq(connectedAccounts.id, existing.id));
    } else {
      await db.insert(connectedAccounts).values({
        id: accountId,
        userId: session.user.id,
        platform: "facebook",
        platformUserId: page.id,
        platformUsername: page.name,
        profileImageUrl,
        encryptedAccessToken,
        encryptedRefreshToken: null,
        tokenExpiresAt: null,
        isActive: true,
      });
    }
    await db.delete(verification).where(eq(verification.id, tokenId));
    return Response.json({
      success: true,
      pageName: page.name,
      message: "Facebook Page connected successfully",
    });
  } catch (err) {
    if ((err as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) {
      throw err;
    }
    if (err instanceof Error && err.message === "NEXT_REDIRECT") {
      throw err;
    }
    return Response.json({ error: "Invalid token data" }, { status: 400 });
  }
}
