import { auth } from "../../lib/auth.js";
import { db } from "../../db/index.js";
import { connectedAccounts } from "../../db/schema.js";
import { and, eq } from "drizzle-orm";
import { getValidToken } from "../../lib/token-refresh.js";
import { headers } from "../../lib/http/request-cookies.js";
import { AppRequest } from "../../lib/http/http.js";


/**
 * Resolve a Pinterest account the caller is allowed to act on, or the response
 * that says why not.
 *
 * Both handlers below did this, and it is the whole authorization story for
 * these routes: the workspace permission check and, just as importantly,
 * `connectionScopeCondition`, which keeps the lookup inside the caller's
 * workspace so an account id from another team resolves to nothing rather than
 * to someone else's Pinterest connection.
 */
async function resolvePinterestAccount(
  userId: string,
  accountId: string,
  permission: "view_connections" | "manage_connections",
): Promise<
  { account: { id: string; platform: string } } | { error: Response }
> {
  const { requireWorkspacePermissionForUser } = await import(
    "../../lib/workspace/session.js"
  );
  const { connectionScopeCondition } = await import(
    "../../lib/workspace/context.js"
  );

  const ws = await requireWorkspacePermissionForUser(userId, permission);
  if (!ws.ok) {
    return {
      error: Response.json({ error: ws.error }, { status: ws.statusCode }),
    };
  }

  const [account] = await db
    .select({ id: connectedAccounts.id, platform: connectedAccounts.platform })
    .from(connectedAccounts)
    .where(
      and(eq(connectedAccounts.id, accountId), connectionScopeCondition(ws.ctx)),
    )
    .limit(1);

  if (!account || account.platform !== "pinterest") {
    return {
      error: Response.json(
        { error: "Account not found or not Pinterest" },
        { status: 404 },
      ),
    };
  }

  return { account };
}

/** GET ?accountId=xxx – returns boards for the given Pinterest account (must be owned by current user). */
export async function listPinterestBoards(req: AppRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const accountId = req.parsedUrl.searchParams.get("accountId");
  if (!accountId) {
    return Response.json({ error: "accountId is required" }, { status: 400 });
  }

  const resolved = await resolvePinterestAccount(
    session.user.id,
    accountId,
    "view_connections",
  );
  if ("error" in resolved) return resolved.error;
  const { account } = resolved;

  try {
    const accessToken = await getValidToken(account.id, "pinterest");
    const boardsRes = await fetch("https://api.pinterest.com/v5/boards", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = (await boardsRes.json().catch(() => ({}))) as {
      items?: { id: string; name?: string }[];
      message?: string;
    };
    if (!boardsRes.ok) {
      return Response.json(
        { error: data.message ?? "Failed to fetch boards" },
        { status: boardsRes.status >= 500 ? 502 : 400 },
      );
    }
    const boards = (data.items ?? []).map((b) => ({
      id: b.id,
      name: b.name ?? b.id,
    }));
    return Response.json({ boards });
  } catch (e) {
    const err = e instanceof Error ? e.message : "Failed to fetch boards";
    return Response.json({ error: err }, { status: 500 });
  }
}

function toPinterestPrivacy(p: string): "PUBLIC" | "SECRET" {
  return p === "PRIVATE" ? "SECRET" : "PUBLIC";
}

/** POST { accountId, name, privacy: "PUBLIC"|"PRIVATE" } – create a board for the given Pinterest account. */
export async function savePinterestBoard(req: AppRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: { accountId?: string; name?: string; privacy?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }
  const { accountId, name, privacy } = body;
  if (!accountId || !name?.trim() || (privacy !== "PUBLIC" && privacy !== "PRIVATE")) {
    return Response.json(
      { error: "accountId, name, and privacy (PUBLIC|PRIVATE) are required" },
      { status: 400 },
    );
  }

  const resolved = await resolvePinterestAccount(
    session.user.id,
    accountId,
    "manage_connections",
  );
  if ("error" in resolved) return resolved.error;
  const { account } = resolved;

  try {
    const accessToken = await getValidToken(account.id, "pinterest");
    const createRes = await fetch("https://api.pinterest.com/v5/boards", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: name.trim(),
        privacy: toPinterestPrivacy(privacy),
      }),
    });
    const createData = (await createRes.json().catch(() => ({}))) as {
      id?: string;
      name?: string;
      message?: string;
    };
    if (!createRes.ok) {
      return Response.json(
        { error: createData.message ?? "Failed to create board" },
        { status: createRes.status >= 500 ? 502 : 400 },
      );
    }
    if (!createData.id) {
      return Response.json(
        { error: "Board created but no id returned" },
        { status: 502 },
      );
    }
    return Response.json({
      board: { id: createData.id, name: createData.name ?? name.trim() },
    });
  } catch (e) {
    const err = e instanceof Error ? e.message : "Failed to create board";
    return Response.json({ error: err }, { status: 500 });
  }
}
