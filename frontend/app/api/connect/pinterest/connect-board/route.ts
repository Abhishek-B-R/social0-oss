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
  let body: { tokenId?: string; boardId?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }
  const { tokenId, boardId } = body;
  if (!tokenId || !boardId) {
    return Response.json(
      { error: "tokenId and boardId are required" },
      { status: 400 },
    );
  }
  const record = await db.query.verification.findFirst({
    where: eq(verification.id, tokenId),
  });
  if (!record || record.identifier !== "pinterest_boards") {
    return Response.json(
      { error: "Invalid or expired token" },
      { status: 400 },
    );
  }
  if (new Date(record.expiresAt) < new Date()) {
    return Response.json({ error: "Token expired" }, { status: 400 });
  }
  try {
    const payload = JSON.parse(decryptToken(record.value, tokenId));
    if (payload.userId !== session.user.id) {
      return Response.json({ error: "Unauthorized" }, { status: 403 });
    }
    const boards = Array.isArray(payload.boards)
      ? (payload.boards as { id: string; name: string }[])
      : [];
    const board = boards.find((b) => b.id === boardId);
    if (!board) {
      return Response.json({ error: "Board not found" }, { status: 400 });
    }

    // Fetch user info with access token
    // Using sandbox API for trial access
    const accessToken = payload.access_token as string;
    let userInfo: {
      id: string;
      username: string | null;
      profileImageUrl: string | null;
    };
    try {
      const userRes = await fetch(
        "https://api-sandbox.pinterest.com/v5/user_account",
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
      const userData = (await userRes.json().catch(() => ({}))) as {
        id?: string;
        username?: string;
        profile_image?: string;
      };
      if (userRes.ok && (userData.id || userData.username)) {
        userInfo = {
          id: userData.id || userData.username || `pinterest-${Date.now()}`,
          username: userData.username || "Pinterest User",
          profileImageUrl: userData.profile_image || null,
        };
      } else {
        userInfo = {
          id: `pinterest-${Date.now()}`,
          username: "Pinterest User",
          profileImageUrl: null,
        };
      }
    } catch (err) {
      console.error("Pinterest user info fetch failed:", err);
      userInfo = {
        id: `pinterest-${Date.now()}`,
        username: "Pinterest User",
        profileImageUrl: null,
      };
    }

    const accountId = crypto.randomUUID();
    const refreshToken = payload.refresh_token as string | null;
    const expiresIn = payload.expires_in as number | null;

    const existing = await db.query.connectedAccounts.findFirst({
      where: and(
        eq(connectedAccounts.userId, session.user.id),
        eq(connectedAccounts.platform, "pinterest"),
      ),
    });

    if (existing) {
      await db
        .update(connectedAccounts)
        .set({
          platformUserId: userInfo.id,
          platformUsername: userInfo.username,
          profileImageUrl: userInfo.profileImageUrl,
          encryptedAccessToken: encryptToken(accessToken, existing.id),
          encryptedRefreshToken: refreshToken
            ? encryptToken(refreshToken, existing.id)
            : null,
          tokenExpiresAt: expiresIn
            ? new Date(Date.now() + expiresIn * 1000)
            : null,
          platformMetadata: {
            ...((existing.platformMetadata as Record<string, unknown>) ?? {}),
            boardId,
          },
          updatedAt: new Date(),
        })
        .where(eq(connectedAccounts.id, existing.id));
    } else {
      await db.insert(connectedAccounts).values({
        id: accountId,
        userId: session.user.id,
        platform: "pinterest",
        platformUserId: userInfo.id,
        platformUsername: userInfo.username,
        profileImageUrl: userInfo.profileImageUrl,
        encryptedAccessToken: encryptToken(accessToken, accountId),
        encryptedRefreshToken: refreshToken
          ? encryptToken(refreshToken, accountId)
          : null,
        tokenExpiresAt: expiresIn
          ? new Date(Date.now() + expiresIn * 1000)
          : null,
        platformMetadata: {
          boardId,
        },
      });
    }
    await db.delete(verification).where(eq(verification.id, tokenId));
    return Response.json({
      success: true,
      boardName: board.name,
      message: "Pinterest connected successfully",
    });
  } catch (e) {
    console.error("Pinterest connect-board error:", e);
    return Response.json({ error: "Invalid token data" }, { status: 400 });
  }
}
