import { auth } from "@/lib/auth";
import { PLATFORM_OAUTH_CONFIG, Platform } from "@/lib/platforms";
import { env } from "@/lib/env";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { encrypt } from "@/lib/encryption";
import { normalizeAppUrl } from "@/lib/url-utils";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ platform: Platform }> },
) {
  const { platform } = await params;
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

  // Handle Mastodon instance URL (decentralized platform)
  let authUrl = config.authUrl;
  if (platform === "mastodon" && env.MASTODON_INSTANCE_URL) {
    const instanceUrl = env.MASTODON_INSTANCE_URL.replace(/\/$/, ""); // Remove trailing slash
    authUrl = `${instanceUrl}/oauth/authorize`;
  }

  const url = new URL(authUrl);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", config.scope);

  // Standard OAuth flow - encrypt userId + platform in state (prevents tampering)
  const state = encrypt({
    userId: session.user.id,
    platform: platform,
  });

  url.searchParams.set("state", state);

  // Google OAuth specific parameters (for YouTube)
  if (platform === "youtube") {
    url.searchParams.set("access_type", "offline"); // Required to get refresh token
    url.searchParams.set("prompt", "consent"); // Force consent screen to get refresh token
  }

  const finalUrl = url.toString();
  console.log("🔍 Final OAuth URL:", finalUrl);

  return redirect(finalUrl);
}
