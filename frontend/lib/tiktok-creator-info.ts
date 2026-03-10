import { db } from "@/db";
import { connectedAccounts } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getValidToken } from "@/lib/token-refresh";

export type TikTokCreatorInfo = {
  creator_nickname?: string;
  creator_username?: string;
};

/**
 * Fetches TikTok creator_info for an account. Caller must ensure the account
 * belongs to the given userId. Returns null if not TikTok or on error.
 */
export async function getTikTokCreatorInfo(
  accountId: string,
  userId: string,
): Promise<TikTokCreatorInfo | null> {
  const [account] = await db
    .select({ id: connectedAccounts.id, platform: connectedAccounts.platform })
    .from(connectedAccounts)
    .where(
      and(
        eq(connectedAccounts.id, accountId),
        eq(connectedAccounts.userId, userId),
      ),
    )
    .limit(1);

  if (!account || account.platform !== "tiktok") return null;

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
    if (!res.ok || !data?.data) return null;
    return {
      creator_nickname: data.data.creator_nickname,
      creator_username: data.data.creator_username,
    };
  } catch {
    return null;
  }
}
