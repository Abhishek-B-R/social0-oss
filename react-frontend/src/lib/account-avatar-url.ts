function isAvatarCdnUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return (
    lower.includes("fbcdn.net") ||
    lower.includes("cdninstagram.com") ||
    lower.includes("instagram.") ||
    lower.includes("facebook.com") ||
    lower.includes("fbsbx.com") ||
    lower.includes("tiktokcdn") ||
    lower.includes("byteimg.com") ||
    lower.includes("ibytedtos.com") ||
    lower.includes("muscdn.com")
  );
}

function isProxiedCdnUrl(url: string): boolean {
  return isAvatarCdnUrl(url);
}

/** Same-origin avatar proxy for Meta/TikTok (CDN URLs expire or block hotlinking). */
export function accountAvatarSrc(
  accountId: string | undefined,
  platform: string | undefined,
  profileImageUrl: string | null | undefined,
): string | null {
  if (
    accountId &&
    (platform === "facebook" || platform === "instagram" || platform === "tiktok")
  ) {
    return `/api/accounts/${accountId}/avatar`;
  }

  const url = profileImageUrl?.trim();
  if (!url) return null;
  if (!accountId) return url;

  if (isProxiedCdnUrl(url)) {
    return `/api/accounts/${accountId}/avatar`;
  }

  return url;
}
