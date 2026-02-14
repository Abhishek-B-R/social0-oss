import { auth } from "@/lib/auth";
import { db } from "@/db";
import { connectedAccounts } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { headers } from "next/headers";
import { encryptToken } from "@/lib/encryption";
import crypto from "crypto";
import { z } from "zod";
import { NextRequest } from "next/server";

const byokSchema = z.object({
  integrationToken: z.string().min(1, "Integration token is required"),
});

export async function POST(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const validated = byokSchema.parse(body);

    const token = validated.integrationToken.trim();

    // Validate token with Medium API
    const meRes = await fetch("https://api.medium.com/v1/me", {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    });

    if (!meRes.ok) {
      const errText = await meRes.text();
      console.error("Medium token validation failed:", meRes.status, errText);
      return Response.json(
        {
          error: "Invalid token",
          message: "The integration token could not be validated. Get one at medium.com/me/settings under Integration Tokens.",
        },
        { status: 400 },
      );
    }

    const envelope = await meRes.json();
    const userData = envelope.data;
    if (!userData?.id) {
      return Response.json(
        { error: "Invalid token", message: "No user data returned from Medium." },
        { status: 400 },
      );
    }

    const username = userData.username ?? userData.name ?? String(userData.id);
    const profileImageUrl = userData.imageUrl ?? null;

    const existing = await db.query.connectedAccounts.findFirst({
      where: and(
        eq(connectedAccounts.userId, session.user.id),
        eq(connectedAccounts.platform, "medium"),
      ),
    });

    const accountId = existing?.id ?? crypto.randomUUID();
    const encryptedAccessToken = encryptToken(token, accountId);

    if (existing) {
      await db
        .update(connectedAccounts)
        .set({
          encryptedAccessToken,
          platformUserId: userData.id,
          platformUsername: username,
          profileImageUrl,
          updatedAt: new Date(),
        })
        .where(eq(connectedAccounts.id, existing.id));

      return Response.json({
        success: true,
        username,
        message: "Medium account updated successfully",
      });
    }

    await db.insert(connectedAccounts).values({
      id: accountId,
      userId: session.user.id,
      platform: "medium",
      platformUserId: userData.id,
      platformUsername: username,
      profileImageUrl,
      encryptedAccessToken,
      encryptedRefreshToken: null,
      tokenExpiresAt: null,
    });

    return Response.json({
      success: true,
      username,
      message: "Medium account connected successfully",
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json(
        { error: "Validation error", details: err.errors },
        { status: 400 },
      );
    }
    console.error("Medium BYOK error:", err);
    return Response.json(
      {
        error: "Failed to connect Medium",
        message: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
