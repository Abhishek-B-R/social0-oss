import { auth } from "@/lib/auth";
import { db } from "@/db";
import { connectedAccounts } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import {
  fetchAvatarBytes,
  fetchRemoteAvatarUrl,
} from "@/lib/account-avatar";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: accountId } = await params;

  const account = await db.query.connectedAccounts.findFirst({
    where: and(
      eq(connectedAccounts.id, accountId),
      eq(connectedAccounts.userId, session.user.id),
    ),
    columns: {
      id: true,
      platform: true,
      platformUserId: true,
      profileImageUrl: true,
      platformMetadata: true,
    },
  });

  if (!account) {
    return Response.json({ error: "Account not found" }, { status: 404 });
  }

  const remoteUrl = await fetchRemoteAvatarUrl({
    id: account.id,
    platform: account.platform,
    platformUserId: account.platformUserId,
    profileImageUrl: account.profileImageUrl,
    platformMetadata: account.platformMetadata,
  });

  if (!remoteUrl) {
    return Response.json({ error: "Avatar not available" }, { status: 404 });
  }

  const image = await fetchAvatarBytes(remoteUrl, account.platform);
  if (!image) {
    return Response.json({ error: "Failed to load avatar" }, { status: 502 });
  }

  return new Response(image.body, {
    headers: {
      "Content-Type": image.contentType,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
