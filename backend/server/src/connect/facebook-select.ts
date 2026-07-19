import { auth } from "../lib/auth.js";
import { db } from "../db/index.js";
import { verification, connectedAccounts } from "../db/schema.js";
import { eq, and, isNull } from "drizzle-orm";
import { headers } from "../lib/http/request-cookies.js";
import { decryptToken, encryptToken } from "@social0/shared";
import { getRemainingSlots } from "../lib/connections.js";
import { AppRequest } from "../lib/http/http.js";
import crypto from "crypto";
import { connectSelectSuccessUrl } from "../lib/app-url.js";
import { mirrorProfileImageToR2, resolveProfileImageUrl } from "../lib/mirror-profile-image.js";

export async function fbSelectGet(req: AppRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
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

  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");

  if (!token) {
    return Response.json({ error: "Token required" }, { status: 400 });
  }

  const record = await db.query.verification.findFirst({
    where: eq(verification.id, token),
  });

  if (!record || record.identifier !== "facebook_pages") {
    return Response.json({ error: "Invalid or expired token" }, { status: 400 });
  }

  if (new Date(record.expiresAt) < new Date()) {
    return Response.json({ error: "Token expired" }, { status: 400 });
  }

  try {
    const payload = JSON.parse(decryptToken(record.value, token));
    if (payload.userId !== resourceUserId) {
      return Response.json({ error: "Unauthorized" }, { status: 403 });
    }

    const rawPages = Array.isArray(payload.pages) ? payload.pages : [];
    const pages = rawPages as Array<{
      id: string;
      name: string;
      access_token: string;
      pictureUrl: string | null;
    }>;

    return Response.json({
      pages: pages.map((p) => ({
        id: p.id,
        name: p.name,
        pictureUrl: p.pictureUrl,
      })),
    });
  } catch {
    return Response.json({ error: "Invalid token data" }, { status: 400 });
  }
}

export async function fbSelectPost(req: AppRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
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

  const redirectTo = connectSelectSuccessUrl("facebook", returnTo, req);

  const record = await db.query.verification.findFirst({
    where: eq(verification.id, token),
  });

  if (!record || record.identifier !== "facebook_pages") {
    return Response.json({ error: "Invalid or expired token" }, { status: 400 });
  }

  if (new Date(record.expiresAt) < new Date()) {
    return Response.json({ error: "Token expired" }, { status: 400 });
  }

  let payload: {
    userId: string;
    workspaceId?: string | null;
    pages: Array<{
      id: string;
      name: string;
      access_token: string;
      pictureUrl: string | null;
    }>;
  };
  try {
    payload = JSON.parse(decryptToken(record.value, token));
  } catch {
    return Response.json({ error: "Invalid token data" }, { status: 400 });
  }

  if (payload.userId !== resourceUserId) {
    return Response.json({ error: "Unauthorized" }, { status: 403 });
  }

  // Prefer OAuth-start workspace so a mid-flow Main switch can't mis-scope the insert.
  const workspaceId =
    typeof payload.workspaceId === "string"
      ? payload.workspaceId
      : payload.workspaceId === null
        ? null
        : ws.ctx.workspaceId;

  const page = payload.pages.find((p) => p.id === pageId);
  if (!page) {
    return Response.json({ error: "Page not found" }, { status: 400 });
  }

  const existing = await db.query.connectedAccounts.findFirst({
    where: and(
      eq(connectedAccounts.userId, resourceUserId),
      eq(connectedAccounts.platform, "facebook"),
      eq(connectedAccounts.platformUserId, page.id),
      workspaceId
        ? eq(connectedAccounts.workspaceId, workspaceId)
        : isNull(connectedAccounts.workspaceId),
    ),
  });

  if (!existing) {
    const remaining = await getRemainingSlots(resourceUserId);
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
  }

  const accountId = existing?.id ?? crypto.randomUUID();
  const encryptedAccess = encryptToken(page.access_token, accountId);
  const profileImageUrl = resolveProfileImageUrl(
    await mirrorProfileImageToR2(page.pictureUrl, {
      userId: resourceUserId,
      accountId,
      platform: "facebook",
    }),
    existing?.profileImageUrl,
  );

  if (existing) {
    await db
      .update(connectedAccounts)
      .set({
        encryptedAccessToken: encryptedAccess,
        encryptedRefreshToken: null,
        tokenExpiresAt: null,
        platformUsername: page.name,
        profileImageUrl,
        isActive: true,
        updatedAt: new Date(),
      })
      .where(eq(connectedAccounts.id, existing.id));
  } else {
    await db.insert(connectedAccounts).values({
      id: accountId,
      userId: resourceUserId,
      workspaceId,
      platform: "facebook",
      platformUserId: page.id,
      platformUsername: page.name,
      profileImageUrl,
      encryptedAccessToken: encryptedAccess,
      encryptedRefreshToken: null,
      tokenExpiresAt: null,
      isActive: true,
    });
  }

  await db.delete(verification).where(eq(verification.id, token));

  return Response.json({ redirectUrl: redirectTo });
}
