import { auth } from "../lib/auth.js";
import { db } from "../db/index.js";
import { verification, connectedAccounts } from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { headers } from "../lib/shim/next-headers.js";
import { decryptToken, encryptToken } from "../lib/encryption.js";
import { getRemainingSlots } from "../lib/connections.js";
import { NextRequest, NextResponse } from "../lib/shim/next-server.js";
import crypto from "crypto";
import { resolveAppUrlFromRequest } from "../lib/app-url.js";
import { sanitizeReturnToPath } from "../lib/safe-return-to.js";

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");

  if (!token) {
    return Response.json({ error: "Token required" }, { status: 400 });
  }

  const record = await db.query.verification.findFirst({
    where: eq(verification.id, token),
  });

  if (!record || record.identifier !== "instagram_facebook_pages") {
    return Response.json({ error: "Invalid or expired token" }, { status: 400 });
  }

  if (new Date(record.expiresAt) < new Date()) {
    return Response.json({ error: "Token expired" }, { status: 400 });
  }

  try {
    const payload = JSON.parse(decryptToken(record.value, token));
    if (payload.userId !== session.user.id) {
      return Response.json({ error: "Unauthorized" }, { status: 403 });
    }

    const rawPages = Array.isArray(payload.pages) ? payload.pages : [];
    const pages = rawPages as Array<{
      pageId: string;
      pageName: string;
      instagramAccountId: string;
      instagramUsername: string | null;
      instagramProfilePictureUrl: string | null;
    }>;

    return Response.json({
      pages: pages.map((p) => ({
        pageId: p.pageId,
        pageName: p.pageName,
        instagramAccountId: p.instagramAccountId,
        instagramUsername: p.instagramUsername,
        instagramProfilePictureUrl: p.instagramProfilePictureUrl,
      })),
    });
  } catch {
    return Response.json({ error: "Invalid token data" }, { status: 400 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { token?: string; pageId?: string; returnTo?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { token, pageId, returnTo } = body;
  if (!token || !pageId) {
    return Response.json(
      { error: "token and pageId required" },
      { status: 400 },
    );
  }

  const safeReturnTo = sanitizeReturnToPath(returnTo);
  const baseUrl = resolveAppUrlFromRequest(req);
  const redirectTo = safeReturnTo
    ? `${baseUrl}${safeReturnTo}${safeReturnTo.includes("?") ? "&" : "?"}success=instagram`
    : `${baseUrl}/dashboard/connections?success=instagram`;

  const record = await db.query.verification.findFirst({
    where: eq(verification.id, token),
  });

  if (!record || record.identifier !== "instagram_facebook_pages") {
    return Response.json({ error: "Invalid or expired token" }, { status: 400 });
  }

  if (new Date(record.expiresAt) < new Date()) {
    return Response.json({ error: "Token expired" }, { status: 400 });
  }

  let payload: {
    userId: string;
    pages: Array<{
      pageId: string;
      pageName: string;
      pageAccessToken: string;
      instagramAccountId: string;
      instagramUsername: string | null;
      instagramProfilePictureUrl: string | null;
    }>;
  };
  try {
    payload = JSON.parse(decryptToken(record.value, token));
  } catch {
    return Response.json({ error: "Invalid token data" }, { status: 400 });
  }

  if (payload.userId !== session.user.id) {
    return Response.json({ error: "Unauthorized" }, { status: 403 });
  }

  const pageData = payload.pages.find((p) => p.pageId === pageId);
  if (!pageData) {
    return Response.json({ error: "Page not found" }, { status: 400 });
  }

  const existing = await db.query.connectedAccounts.findFirst({
    where: and(
      eq(connectedAccounts.userId, session.user.id),
      eq(connectedAccounts.platform, "instagram"),
      eq(connectedAccounts.platformUserId, pageData.instagramAccountId),
    ),
  });

  if (existing) {
    await db
      .update(connectedAccounts)
      .set({
        encryptedAccessToken: encryptToken(pageData.pageAccessToken, existing.id),
        encryptedRefreshToken: null,
        tokenExpiresAt: null,
        platformUsername: pageData.instagramUsername,
        profileImageUrl: pageData.instagramProfilePictureUrl,
        platformMetadata: {
          facebookPageId: pageData.pageId,
          instagramBusinessAccountId: pageData.instagramAccountId,
          connectionMethod: "facebook-page",
        },
        isActive: true,
        updatedAt: new Date(),
      })
      .where(eq(connectedAccounts.id, existing.id));
  } else {
    const remaining = await getRemainingSlots(session.user.id);
    if (remaining <= 0) {
      return Response.json(
        {
          error: "limit_reached",
          message:
            "You need an active plan to connect accounts and post content.",
        },
        { status: 403 },
      );
    }
    const accountId = crypto.randomUUID();
    await db.insert(connectedAccounts).values({
      id: accountId,
      userId: session.user.id,
      platform: "instagram",
      platformUserId: pageData.instagramAccountId,
      platformUsername: pageData.instagramUsername,
      profileImageUrl: pageData.instagramProfilePictureUrl,
      encryptedAccessToken: encryptToken(pageData.pageAccessToken, accountId),
      encryptedRefreshToken: null,
      tokenExpiresAt: null,
      isActive: true,
      platformMetadata: {
        facebookPageId: pageData.pageId,
        instagramBusinessAccountId: pageData.instagramAccountId,
        connectionMethod: "facebook-page",
      },
    });
  }

  await db.delete(verification).where(eq(verification.id, token));

  // NOTE: Using NextResponse.redirect() (not next/navigation redirect()) — this does NOT throw
  // a NEXT_REDIRECT error, so no rethrowNextRedirect() guard is needed here.
  // If you ever add a try/catch wrapping this line, use NextResponse.redirect() or
  // call rethrowNextRedirect(err) at the top of the catch to avoid swallowing redirects.
  return NextResponse.redirect(redirectTo);
}
