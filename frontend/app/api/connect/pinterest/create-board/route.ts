import crypto from "crypto";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { connectedAccounts, verification } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { decryptToken, encryptToken } from "@/lib/encryption";
import { NextRequest } from "next/server";

type PrivacyInput = "PUBLIC" | "PRIVATE";

function toPinterestPrivacy(p: PrivacyInput): "PUBLIC" | "SECRET" {
  return p === "PRIVATE" ? "SECRET" : "PUBLIC";
}

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session)
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: { tokenId?: string; name?: string; privacy?: PrivacyInput };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }

  const tokenId = body.tokenId;
  const name = (body.name ?? "").trim();
  const privacy = body.privacy;
  if (!tokenId || !name || (privacy !== "PUBLIC" && privacy !== "PRIVATE")) {
    return Response.json(
      { error: "tokenId, name, and privacy (PUBLIC|PRIVATE) are required" },
      { status: 400 },
    );
  }

  const record = await db.query.verification.findFirst({
    where: eq(verification.id, tokenId),
  });
  if (!record || record.identifier !== "pinterest_create_board") {
    return Response.json(
      { error: "Invalid or expired token" },
      { status: 400 },
    );
  }
  if (new Date(record.expiresAt) < new Date()) {
    return Response.json({ error: "Token expired" }, { status: 400 });
  }

  let payload: {
    userId: string;
    access_token: string;
    refresh_token: string | null;
    expires_in: number | null;
  };

  try {
    payload = JSON.parse(decryptToken(record.value, tokenId));
  } catch {
    return Response.json({ error: "Invalid token data" }, { status: 400 });
  }

  if (payload.userId !== session.user.id) {
    return Response.json({ error: "Unauthorized" }, { status: 403 });
  }

  // Create board in Pinterest sandbox
  const createRes = await fetch("https://api.pinterest.com/v5/boards", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${payload.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name,
      privacy: toPinterestPrivacy(privacy),
    }),
  });

  const createData = (await createRes.json().catch(() => ({}))) as {
    id?: string;
    name?: string;
    message?: string;
  };

  if (!createRes.ok) {
    return Response.json(
      {
        error:
          createData.message ??
          `Failed to create board (HTTP ${createRes.status})`,
      },
      { status: 400 },
    );
  }

  if (!createData.id) {
    return Response.json(
      {
        error:
          "Board created, but Pinterest did not return a board id. Try again.",
      },
      { status: 400 },
    );
  }

  // Complete connection without board selection (board chosen at post time)
  let userInfo: {
    id: string;
    username: string | null;
    profileImageUrl: string | null;
  };
  try {
    const userRes = await fetch("https://api.pinterest.com/v5/user_account", {
      headers: { Authorization: `Bearer ${payload.access_token}` },
    });
    const userData = (await userRes.json().catch(() => ({}))) as {
      id?: string;
      username?: string;
      profile_image?: string;
    };
    if (userRes.ok && (userData.id || userData.username)) {
      const raw = userData.profile_image;
      const profileImageUrl =
        typeof raw === "string" &&
        (raw.startsWith("http://") || raw.startsWith("https://"))
          ? raw
          : null;
      userInfo = {
        id: userData.id || userData.username || `pinterest-${Date.now()}`,
        username: userData.username ?? "Pinterest User",
        profileImageUrl,
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

  const existing = await db.query.connectedAccounts.findFirst({
    where: and(
      eq(connectedAccounts.userId, session.user.id),
      eq(connectedAccounts.platform, "pinterest"),
      eq(connectedAccounts.platformUserId, userInfo.id),
    ),
  });
  const accountId = existing?.id ?? crypto.randomUUID();
  const tokenExpiresAt = payload.expires_in
    ? new Date(Date.now() + payload.expires_in * 1000)
    : null;
  if (existing) {
    await db
      .update(connectedAccounts)
      .set({
        platformUsername: userInfo.username,
        profileImageUrl: userInfo.profileImageUrl,
        encryptedAccessToken: encryptToken(payload.access_token, existing.id),
        encryptedRefreshToken: payload.refresh_token
          ? encryptToken(payload.refresh_token, existing.id)
          : null,
        tokenExpiresAt,
        tokenStatus: "active",
        isActive: true,
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
      encryptedAccessToken: encryptToken(payload.access_token, accountId),
      encryptedRefreshToken: payload.refresh_token
        ? encryptToken(payload.refresh_token, accountId)
        : null,
      tokenExpiresAt,
      tokenStatus: "active",
      isActive: true,
      platformMetadata: {},
    });
  }
  await db.delete(verification).where(eq(verification.id, tokenId));

  return Response.json({
    success: true,
    created: { id: createData.id ?? null, name: createData.name ?? name },
  });
}
