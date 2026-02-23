import { auth } from "@/lib/auth";
import { db } from "@/db";
import {
  connectedAccounts,
  postPublications,
  posts,
  platformRateLimits,
} from "@/db/schema";
import { eq, and, inArray, count } from "drizzle-orm";
import { headers } from "next/headers";

type RouteParams = { params: Promise<{ id: string }> };

/** GET returns account info and publication count for the disconnect confirmation modal. */
export async function GET(_request: Request, { params }: RouteParams) {
  const { id: accountId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [account] = await db
    .select({
      id: connectedAccounts.id,
      platform: connectedAccounts.platform,
      platformUsername: connectedAccounts.platformUsername,
    })
    .from(connectedAccounts)
    .where(
      and(
        eq(connectedAccounts.id, accountId),
        eq(connectedAccounts.userId, session.user.id)
      )
    )
    .limit(1);

  if (!account) {
    return Response.json({ error: "Account not found" }, { status: 404 });
  }

  const [row] = await db
    .select({ value: count() })
    .from(postPublications)
    .where(eq(postPublications.connectedAccountId, accountId));

  const publicationCount = Number(row?.value ?? 0);

  return Response.json({
    ...account,
    publicationCount,
  });
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const { id: accountId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [account] = await db
    .select()
    .from(connectedAccounts)
    .where(
      and(
        eq(connectedAccounts.id, accountId),
        eq(connectedAccounts.userId, session.user.id)
      )
    )
    .limit(1);

  if (!account) {
    return Response.json({ error: "Account not found" }, { status: 404 });
  }

  // Cascade: 1) Delete all post_publications for this account
  await db
    .delete(postPublications)
    .where(eq(postPublications.connectedAccountId, accountId));

  // 2) Delete posts that now have zero publications
  const postIdsWithPublications = await db
    .selectDistinct({ postId: postPublications.postId })
    .from(postPublications);
  const remainingPostIds = new Set(
    postIdsWithPublications.map((r) => r.postId)
  );
  const allPostIds = await db
    .select({ id: posts.id })
    .from(posts)
    .where(eq(posts.userId, session.user.id));
  const orphanedPostIds = allPostIds
    .filter((p) => !remainingPostIds.has(p.id))
    .map((p) => p.id);
  if (orphanedPostIds.length > 0) {
    await db.delete(posts).where(inArray(posts.id, orphanedPostIds));
  }

  // 3) Delete platform_rate_limits for this account (if any)
  await db
    .delete(platformRateLimits)
    .where(eq(platformRateLimits.connectedAccountId, accountId));

  // 4) Delete the connected account
  await db
    .delete(connectedAccounts)
    .where(eq(connectedAccounts.id, accountId));

  return Response.json({ success: true });
}
