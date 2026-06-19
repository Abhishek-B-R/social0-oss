import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { headers } from "next/headers";
import { encrypt } from "@/lib/encryption";
import { normalizeAppUrl } from "@/lib/url-utils";
import { NextRequest } from "next/server";
import {
  buildFacebookOAuthUrl,
  FACEBOOK_INSTAGRAM_PAGE_SCOPES,
  getFacebookInstagramLoginConfigId,
} from "@/lib/facebook-oauth";
import { enforceRateLimit, oauthLimiter } from "@/lib/ratelimit";
import { sanitizeReturnToPath } from "@/lib/safe-return-to";
import { redirectWithOAuthConnectBinding } from "@/lib/oauth-connect-binding";

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rate = await enforceRateLimit(oauthLimiter, session.user.id, {
    failClosedWhenUnavailable: false,
  });
  if (!rate.allowed) {
    return Response.json({ error: rate.error }, { status: rate.status });
  }

  const clientId = env.FACEBOOK_CLIENT_ID;
  const clientSecret = env.FACEBOOK_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return Response.json(
      { error: "Facebook OAuth credentials not configured" },
      { status: 400 },
    );
  }

  const baseUrl = normalizeAppUrl(env.NEXT_PUBLIC_APP_URL);
  const redirectUri = `${baseUrl}/api/connect/instagram-facebook/callback`;

  const returnTo = sanitizeReturnToPath(req.nextUrl.searchParams.get("returnTo"));

  const state = encrypt({
    userId: session.user.id,
    platform: "instagram-facebook",
    ...(returnTo && { returnTo }),
  });

  const finalUrl = buildFacebookOAuthUrl({
    clientId,
    redirectUri,
    state,
    configId: getFacebookInstagramLoginConfigId(),
    scope: FACEBOOK_INSTAGRAM_PAGE_SCOPES,
  });

  return redirectWithOAuthConnectBinding(
    finalUrl,
    session.user.id,
    "instagram-facebook",
  );
}
