import { auth } from "../lib/auth.js";
import { db } from "../db/index.js";
import { connectedAccounts } from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { headers } from "../lib/http/request-cookies.js";
import { encryptToken } from "@social0/shared";
import { checkAccountLimits } from "../lib/plan-limits.js";
import crypto from "crypto";
import { z } from "zod";
import { AppRequest } from "../lib/http/http.js";
import { blueskyByokLimiter, enforceRateLimit } from "../lib/ratelimit.js";
import { mirrorProfileImageToR2 } from "../lib/mirror-profile-image.js";

const byokSchema = z.object({
  handle: z
    .string()
    .min(1, "Handle is required")
    .refine(
      (val) => val.startsWith("@") || val.includes(".bsky.social"),
      "Handle should be in format @username.bsky.social",
    ),
  appPassword: z.string().min(1, "App password is required"),
});

export async function blueskyByok(req: AppRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });

    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rate = await enforceRateLimit(blueskyByokLimiter, session.user.id);
    if (!rate.allowed) {
      return Response.json({ error: rate.error }, { status: rate.status });
    }

    const body = await req.json();
    const validated = byokSchema.parse(body);

    // Normalize handle (remove @ if present, ensure it's a full handle)
    let handle = validated.handle
      .trim()
      .replace(/[\u200B-\u200D\uFEFF\u202A-\u202E]/g, "");
    if (handle.startsWith("@")) {
      handle = handle.slice(1);
    }
    // If handle doesn't include domain, assume bsky.social
    if (!handle.includes(".")) {
      handle = `${handle}.bsky.social`;
    }

    // Validate credentials by creating a session with Bluesky AT Protocol
    // Use com.atproto.server.createSession endpoint
    let userInfo;
    try {
      const sessionResponse = await fetch(
        "https://bsky.social/xrpc/com.atproto.server.createSession",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            identifier: handle,
            password: validated.appPassword,
          }),
        },
      );

      if (!sessionResponse.ok) {
        const errorData = await sessionResponse.json();
        console.error("Bluesky session creation error:", errorData);
        throw new Error(
          errorData.message ||
            "Failed to authenticate with Bluesky. Please check your handle and app password.",
        );
      }

      const sessionData = await sessionResponse.json();

      let profileImageUrl: string | null = null;
      try {
        const publicProfileRes = await fetch(
          `https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(handle)}`,
        );
        if (publicProfileRes.ok) {
          const publicProfile = await publicProfileRes.json();
          const avatarUrl = publicProfile.avatar;
          if (
            typeof avatarUrl === "string" &&
            (avatarUrl.startsWith("http://") || avatarUrl.startsWith("https://"))
          ) {
            profileImageUrl = avatarUrl;
          }
        }
      } catch (err) {
        console.error("Bluesky public profile avatar fetch failed:", err);
      }
      if (!profileImageUrl) {
        const profileResponse = await fetch(
          `https://bsky.social/xrpc/com.atproto.repo.getRecord?repo=${sessionData.did}&collection=app.bsky.actor.profile&rkey=self`,
          {
            headers: {
              Authorization: `Bearer ${sessionData.accessJwt}`,
            },
          },
        );
        if (profileResponse.ok) {
          const profileData = await profileResponse.json();
          const avatarCid =
            profileData.value?.avatar?.ref?.$link ||
            profileData.value?.avatar?.ref;
          profileImageUrl = avatarCid
            ? `https://cdn.bsky.app/img/avatar/plain/${sessionData.did}/${avatarCid}@jpeg`
            : null;
        }
      }

      userInfo = {
        id: sessionData.did,
        username: sessionData.handle || handle,
        profileImageUrl,
      };
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : "Failed to validate Bluesky credentials";
      console.error("Bluesky validation error:", err);
      return Response.json(
        {
          error: "Invalid credentials",
          message: errorMessage,
        },
        { status: 400 },
      );
    }

    // Check if this exact account (userId + platform + platformUserId) already connected
    const existing = await db.query.connectedAccounts.findFirst({
      where: and(
        eq(connectedAccounts.userId, session.user.id),
        eq(connectedAccounts.platform, "bluesky"),
        eq(connectedAccounts.platformUserId, userInfo.id),
      ),
    });

    // Generate UUID for account ID (needed for encryption)
    const accountId = existing?.id || crypto.randomUUID();

    // Encrypt handle and app password
    // Store handle in encryptedAccessToken and app password in encryptedRefreshToken
    const encryptedAccessToken = encryptToken(handle, accountId);
    const encryptedRefreshToken = encryptToken(
      validated.appPassword,
      accountId,
    );
    const profileImageUrl = await mirrorProfileImageToR2(
      userInfo.profileImageUrl,
      {
        userId: session.user.id,
        accountId,
        platform: "bluesky",
      },
    );

    if (existing) {
      // Update existing account (reconnect: set isActive so it shows in UI)
      await db
        .update(connectedAccounts)
        .set({
          encryptedAccessToken,
          encryptedRefreshToken,
          platformUserId: userInfo.id,
          platformUsername: userInfo.username,
          profileImageUrl,
          isActive: true,
          updatedAt: new Date(),
        })
        .where(eq(connectedAccounts.id, existing.id));

      return Response.json({
        success: true,
        username: userInfo.username,
        message: "Bluesky account updated successfully",
      });
    } else {
      const limitCheck = await checkAccountLimits(session.user.id, "bluesky");
      if (!limitCheck.allowed) {
        return Response.json(
          {
            error: "limit_reached",
            message:
              limitCheck.reason ?? "You need an active plan to connect accounts and post content.",
          },
          { status: 403 },
        );
      }
      // Insert new account
      await db.insert(connectedAccounts).values({
        id: accountId,
        userId: session.user.id,
        platform: "bluesky",
        platformUserId: userInfo.id,
        platformUsername: userInfo.username,
        profileImageUrl,
        encryptedAccessToken,
        encryptedRefreshToken,
        tokenExpiresAt: null, // App passwords don't expire
        isActive: true,
      });

      return Response.json({
        success: true,
        username: userInfo.username,
        message: "Bluesky account connected successfully",
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
        error: "Failed to connect Bluesky account",
        message: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
