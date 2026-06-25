import { auth } from "../lib/auth.js";
import { PLATFORM_OAUTH_CONFIG, Platform } from "../lib/platforms.js";
import { env } from "../lib/env.js";
import { headers, cookies } from "../lib/shim/next-headers.js";
import { encrypt } from "../lib/encryption.js";
import { resolveAppUrlFromRequest } from "../lib/app-url.js";
import crypto from "crypto";
import { db } from "../db/index.js";
import { verification, connectedAccounts } from "../db/schema.js";
import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "../lib/shim/next-server.js";
import { redirect } from "../lib/shim/next-navigation.js";
import { TwitterApi } from "twitter-api-v2";
import { oauthLimiter, enforceRateLimit } from "../lib/ratelimit.js";
import {
  buildFacebookOAuthUrl,
  getFacebookLoginConfigId,
} from "../lib/facebook-oauth.js";
import { sanitizeReturnToPath } from "../lib/safe-return-to.js";
import { redirectWithOAuthConnectBinding } from "../lib/oauth-connect-binding.js";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ platform: string }> },
) {
  const { platform: platformParam } = await params;
  
  // Validate platform is a valid Platform type (including BYOK platforms)
  const validPlatforms: Platform[] = ["linkedin", "instagram", "youtube", "pinterest", "tiktok", "twitter_x", "threads", "bluesky", "facebook"];
  if (!validPlatforms.includes(platformParam as Platform)) {
    return Response.json({ error: "Invalid platform" }, { status: 400 });
  }
  
  const platform = platformParam as Platform;
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // TikTok: no rate limit / binding — plain OAuth like pre-security flow.
  if (platform !== "tiktok") {
    const rate = await enforceRateLimit(oauthLimiter, session.user.id, {
      failClosedWhenUnavailable: false,
    });
    if (!rate.allowed) {
      return NextResponse.redirect(
        new URL("/dashboard/connections?error=rate_limited", req.url),
      );
    }
  }

  const returnToForConnect =
    platform === "tiktok"
      ? (() => {
          const p = req.nextUrl.searchParams.get("returnTo");
          return typeof p === "string" &&
            p.startsWith("/") &&
            !p.startsWith("//")
            ? p
            : undefined;
        })()
      : sanitizeReturnToPath(req.nextUrl.searchParams.get("returnTo"));

  const reauthParam = req.nextUrl.searchParams.get("reauth");
  const accountIdParam = req.nextUrl.searchParams.get("accountId");
  let isReauth = false;
  if (reauthParam === "1" && accountIdParam) {
    const [account] = await db
      .select({ id: connectedAccounts.id })
      .from(connectedAccounts)
      .where(
        and(
          eq(connectedAccounts.id, accountIdParam),
          eq(connectedAccounts.userId, session.user.id),
        ),
      )
      .limit(1);
    if (account) isReauth = true;
  }

  // Twitter/X: OAuth 1.0a flow (separate from standard OAuth 2.0)
  if (platform === "twitter_x") {
    const consumerKey = env.TWITTER_CONSUMER_KEY;
    const consumerSecret = env.TWITTER_CONSUMER_SECRET;
    if (!consumerKey || !consumerSecret) {
      return Response.json(
        { error: "Twitter OAuth 1.0a credentials not configured (TWITTER_CONSUMER_KEY, TWITTER_CONSUMER_SECRET)" },
        { status: 400 },
      );
    }
    const baseUrl = resolveAppUrlFromRequest(req);
    const callbackUrl = `${baseUrl}/api/connect/twitter_x/callback`;

    const client = new TwitterApi({ appKey: consumerKey, appSecret: consumerSecret });
    const { url: authUrl, oauth_token_secret } = await client.generateAuthLink(callbackUrl);

    // Store request token secret in encrypted cookie (needed in callback)
    const cookieStore = await cookies();
    const state = encrypt({
      userId: session.user.id,
      platform: "twitter_x",
      oauth_token_secret: oauth_token_secret,
      ...(returnToForConnect && { returnTo: returnToForConnect }),
      ...(isReauth && { reauth: true }),
    });
    cookieStore.set("twitter_oauth1_request_secret", state, {
      httpOnly: true,
      secure: baseUrl.startsWith("https://"),
      sameSite: "lax",
      maxAge: 600, // 10 minutes
    });
    // State for CSRF: userId + platform (callback will verify)
    const csrfState = encrypt({ userId: session.user.id, platform: "twitter_x" });
    const finalUrl = `${authUrl}&state=${encodeURIComponent(csrfState)}`;
    return redirectWithOAuthConnectBinding(
      finalUrl,
      session.user.id,
      "twitter_x",
    );
  }

  // Check if platform uses OAuth (not BYOK)
  if (!PLATFORM_OAUTH_CONFIG[platform]) {
    return Response.json({ error: "Platform not configured for OAuth" }, { status: 400 });
  }

  const config = PLATFORM_OAUTH_CONFIG[platform];
  if (!config) {
    return Response.json({ error: "Platform not configured" }, { status: 400 });
  }

  // Get client ID and secret from env
  const clientId = env[config.clientIdEnv as keyof typeof env] as string;
  const clientSecret = env[
    config.clientSecretEnv as keyof typeof env
  ] as string;

  if (!clientId || !clientSecret) {
    return Response.json(
      { error: "Platform OAuth credentials not configured" },
      { status: 400 },
    );
  }

  // Construct redirect URI - normalize URL (https for production, http for localhost)
  const baseUrl = resolveAppUrlFromRequest(req);
  const redirectUri = `${baseUrl}/api/connect/${platform}/callback`;

  // Use platform's auth URL
  const authUrl = config.authUrl;

  const url = new URL(authUrl);
  
  // TikTok and X (Twitter) require PKCE
  let state: string;
  if (platform === "tiktok") {
    // Generate PKCE code verifier and challenge
    const codeVerifier = crypto.randomBytes(32).toString("base64url");
    const codeChallenge = crypto
      .createHash("sha256")
      .update(codeVerifier)
      .digest("base64url");

    // CRITICAL: Store verifier in DB, not in state (state size limit ~512 chars)
    // Generate a short state ID
    const stateId = crypto.randomBytes(16).toString("hex");
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    // Store verifier in verification table
    await db.insert(verification).values({
      id: stateId,
      identifier: `pkce_${session.user.id}_${platform}`,
      value: codeVerifier,
      expiresAt,
    });

    // State only contains userId + platform + stateId (short, safe)
    state = encrypt({
      userId: session.user.id,
      platform: platform,
      stateId: stateId, // Reference to verifier in DB
      ...(returnToForConnect && { returnTo: returnToForConnect }),
      ...(isReauth && { reauth: true }),
    });

    // TikTok-specific: use client_key (NOT client_id)
    url.searchParams.set("client_key", clientId);
    url.searchParams.set("code_challenge", codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");

  } else {
    // Standard OAuth flow - encrypt userId + platform in state
    state = encrypt({
      userId: session.user.id,
      platform: platform,
      ...(returnToForConnect && { returnTo: returnToForConnect }),
      ...(isReauth && { reauth: true }),
    });
    url.searchParams.set("client_id", clientId);
  }

  if (platform === "facebook") {
    return redirectWithOAuthConnectBinding(
      buildFacebookOAuthUrl({
        clientId,
        redirectUri,
        state,
        configId: getFacebookLoginConfigId(),
        scope: config.scope,
      }),
      session.user.id,
      platform,
    );
  }
  
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", config.scope);
  url.searchParams.set("state", state);

  // Google OAuth specific parameters (for YouTube)
  if (platform === "youtube") {
    url.searchParams.set("access_type", "offline"); // Required to get refresh token
    url.searchParams.set("prompt", "consent"); // Force consent screen to get refresh token
  }

  const finalUrl = url.toString();
  if (platform === "tiktok") {
    return redirect(finalUrl);
  }
  return redirectWithOAuthConnectBinding(finalUrl, session.user.id, platform);
}
