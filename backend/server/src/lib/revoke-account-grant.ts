import { and, eq, ne, or } from "drizzle-orm";
import { decryptToken } from "@social0/shared";
import { db } from "../db/index.js";
import { connectedAccounts } from "../db/schema.js";
import { revokeTokenOnPlatform } from "./revoke-token.js";

type DisconnectedAccount = {
  id: string;
  userId: string;
  platform: (typeof connectedAccounts.$inferSelect)["platform"];
  platformUserId: string;
  encryptedAccessToken: string;
  encryptedRefreshToken: string | null;
};

type RevokeOptions = {
  /**
   * Ids of rows deleted in the same operation (account deletion removes every
   * row the user holds). They do not keep the grant alive.
   */
  removingWith?: ReadonlySet<string>;
};

function tryDecrypt(value: string | null, accountId: string): string | null {
  if (!value) return null;
  try {
    return decryptToken(value, accountId) || null;
  } catch {
    return null;
  }
}

/**
 * Whether another connected row, of any user, still relies on the OAuth
 * grant this account holds. Revoking is grant-wide on these networks:
 * - LinkedIn: the profile and every company page picked in one connect share
 *   one token (stored once per row), and a revoke ends the member's grant.
 * - Google: revoking an access token also revokes its refresh token, so the
 *   same channel connected in another workspace stops working too.
 *
 * Team connections are stored under the team owner's id even when an admin
 * did the OAuth with their own login, so the same grant can sit behind rows
 * of different users: the admin's personal Main and the owner's workspace.
 * Rows of other users count when they are the same platform identity; one
 * connect only ever writes rows for one user, so token copies stay within
 * the owner's rows.
 */
async function grantStillInUse(
  account: DisconnectedAccount,
  removingWith: ReadonlySet<string>,
): Promise<boolean> {
  const candidates = await db
    .select({
      id: connectedAccounts.id,
      userId: connectedAccounts.userId,
      platformUserId: connectedAccounts.platformUserId,
      encryptedAccessToken: connectedAccounts.encryptedAccessToken,
      encryptedRefreshToken: connectedAccounts.encryptedRefreshToken,
    })
    .from(connectedAccounts)
    .where(
      and(
        eq(connectedAccounts.platform, account.platform),
        ne(connectedAccounts.id, account.id),
        or(
          eq(connectedAccounts.userId, account.userId),
          eq(connectedAccounts.platformUserId, account.platformUserId),
        ),
      ),
    );
  const others = candidates.filter((o) => !removingWith.has(o.id));
  if (others.length === 0) return false;
  if (others.some((o) => o.platformUserId === account.platformUserId)) {
    return true;
  }
  // Rows refresh their tokens independently, so after a refresh the copies
  // no longer match. One LinkedIn member per owner is the norm: any other
  // LinkedIn row of this owner may hold the same grant.
  if (
    account.platform === "linkedin" &&
    others.some((o) => o.userId === account.userId)
  ) {
    return true;
  }

  const access = tryDecrypt(account.encryptedAccessToken, account.id);
  const refresh = tryDecrypt(account.encryptedRefreshToken, account.id);
  return others.some((o) => {
    const otherAccess = tryDecrypt(o.encryptedAccessToken, o.id);
    const otherRefresh = tryDecrypt(o.encryptedRefreshToken, o.id);
    return (
      (!!access && otherAccess === access) ||
      (!!refresh && otherRefresh === refresh)
    );
  });
}

/**
 * Best-effort platform revoke when a connected account is deleted.
 * Skipped while another row (this owner's or another user's) still uses the
 * same grant, so disconnecting one LinkedIn page doesn't break the profile
 * and other pages, and removing a team workspace's copy of a channel doesn't
 * break the admin's personal connection. Never throws: the caller deletes
 * the row either way.
 */
export async function revokeAccountGrant(
  account: DisconnectedAccount,
  options: RevokeOptions = {},
): Promise<void> {
  try {
    if (account.platform !== "linkedin" && account.platform !== "youtube") {
      // Every other network is a no-op in revokeTokenOnPlatform.
      return;
    }
    if (await grantStillInUse(account, options.removingWith ?? new Set())) {
      return;
    }
    const accessToken = tryDecrypt(account.encryptedAccessToken, account.id);
    if (!accessToken) return;
    await revokeTokenOnPlatform(account.platform, accessToken);
  } catch (err) {
    console.warn("[revoke] grant check failed for", account.platform, err);
  }
}
