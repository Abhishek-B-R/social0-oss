import { auth } from "../../lib/auth.js";
import { db } from "../../db/index.js";
import { connectedAccounts } from "../../db/schema.js";
import { and, eq } from "drizzle-orm";
import { getValidToken } from "../../lib/token-refresh.js";
import { headers } from "../../lib/shim/request-cookies.js";
import { AppRequest } from "../../lib/shim/http.js";

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

  const [account] = await db
    .select({ id: connectedAccounts.id, platform: connectedAccounts.platform })
    .from(connectedAccounts)
    .where(
      and(
        eq(connectedAccounts.id, accountId),
        eq(connectedAccounts.userId, session.user.id),
      ),
    )
    .limit(1);

  if (!account || account.platform !== "pinterest") {
    return Response.json({ error: "Account not found or not Pinterest" }, { status: 404 });
  }

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

  const [account] = await db
    .select({ id: connectedAccounts.id, platform: connectedAccounts.platform })
    .from(connectedAccounts)
    .where(
      and(
        eq(connectedAccounts.id, accountId),
        eq(connectedAccounts.userId, session.user.id),
      ),
    )
    .limit(1);

  if (!account || account.platform !== "pinterest") {
    return Response.json({ error: "Account not found or not Pinterest" }, { status: 404 });
  }

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
