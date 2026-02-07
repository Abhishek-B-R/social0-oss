import { auth } from "@/lib/auth";
import { db } from "@/db";
import { connectedAccounts } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { headers } from "next/headers";
import { TwitterApi } from "twitter-api-v2";
import { encryptToken } from "@/lib/encryption";
import crypto from "crypto";
import { z } from "zod";
import { NextRequest } from "next/server";

const byokSchema = z.object({
  consumerKey: z.string().min(1, "Consumer Key is required"),
  consumerSecret: z.string().min(1, "Consumer Secret is required"),
  accessToken: z.string().min(1, "Access Token is required"),
  accessTokenSecret: z.string().min(1, "Access Token Secret is required"),
});

export async function POST(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });

    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const validated = byokSchema.parse(body);

    // Validate keys by calling X API
    const client = new TwitterApi({
      appKey: validated.consumerKey,
      appSecret: validated.consumerSecret,
      accessToken: validated.accessToken,
      accessSecret: validated.accessTokenSecret,
    });

    // Test the credentials by fetching user info
    let userInfo;
    try {
      const me = await client.v2.me({
        "user.fields": ["username", "name", "profile_image_url"],
      });
      userInfo = {
        id: me.data.id,
        username: me.data.username || me.data.name || null,
        profileImageUrl: me.data.profile_image_url || null,
      };
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to validate X API credentials";
      console.error("X API validation error:", err);
      return Response.json(
        {
          error: "Invalid credentials",
          message: errorMessage,
        },
        { status: 400 },
      );
    }

    // Check if account already connected
    const existing = await db.query.connectedAccounts.findFirst({
      where: and(
        eq(connectedAccounts.userId, session.user.id),
        eq(connectedAccounts.platform, "twitter_x"),
      ),
    });

    // Generate UUID for account ID (needed for encryption)
    const accountId = existing?.id || crypto.randomUUID();

    // Encrypt all 4 keys
    // Store access token and access token secret in encryptedAccessToken (JSON)
    // Store consumer key and consumer secret in encryptedRefreshToken (JSON)
    // This keeps them separate but both encrypted
    const encryptedAccessToken = encryptToken(
      JSON.stringify({
        accessToken: validated.accessToken,
        accessTokenSecret: validated.accessTokenSecret,
      }),
      accountId,
    );

    const encryptedRefreshToken = encryptToken(
      JSON.stringify({
        consumerKey: validated.consumerKey,
        consumerSecret: validated.consumerSecret,
      }),
      accountId,
    );

    if (existing) {
      // Update existing account
      await db
        .update(connectedAccounts)
        .set({
          encryptedAccessToken,
          encryptedRefreshToken,
          platformUserId: userInfo.id,
          platformUsername: userInfo.username,
          profileImageUrl: userInfo.profileImageUrl,
          updatedAt: new Date(),
        })
        .where(eq(connectedAccounts.id, existing.id));

      return Response.json({
        success: true,
        username: userInfo.username,
        message: "X account updated successfully",
      });
    } else {
      // Insert new account
      await db.insert(connectedAccounts).values({
        id: accountId,
        userId: session.user.id,
        platform: "twitter_x",
        platformUserId: userInfo.id,
        platformUsername: userInfo.username,
        profileImageUrl: userInfo.profileImageUrl,
        encryptedAccessToken,
        encryptedRefreshToken,
        tokenExpiresAt: null, // BYOK keys don't expire
      });

      return Response.json({
        success: true,
        username: userInfo.username,
        message: "X account connected successfully",
      });
    }
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json(
        {
          error: "Validation error",
          details: err.errors,
        },
        { status: 400 },
      );
    }

    console.error("BYOK error:", err);
    return Response.json(
      {
        error: "Failed to connect X account",
        message: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
