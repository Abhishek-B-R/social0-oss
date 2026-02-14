import { auth } from "@/lib/auth";
import { PLATFORM_OAUTH_CONFIG, Platform } from "@/lib/platforms";
import { env } from "@/lib/env";
import { headers, cookies } from "next/headers";
import { redirect } from "next/navigation";
import { encrypt } from "@/lib/encryption";
import { normalizeAppUrl } from "@/lib/url-utils";
import crypto from "crypto";
import { db } from "@/db";
import { verification } from "@/db/schema";
import { NextRequest } from "next/server";

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
  
  // Check if platform uses OAuth (not BYOK)
  if (!PLATFORM_OAUTH_CONFIG[platform]) {
    return Response.json({ error: "Platform not configured for OAuth" }, { status: 400 });
  }
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
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
  const baseUrl = normalizeAppUrl(env.NEXT_PUBLIC_APP_URL);
  const redirectUri = `${baseUrl}/api/connect/${platform}/callback`;

  // Debug logging - check server console for this
  console.log("🔍 OAuth Debug:", {
    platform,
    redirectUri,
    originalUrl: env.NEXT_PUBLIC_APP_URL,
    normalizedUrl: baseUrl,
    clientId,
  });

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
    });

    // TikTok-specific: use client_key (NOT client_id)
    url.searchParams.set("client_key", clientId);
    url.searchParams.set("code_challenge", codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");

    // CRITICAL DEBUG LOGGING
    console.log("🔍 TikTok PKCE Debug:", {
      verifier: codeVerifier,
      verifierLength: codeVerifier.length,
      challenge: codeChallenge,
      challengeLength: codeChallenge.length,
      stateId,
      stateLength: state.length,
      statePreview: state.substring(0, 50) + "...",
    });
  } else if (platform === "twitter_x") {
    // X (Twitter) OAuth 2.0 with PKCE - store code_verifier in cookie
    const codeVerifier = crypto.randomBytes(32).toString("base64url");
    const codeChallenge = crypto
      .createHash("sha256")
      .update(codeVerifier)
      .digest("base64url");

    // Store code_verifier in HTTP-only cookie (10 minutes expiry)
    const cookieStore = await cookies();
    cookieStore.set("twitter_code_verifier", codeVerifier, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600, // 10 minutes
    });

    // Standard state for CSRF protection
    state = encrypt({
      userId: session.user.id,
      platform: platform,
    });

    // X OAuth 2.0 parameters
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("code_challenge", codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");

    console.log("🔍 X (Twitter) PKCE Debug:", {
      verifierLength: codeVerifier.length,
      challengeLength: codeChallenge.length,
      stateLength: state.length,
    });
  } else {
    // Standard OAuth flow - encrypt userId + platform in state
    state = encrypt({
      userId: session.user.id,
      platform: platform,
    });
    url.searchParams.set("client_id", clientId);
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
  
  // CRITICAL: Log final URL to verify encoding
  console.log("🔍 Final OAuth URL:", finalUrl);
  console.log("🔍 URL Length:", finalUrl.length);
  console.log("🔍 State in URL:", url.searchParams.get("state")?.substring(0, 50) + "...");
  
  // Verify code_challenge encoding (should NOT contain %3D or double encoding)
  if (platform === "tiktok" || platform === "twitter_x") {
    const challengeParam = url.searchParams.get("code_challenge");
    if (challengeParam?.includes("%3D") || challengeParam?.includes("%253D")) {
      console.error("❌ CRITICAL: code_challenge is double-encoded!");
    } else {
      console.log("✅ code_challenge encoding OK");
    }
  }

  return redirect(finalUrl);
}
