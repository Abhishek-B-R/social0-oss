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
  publicationId: z.string().min(1, "Publication ID is required"),
});

const ME_QUERY = `
query Me {
  me {
    id
    username
    name
    profilePicture
  }
}
`;

export async function POST(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const validated = byokSchema.parse(body);

    const apiKey = validated.apiKey.trim();
    const publicationId = validated.publicationId.trim();

    // Validate API key with Hashnode GraphQL
    const gqlRes = await fetch("https://gql.hashnode.com/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: apiKey,
      },
      body: JSON.stringify({ query: ME_QUERY }),
    });

    if (!gqlRes.ok) {
      return Response.json(
        {
          error: "Invalid API key",
          message: "The token could not be validated. Check Hashnode Settings → Developer.",
        },
        { status: 400 },
      );
    }

    const gqlData = await gqlRes.json();
    if (gqlData.errors?.length) {
      return Response.json(
        {
          error: "Invalid API key",
          message: gqlData.errors[0]?.message ?? "Validation failed",
        },
        { status: 400 },
      );
    }

    const me = gqlData.data?.me;
    if (!me) {
      return Response.json(
        { error: "Invalid API key", message: "No user data returned" },
        { status: 400 },
      );
    }

    const username = me.username ?? me.name ?? String(me.id);
    const profileImageUrl = me.profilePicture ?? null;

    const existing = await db.query.connectedAccounts.findFirst({
      where: and(
        eq(connectedAccounts.userId, session.user.id),
        eq(connectedAccounts.platform, "hashnode"),
        eq(connectedAccounts.platformUserId, String(me.id)),
      ),
    });

    const accountId = existing?.id ?? crypto.randomUUID();
    const encryptedAccessToken = encryptToken(apiKey, accountId);

    if (existing) {
      await db
        .update(connectedAccounts)
        .set({
          encryptedAccessToken,
          platformUserId: String(me.id),
          platformUsername: username,
          profileImageUrl,
          platformMetadata: { publicationId },
          updatedAt: new Date(),
        })
        .where(eq(connectedAccounts.id, existing.id));

      return Response.json({
        success: true,
        username,
        message: "Hashnode account updated successfully",
      });
    }

    await db.insert(connectedAccounts).values({
      id: accountId,
      userId: session.user.id,
      platform: "hashnode",
      platformUserId: String(me.id),
      platformUsername: username,
      profileImageUrl,
      encryptedAccessToken,
      encryptedRefreshToken: null,
      tokenExpiresAt: null,
      platformMetadata: { publicationId },
    });

    return Response.json({
      success: true,
      username,
      message: "Hashnode account connected successfully",
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json(
        { error: "Validation error", details: err.errors },
        { status: 400 },
      );
    }
    console.error("Hashnode BYOK error:", err);
    return Response.json(
      {
        error: "Failed to connect Hashnode",
        message: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
