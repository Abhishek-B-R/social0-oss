import { auth } from "@/lib/auth";
import { db } from "@/db";
import { verification } from "@/db/schema";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { decryptToken } from "@/lib/encryption";
import { NextRequest } from "next/server";

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

    const pages = payload.pages as Array<{
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
