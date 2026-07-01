import { auth } from "../../lib/auth.js";
import { db } from "../../db/index.js";
import { connectedAccounts } from "../../db/schema.js";
import { and, eq } from "drizzle-orm";
import { headers } from "../../lib/http/request-cookies.js";
import { AppRequest } from "../../lib/http/http.js";

/**
 * PUT { accountId, boardId } – save the user's default Pinterest board for this
 * connected account. Stored in platformMetadata.pinterestDefaultBoardId so the
 * board is pre-selected next time.
 */
export async function setDefaultPinterestBoard(req: AppRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: { accountId?: string; boardId?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }
  const { accountId, boardId } = body;
  if (!accountId || typeof boardId !== "string" || !boardId.trim()) {
    return Response.json(
      { error: "accountId and boardId are required" },
      { status: 400 },
    );
  }

  const [account] = await db
    .select({
      id: connectedAccounts.id,
      platform: connectedAccounts.platform,
      platformMetadata: connectedAccounts.platformMetadata,
    })
    .from(connectedAccounts)
    .where(
      and(
        eq(connectedAccounts.id, accountId),
        eq(connectedAccounts.userId, session.user.id),
      ),
    )
    .limit(1);

  if (!account || account.platform !== "pinterest") {
    return Response.json(
      { error: "Account not found or not Pinterest" },
      { status: 404 },
    );
  }

  const current = (account.platformMetadata as Record<string, unknown>) ?? {};
  const nextMetadata: Record<string, unknown> = {
    ...current,
    pinterestDefaultBoardId: boardId.trim(),
  };

  await db
    .update(connectedAccounts)
    .set({
      platformMetadata: nextMetadata,
      updatedAt: new Date(),
    })
    .where(eq(connectedAccounts.id, accountId));

  return Response.json({ ok: true });
}
