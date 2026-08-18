import { decryptToken } from "@social0/shared";
import { getValidToken, REFRESHABLE_PLATFORMS } from "./token-refresh.js";

/** Decrypt / refresh the tokens we need to call a connected account's platform API. */
export async function resolveAccountAccess(account: {
  id: string;
  platform: string;
  encryptedAccessToken: string;
  encryptedRefreshToken: string | null;
}): Promise<{ accessToken: string; accessSecret: string | null }> {
  const accessToken = REFRESHABLE_PLATFORMS.has(account.platform)
    ? await getValidToken(account.id, account.platform)
    : decryptToken(account.encryptedAccessToken, account.id);

  let accessSecret: string | null = null;
  if (
    (account.platform === "twitter_x" || account.platform === "bluesky") &&
    account.encryptedRefreshToken
  ) {
    accessSecret = decryptToken(account.encryptedRefreshToken, account.id);
  }
  return { accessToken, accessSecret };
}
