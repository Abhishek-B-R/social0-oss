import { constantTimeEquals } from "@/lib/validation";

/**
 * Verifies cron auth (Bearer token === CRON_SECRET). Returns an error Response
 * to send, or null if the request is authorized.
 */
export function verifyCronAuth(request: Request): Response | null {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return Response.json({ error: "Cron not configured" }, { status: 503 });
  }
  const authHeader = request.headers.get("authorization");
  if (
    !authHeader ||
    !authHeader.startsWith("Bearer ") ||
    !constantTimeEquals(authHeader.slice(7), expected)
  ) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
