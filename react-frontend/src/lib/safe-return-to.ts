/** Validate an in-app redirect path (relative only, no open redirects). */
export function sanitizeReturnToPath(path: unknown): string | null {
  if (typeof path !== "string") return null;
  const trimmed = path.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return null;
  if (trimmed.includes("\\") || trimmed.includes("\0")) return null;
  return trimmed;
}
