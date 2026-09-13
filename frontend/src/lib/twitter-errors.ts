/**
 * Presentation of X/Twitter publish errors the API has already stored.
 *
 * This file used to mirror the backend's publish-time parser — unwrapping
 * thrown `twitter-api-v2` errors, digging through `.response.data`, logging
 * generic SDK failures. The SPA never calls the X API, so none of that ever
 * ran here: it only renders `post_publications.last_error` strings. What is
 * left is the formatting those strings need.
 */

const TWITTER_403_DUPLICATE_HINT =
  " This may happen if this tweet was already published-X won't post the exact same content twice.";

function parseHttpStatusFromMessage(message: string): number | undefined {
  const codeMatch =
    message.match(/(?:code|HTTP)\s*(\d{3})\b/i) ??
    message.match(/\b(4\d{2}|5\d{2})\b/);
  if (codeMatch) {
    const n = parseInt(codeMatch[1], 10);
    if (n >= 400 && n < 600) return n;
  }
  return undefined;
}

function appendTwitter403DuplicateHint(
  message: string,
  httpStatus: number | undefined,
): string {
  const is403 =
    httpStatus === 403 ||
    /\b403\b/.test(message) ||
    /code\s*403/i.test(message);
  if (!is403) return message;
  if (
    /duplicate|already\s+(been\s+)?sent|same\s+content|status\s*187|\b187\b|forbidden/i.test(
      message,
    )
  ) {
    return message;
  }
  return message.endsWith(".")
    ? `${message}${TWITTER_403_DUPLICATE_HINT}`
    : `${message}.${TWITTER_403_DUPLICATE_HINT}`;
}

/** Matches `connectedAccounts.platform` for X/Twitter in this app. */
export function isTwitterPlatformId(
  platform: string | null | undefined,
): boolean {
  if (!platform) return false;
  const p = platform.toLowerCase();
  return p === "twitter" || p === "twitter_x" || p === "x";
}

/**
 * Enrich a persisted error for UI (post detail, lists). The DB often stores raw
 * SDK strings like "Request failed with code 403" without publish-time formatting.
 */
export function enrichTwitterErrorForDisplay(message: string): string {
  if (
    /maxFileSizeExceeded|File size exceeds/i.test(message) ||
    /maxFileSize(?:Bytes|Byes)/i.test(message)
  ) {
    const bytesMatch = message.match(
      /(?:maxFileSize(?:Bytes|Byes)|exceeds)\D*(\d{5,})/i,
    );
    const bytes = bytesMatch ? parseInt(bytesMatch[1], 10) : 5_242_880;
    const mb = (bytes / (1024 * 1024)).toFixed(bytes % (1024 * 1024) === 0 ? 0 : 1);
    return `Image is too large for X (maximum ${mb} MB). Use a smaller or compressed image and try again.`;
  }

  const httpStatus = parseHttpStatusFromMessage(message);
  return appendTwitter403DuplicateHint(message, httpStatus);
}
