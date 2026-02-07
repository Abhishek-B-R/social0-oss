/**
 * Normalizes app URL for OAuth redirects
 * - Uses https by default (required by Meta/Instagram dashboard)
 * - For localhost: converts https to http automatically (since localhost typically uses http)
 * - For production: always uses https
 */
export function normalizeAppUrl(url: string): string {
  const urlObj = new URL(url);
  
  // Remove trailing slash, preserve protocol as-is
  return urlObj.toString().replace(/\/$/, "");
}