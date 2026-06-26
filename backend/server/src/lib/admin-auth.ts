import { constantTimeEquals } from "./validation.js";
import { env } from "./env.js";

function bearerToken(
  authorization: string | string[] | undefined,
): string | null {
  const raw = Array.isArray(authorization) ? authorization[0] : authorization;
  if (!raw?.startsWith("Bearer ")) return null;
  const token = raw.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

/** Verifies admin Bearer token (ADMIN_API_KEY only - never falls back to CRON_SECRET). */
export function verifyAdminRequest(request: {
  headers: Record<string, unknown>;
}): boolean {
  const key = env.ADMIN_API_KEY?.trim();
  if (!key) return false;
  const auth = request.headers.authorization;
  const header =
    typeof auth === "string" ? auth : Array.isArray(auth) ? auth[0] : undefined;
  const token = bearerToken(header);
  if (!token) return false;
  return constantTimeEquals(token, key);
}
