import { constantTimeEquals } from "./validation.js";

function expectedCronSecret(): string | undefined {
  const raw = process.env.CRON_SECRET;
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function bearerTokenFromAuthorizationHeader(
  authHeader: string | undefined,
): string | null {
  if (!authHeader) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  if (!match?.[1]) return null;
  const token = match[1].trim();
  return token.length > 0 ? token : null;
}

/** Fastify / Node incoming headers (authorization is lowercased). */
export function verifyCronSecretFromAuthorizationHeader(
  authorization: string | string[] | undefined,
): boolean {
  const expected = expectedCronSecret();
  if (!expected) return false;

  const raw = Array.isArray(authorization) ? authorization[0] : authorization;
  const token = bearerTokenFromAuthorizationHeader(raw);
  if (!token) return false;
  return constantTimeEquals(token, expected);
}

/**
 * Verifies cron auth (Bearer token === CRON_SECRET). Returns an error Response
 * to send, or null if the request is authorized.
 */
export function verifyCronAuth(request: Request): Response | null {
  const expected = expectedCronSecret();
  if (!expected) {
    return Response.json({ error: "Cron not configured" }, { status: 503 });
  }
  const token = bearerTokenFromAuthorizationHeader(
    request.headers.get("authorization") ?? undefined,
  );
  if (!token || !constantTimeEquals(token, expected)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
