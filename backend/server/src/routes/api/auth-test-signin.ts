import { AppRequest, RouteResponse } from "../../lib/http/http.js";
import { db } from "../../db/index.js";
import { user, session } from "../../db/schema.js";
import { eq } from "drizzle-orm";
import { createHmac, randomBytes } from "crypto";

// The REAL user account - has all connected social media platforms
const TEST_USER_ID = process.env.TEST_USER_ID!;
const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL!;
const TEST_USER_NAME = process.env.TEST_USER_NAME!;

/**
 * Replicates better-call's serializeSignedCookie exactly:
 *   signature = base64(HMAC-SHA256(secret, token))
 *   cookieValue = encodeURIComponent(token + "." + signature)
 *
 * On read, parseCookies() calls tryDecode() → decodeURIComponent(), so the
 * decoded value "token.signature" is what getSignedCookie() verifies.
 */
function makeSignedCookieValue(token: string, secret: string): string {
  const signature = createHmac("sha256", secret).update(token).digest("base64");
  return encodeURIComponent(`${token}.${signature}`);
}

// GET /api/auth/test-signin
// Creates a properly-signed Better Auth session for the real user and
// redirects to /dashboard with the session cookie set.
// Only active when ALLOW_TEST_SIGNIN=true (set in .env.test / .env.local).
// Hard-blocked in production regardless of env var.
export async function testSignin(req: AppRequest) {
  // Hard production guard - never allow in production no matter what env vars say
  if (process.env.NODE_ENV === "production") {
    return RouteResponse.error(404);
  }
  if (process.env.ALLOW_TEST_SIGNIN !== "true") {
    return RouteResponse.error(404);
  }

  // Ensure the user row exists (no-op if they already signed in via Google)
  await db
    .insert(user)
    .values({
      id: TEST_USER_ID,
      email: TEST_USER_EMAIL,
      emailVerified: true,
      name: TEST_USER_NAME,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoNothing();

  // Clear any stale test sessions then create a fresh one
  await db.delete(session).where(eq(session.userId, TEST_USER_ID));

  // 32-char hex token - same length as Better Auth's generateId(32)
  const token = randomBytes(16).toString("hex");
  const sessionId = randomBytes(16).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await db.insert(session).values({
    id: sessionId,
    userId: TEST_USER_ID,
    token,
    expiresAt,
    ipAddress: req.headers.get("x-forwarded-for") ?? "127.0.0.1",
    userAgent: req.headers.get("user-agent") ?? "Playwright",
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // Sign the token using the same algorithm as better-call's signCookieValue
  const secret = process.env.BETTER_AUTH_SECRET!;
  const signedValue = makeSignedCookieValue(token, secret);

  // Better Auth prefixes the cookie name with __Secure- when its baseURL is HTTPS
  const isHttps = (process.env.BETTER_AUTH_URL ?? "").startsWith("https://");
  const cookieName = `${isHttps ? "__Secure-" : ""}better-auth.session_token`;
  const maxAge = 7 * 24 * 60 * 60;

  const dashboardUrl = new URL("/dashboard", req.url);
  const response = RouteResponse.redirect(dashboardUrl);
  response.headers.append(
    "set-cookie",
    `${cookieName}=${signedValue}; Path=/; HttpOnly; SameSite=Lax${isHttps ? "; Secure" : ""}; Max-Age=${maxAge}`,
  );
  return response;
}
