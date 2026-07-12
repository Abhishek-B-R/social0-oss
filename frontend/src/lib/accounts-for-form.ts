import { NEVER_EXPIRES_PLATFORMS } from "@social0/shared/browser";
import { PLATFORMS } from "@/lib/platforms";

const platformOrder: string[] = PLATFORMS.map((p) => p.id);
const skipExpiryDisplay = new Set(["youtube", "tiktok"]);

export type ApiAccountRow = {
  id: string;
  platform: string;
  platformUsername: string | null;
  profileImageUrl: string | null;
  isActive: boolean | null;
  isTwitterPremium?: boolean | null;
  tokenExpiresAt?: string | null;
  tokenStatus?: string | null;
  platformMetadata?: Record<string, unknown> | null;
};

export type AccountForForm = {
  id: string;
  platform: string;
  platformUsername: string | null;
  profileImageUrl: string | null;
  isActive: boolean | null;
  isTwitterPremium: boolean;
  tokenExpired: boolean;
  platformMetadata?: Record<string, unknown>;
};

function sortByPlatformOrder<T extends { platform: string }>(accounts: T[]): T[] {
  return [...accounts].sort(
    (a, b) =>
      platformOrder.indexOf(a.platform) - platformOrder.indexOf(b.platform),
  );
}

export function transformAccountsForForm(
  rows: ApiAccountRow[],
  allowedPlatforms?: Set<string> | null,
): AccountForForm[] {
  const now = Date.now();
  const filtered = rows.filter((a) => {
    if (a.isActive === false) return false;
    if (allowedPlatforms && !allowedPlatforms.has(a.platform)) return false;
    return true;
  });
  return sortByPlatformOrder(filtered).map((a) => ({
    id: a.id,
    platform: a.platform,
    platformUsername: a.platformUsername,
    profileImageUrl: a.profileImageUrl,
    isActive: a.isActive,
    isTwitterPremium: a.isTwitterPremium ?? false,
    tokenExpired: NEVER_EXPIRES_PLATFORMS.has(a.platform)
      ? false
      : a.tokenStatus === "expired" ||
          (!skipExpiryDisplay.has(a.platform) &&
            !!a.tokenExpiresAt &&
            new Date(a.tokenExpiresAt).getTime() < now),
    platformMetadata: a.platformMetadata ?? undefined,
  }));
}
