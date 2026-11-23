import { getRouteSession } from "../lib/session.js";
import { db } from "../db/index.js";
import { connectedAccounts } from "../db/schema.js";
import { reconnectedAtPatch } from "../lib/account-reconnect.js";
import { eq, and, isNull } from "drizzle-orm";
import { encryptToken } from "@social0/shared";
import { checkAccountLimits } from "../lib/plan-limits.js";
import { queueAgencyExtraAccountsSync } from "../lib/extra-accounts.js";
import crypto from "crypto";
import { z } from "zod";
import { AppRequest } from "../lib/http/http.js";
import { blueskyByokLimiter, enforceRateLimit } from "../lib/ratelimit.js";
import { mirrorProfileImageToR2, resolveProfileImageUrl } from "../lib/mirror-profile-image.js";

/** Invisible characters pasted along with a handle (zero-width, bidi marks). */
const INVISIBLE_CHARS = /[\u200B-\u200D\uFEFF\u202A-\u202E]/g;

/**
 * A Bluesky handle is a domain name: `alice.bsky.social`, or a custom domain
 * such as `alice.com`. A bare `alice` is expanded to `alice.bsky.social`
 * below. A leading `@` is optional.
 */
const HANDLE_PATTERN =
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/i;

const byokSchema = z.object({
  handle: z
    .string()
    .min(1, "Handle is required")
    .refine(
      (val) =>
        HANDLE_PATTERN.test(val.trim().replace(INVISIBLE_CHARS, "").replace(/^@/, "")),
      "Enter your Bluesky handle, like alice.bsky.social or your own domain",
    ),
  appPassword: z.string().min(1, "App password is required"),
});

export async function blueskyByok(req: AppRequest) {
  try {
    const session = await getRouteSession();

    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { requireWorkspacePermissionForUser } = await import(
      "../lib/workspace/session.js"
    );
    const ws = await requireWorkspacePermissionForUser(
      session.user.id,
      "manage_connections",
    );
    if (!ws.ok) {
      return Response.json({ error: ws.error }, { status: ws.statusCode });
    }
    const resourceUserId = ws.ctx.resourceUserId;
    const workspaceId = ws.ctx.workspaceId;

    const rate = await enforceRateLimit(blueskyByokLimiter, session.user.id);
    if (!rate.allowed) {
      return Response.json({ error: rate.error }, { status: rate.status });
    }

    const body = await req.json();
    const validated = byokSchema.parse(body);

    // Normalize handle (remove @ if present, ensure it's a full handle)
    let handle = validated.handle.trim().replace(INVISIBLE_CHARS, "");
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
        eq(connectedAccounts.userId, resourceUserId),
        eq(connectedAccounts.platform, "bluesky"),
        eq(connectedAccounts.platformUserId, userInfo.id),
        workspaceId
          ? eq(connectedAccounts.workspaceId, workspaceId)
          : isNull(connectedAccounts.workspaceId),
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
    const profileImageUrl = resolveProfileImageUrl(
      await mirrorProfileImageToR2(userInfo.profileImageUrl, {
        userId: resourceUserId,
        accountId,
        platform: "bluesky",
      }),
      existing?.profileImageUrl,
    );

    if (existing) {
      // Update existing account. isActive stays as stored: the plan cap owns
      // it (syncConnectedAccountsToLimit), a reconnect does not grant it.
      await db
        .update(connectedAccounts)
        .set({
          encryptedAccessToken,
          encryptedRefreshToken,
          platformUserId: userInfo.id,
          platformUsername: userInfo.username,
          profileImageUrl,
          platformMetadata: reconnectedAtPatch(),
          updatedAt: new Date(),
        })
        .where(eq(connectedAccounts.id, existing.id));

      return Response.json({
        success: true,
        username: userInfo.username,
        message: "Bluesky account updated successfully",
      });
    } else {
      const limitCheck = await checkAccountLimits(resourceUserId, "bluesky");
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
        userId: resourceUserId,
        workspaceId,
        platform: "bluesky",
        platformUserId: userInfo.id,
        platformUsername: userInfo.username,
        profileImageUrl,
        encryptedAccessToken,
        encryptedRefreshToken,
        tokenExpiresAt: null, // App passwords don't expire
        isActive: true,
      });
      // Agency bills accounts above 59: update the add-on (never blocks).
      queueAgencyExtraAccountsSync(resourceUserId, "connect");

      return Response.json({
        success: true,
        username: userInfo.username,
        message: "Bluesky account connected successfully",
      });
    }
  } catch (err) {
    if (err instanceof z.ZodError) {
      // The connect dialog shows `message` (then `error`) as-is.
      const message = err.errors[0]?.message ?? "Check your handle and app password.";
      return Response.json(
        {
          error: message,
          message,
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
