/**
 * Normalizes app URL for OAuth redirects
 * - Preserves protocol from NEXT_PUBLIC_APP_URL (https for localhost with self-signed cert, https for production)
 * - For production: always uses https
 */
export function normalizeAppUrl(url: string): string {
  const urlObj = new URL(url);

  // Production: force https
  if (urlObj.hostname !== "localhost" && urlObj.hostname !== "127.0.0.1") {
    urlObj.protocol = "https:";
  }
  // For localhost: preserve protocol (https with self-signed cert is fine for testing)
  // Note: Facebook requires HTTPS but will work with self-signed certs in dev

  // Remove trailing slash
  return urlObj.toString().replace(/\/$/, "");
}
