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
  apiKey: z.string().min(1, "API key is required"),
});

export async function POST(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const validated = byokSchema.parse(body);

    const apiKey = validated.apiKey.trim();

    // Validate API key with Dev.to
    const meRes = await fetch("https://dev.to/api/users/me", {
      headers: {
        "api-key": apiKey,
      },
    });

    if (!meRes.ok) {
      const errText = await meRes.text();
      console.error("Dev.to API key validation failed:", meRes.status, errText);
      return Response.json(
        {
          error: "Invalid API key",
          message: "The API key could not be validated. Check it at dev.to/settings/extensions.",
        },
        { status: 400 },
      );
    }

    const userData = await meRes.json();
    const username = userData.username ?? userData.name ?? String(userData.id);
    const profileImageUrl = userData.profile_image ?? null;

    const existing = await db.query.connectedAccounts.findFirst({
      where: and(
        eq(connectedAccounts.userId, session.user.id),
        eq(connectedAccounts.platform, "devto"),
      ),
    });

    const accountId = existing?.id ?? crypto.randomUUID();
    const encryptedAccessToken = encryptToken(apiKey, accountId);

    if (existing) {
      await db
        .update(connectedAccounts)
        .set({
          encryptedAccessToken,
          platformUserId: String(userData.id),
          platformUsername: username,
          profileImageUrl,
          updatedAt: new Date(),
        })
        .where(eq(connectedAccounts.id, existing.id));

      return Response.json({
        success: true,
        username,
        message: "Dev.to account updated successfully",
      });
    }

    await db.insert(connectedAccounts).values({
      id: accountId,
      userId: session.user.id,
      platform: "devto",
      platformUserId: String(userData.id),
      platformUsername: username,
      profileImageUrl,
      encryptedAccessToken,
      encryptedRefreshToken: null,
      tokenExpiresAt: null,
    });

    return Response.json({
      success: true,
      username,
      message: "Dev.to account connected successfully",
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json(
        { error: "Validation error", details: err.errors },
        { status: 400 },
      );
    }
    console.error("Dev.to BYOK error:", err);
    return Response.json(
      {
        error: "Failed to connect Dev.to",
        message: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
