/** Same-origin avatar proxy for Meta platforms (FB/IG CDN URLs expire or block hotlinking). */
export function accountAvatarSrc(
  accountId: string | undefined,
  platform: string | undefined,
  profileImageUrl: string | null | undefined,
): string | null {
  if (!profileImageUrl?.trim()) return null;
  if (!accountId) return profileImageUrl;

  if (platform === "facebook" || platform === "instagram") {
    return `/api/accounts/${accountId}/avatar`;
  }

  const lower = profileImageUrl.toLowerCase();
  if (
    lower.includes("fbcdn.net") ||
    lower.includes("cdninstagram.com") ||
    lower.includes("instagram.") ||
    lower.includes("facebook.com")
  ) {
    return `/api/accounts/${accountId}/avatar`;
  }

  return profileImageUrl;
}
