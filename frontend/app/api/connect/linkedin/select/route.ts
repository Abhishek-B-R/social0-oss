import { auth } from "@/lib/auth";
import { db } from "@/db";
import { verification, connectedAccounts } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { headers } from "next/headers";
import { decryptToken, encryptToken } from "@/lib/encryption";
import { checkAccountLimits } from "@/lib/plan-limits";
import { logConnectBlocked } from "@/lib/plan-analytics";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { sanitizeReturnToPath } from "@/lib/safe-return-to";

type LinkedInPayload = {
  userId: string;
  accessToken: string;
  personalProfile: {
    id: string;
    name: string;
    picture: string | null;
  };
  companyPages: Array< { id: string; urn: string; name: string } >;
};

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

  if (!record || record.identifier !== "linkedin_accounts") {
    return Response.json({ error: "Invalid or expired token" }, { status: 400 });
  }

  if (new Date(record.expiresAt) < new Date()) {
    return Response.json({ error: "Token expired" }, { status: 400 });
  }

  try {
    const raw = decryptToken(record.value, token);
    const payload = JSON.parse(raw) as LinkedInPayload;
    if (payload.userId !== session.user.id) {
      return Response.json({ error: "Unauthorized" }, { status: 403 });
    }

    return Response.json({
      personalProfile: {
        id: payload.personalProfile.id,
        name: payload.personalProfile.name,
        pictureUrl: payload.personalProfile.picture,
      },
      companyPages: payload.companyPages.map((p) => ({
        id: p.urn,
        urn: p.urn,
        name: p.name,
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

  let body: { token?: string; selectedIds?: string[]; returnTo?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { token, selectedIds, returnTo } = body;
  if (!token || !Array.isArray(selectedIds)) {
    return Response.json(
      { error: "token and selectedIds required" },
      { status: 400 },
    );
  }

  const safeReturnTo = sanitizeReturnToPath(returnTo);
  const baseUrl = new URL(req.url).origin;
  const redirectTo = safeReturnTo
    ? `${baseUrl}${safeReturnTo}${safeReturnTo.includes("?") ? "&" : "?"}success=linkedin`
    : `${baseUrl}/dashboard/connections?success=linkedin`;

  const record = await db.query.verification.findFirst({
    where: eq(verification.id, token),
  });

  if (!record || record.identifier !== "linkedin_accounts") {
    return Response.json({ error: "Invalid or expired token" }, { status: 400 });
  }

  if (new Date(record.expiresAt) < new Date()) {
    return Response.json({ error: "Token expired" }, { status: 400 });
  }

  let payload: LinkedInPayload;
  try {
    const raw = decryptToken(record.value, token);
    payload = JSON.parse(raw) as LinkedInPayload;
  } catch {
    return Response.json({ error: "Invalid token data" }, { status: 400 });
  }

  if (payload.userId !== session.user.id) {
    return Response.json({ error: "Unauthorized" }, { status: 403 });
  }

  const accessToken = payload.accessToken;
  const personalId = payload.personalProfile.id;
  const companyByUrn = new Map(payload.companyPages.map((p) => [p.urn, p]));

  type AccountToSave = {
    platformUserId: string;
    platformUsername: string | null;
    profileImageUrl: string | null;
    platformAccountType: "personal" | "company";
  };

  const toSave: AccountToSave[] = [];
  for (const id of selectedIds) {
    if (id === personalId) {
      toSave.push({
        platformUserId: personalId,
        platformUsername: payload.personalProfile.name,
        profileImageUrl: payload.personalProfile.picture,
        platformAccountType: "personal",
      });
    } else if (companyByUrn.has(id)) {
      const org = companyByUrn.get(id)!;
      toSave.push({
        platformUserId: org.urn,
        platformUsername: org.name,
        profileImageUrl: null,
        platformAccountType: "company",
      });
    }
  }

  if (toSave.length === 0) {
    return NextResponse.redirect(new URL(redirectTo, req.url));
  }

  const tokenExpiresAt = new Date(Date.now() + 3600 * 1000); // LinkedIn tokens ~1h

  for (const acc of toSave) {
    const existing = await db.query.connectedAccounts.findFirst({
      where: and(
        eq(connectedAccounts.userId, session.user.id),
        eq(connectedAccounts.platform, "linkedin"),
        eq(connectedAccounts.platformUserId, acc.platformUserId),
      ),
    });

    if (!existing) {
      const limitCheck = await checkAccountLimits(session.user.id, "linkedin");
      if (!limitCheck.allowed) {
        logConnectBlocked(
          session.user.id,
          "linkedin",
          limitCheck.reason ?? "You need an active plan to connect accounts and post content.",
          limitCheck.currentTotal,
          limitCheck.limitTotal,
        );
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
    const encryptedAccess = encryptToken(accessToken, accountId);

    if (existing) {
      await db
        .update(connectedAccounts)
        .set({
          encryptedAccessToken: encryptedAccess,
          encryptedRefreshToken: null,
          tokenExpiresAt,
          tokenStatus: "active",
          platformUsername: acc.platformUsername,
          profileImageUrl: acc.profileImageUrl,
          platformAccountType: acc.platformAccountType,
          isActive: true,
          updatedAt: new Date(),
        })
        .where(eq(connectedAccounts.id, existing.id));
    } else {
      await db.insert(connectedAccounts).values({
        id: accountId,
        userId: session.user.id,
        platform: "linkedin",
        platformUserId: acc.platformUserId,
        platformUsername: acc.platformUsername,
        profileImageUrl: acc.profileImageUrl,
        encryptedAccessToken: encryptedAccess,
        encryptedRefreshToken: null,
        tokenExpiresAt,
        tokenStatus: "active",
        isActive: true,
        platformAccountType: acc.platformAccountType,
      });
    }
  }

  await db.delete(verification).where(eq(verification.id, token));

  return NextResponse.redirect(new URL(redirectTo, req.url));
}
