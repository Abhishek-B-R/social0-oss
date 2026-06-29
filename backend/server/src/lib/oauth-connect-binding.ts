import { db } from "../db/index.js";
import { verification } from "../db/schema.js";
import { and, eq, gt } from "drizzle-orm";
import { randomBytes } from "crypto";
import { cookies } from "./shim/request-cookies.js";
import { RouteResponse } from "./shim/http.js";
import { resolveAppUrlFromRequest } from "./app-url.js";

const COOKIE_NAME = "oauth_connect_binding";
const MAX_AGE_SEC = 600;
const IDENTIFIER = "oauth_connect_binding";

function cookieOptions() {
  const baseUrl = resolveAppUrlFromRequest();
  const isHttps = baseUrl.startsWith("https://");
  return {
    httpOnly: true,
    secure: isHttps,
    sameSite: "lax" as const,
    maxAge: MAX_AGE_SEC,
    path: "/",
  };
}

/** Persist a short-lived connect intent in DB; cookie holds only the token id. */
export async function createOAuthConnectBinding(
  userId: string,
  platform: string,
): Promise<string> {
  const token = randomBytes(24).toString("hex");
  await db.insert(verification).values({
    id: token,
    identifier: IDENTIFIER,
    value: `${userId}:${platform}`,
    expiresAt: new Date(Date.now() + MAX_AGE_SEC * 1000),
  });
  return token;
}

export function attachOAuthConnectBindingCookie(
  response: { headers: Headers },
  token: string,
): { headers: Headers } {
  const opts = cookieOptions();
  const parts = [
    `${COOKIE_NAME}=${token}`,
    "Path=/",
    "HttpOnly",
    `SameSite=${opts.sameSite === "lax" ? "Lax" : opts.sameSite}`,
    `Max-Age=${MAX_AGE_SEC}`,
  ];
  if (opts.secure) parts.push("Secure");
  response.headers.append("set-cookie", parts.join("; "));
  return response;
}

/** Redirect to an external OAuth provider and set the connect-binding cookie on the response. */
export async function redirectWithOAuthConnectBinding(
  url: string,
  userId: string,
  platform: string,
): Promise<RouteResponse> {
  const token = await createOAuthConnectBinding(userId, platform);
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, cookieOptions());
  return RouteResponse.redirect(url);
}

function readBindingToken(request: Request): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(`${COOKIE_NAME}=`)) {
      return trimmed.slice(COOKIE_NAME.length + 1);
    }
  }
  return null;
}

export async function verifyOAuthConnectBinding(
  request: Request,
  expectedUserId: string,
  expectedPlatform: string,
): Promise<boolean> {
  const token = readBindingToken(request);
  if (!token) return false;

  const row = await db.query.verification.findFirst({
    where: and(
      eq(verification.id, token),
      eq(verification.identifier, IDENTIFIER),
      gt(verification.expiresAt, new Date()),
    ),
    columns: { value: true },
  });
  if (!row) return false;

  const colon = row.value.indexOf(":");
  if (colon === -1) return false;
  const userId = row.value.slice(0, colon);
  const platform = row.value.slice(colon + 1);
  return userId === expectedUserId && platform === expectedPlatform;
}

export async function clearOAuthConnectBinding(request: Request): Promise<void> {
  const token = readBindingToken(request);
  if (!token) return;
  await db.delete(verification).where(eq(verification.id, token));
}
