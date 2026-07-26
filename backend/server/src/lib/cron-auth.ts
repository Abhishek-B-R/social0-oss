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
