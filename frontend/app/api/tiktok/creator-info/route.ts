import { auth } from "@/lib/auth";
import { db } from "@/db";
import { connectedAccounts } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getValidToken } from "@/lib/token-refresh";
import { headers } from "next/headers";
import { NextRequest } from "next/server";

/** GET ?accountId=xxx – returns TikTok creator info for the given account (must be owned by current user). */
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accountId = req.nextUrl.searchParams.get("accountId");
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

  if (!account || account.platform !== "tiktok") {
    return Response.json(
      { error: "Account not found or not TikTok" },
      { status: 404 },
    );
  }

  try {
    const accessToken = await getValidToken(account.id, "tiktok");

    const res = await fetch(
      "https://open.tiktokapis.com/v2/post/publish/creator_info/query/",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=UTF-8",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({}),
      },
    );

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return Response.json(
        { error: data?.error?.message ?? "Failed to fetch creator info" },
        { status: res.status >= 500 ? 502 : 400 },
      );
    }

    return Response.json(data);
  } catch (e) {
    const err = e instanceof Error ? e.message : "Failed to fetch creator info";
    return Response.json({ error: err }, { status: 500 });
  }
}
