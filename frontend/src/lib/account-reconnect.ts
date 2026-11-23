import { apiUrl } from "@/lib/env";

export type ReconnectableAccount = {
  id: string;
  platform: string;
  /** Instagram: "direct" | "facebook-page" */
  connectionMethod?: string | null;
};

/**
 * OAuth re-auth URL for an existing connected account. Always re-auths the
 * same row: expired Instagram used to hit /connect/instagram without an
 * accountId, which created a broken @user duplicate.
 *
 * Bluesky has no OAuth re-auth (it connects with an app password), so it
 * opens the account's drawer in the app, which has "Update app password".
 * The personal path is mapped into the team tree by PersonalWorkspaceBoot.
 */
export function reconnectUrl(account: ReconnectableAccount): string {
  if (account.platform === "bluesky") {
    return `/dashboard/connections?account=${encodeURIComponent(account.id)}`;
  }
  if (account.platform === "instagram") {
    if (account.connectionMethod === "facebook-page") {
      return apiUrl(
        `/api/connect/instagram-facebook?reauth=1&accountId=${encodeURIComponent(account.id)}`,
      );
    }
    return apiUrl(
      `/api/connect/instagram/reauth?accountId=${encodeURIComponent(account.id)}`,
    );
  }
  return apiUrl(
    `/api/connect/${account.platform}/reauth?accountId=${encodeURIComponent(account.id)}`,
  );
}
