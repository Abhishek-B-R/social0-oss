import { auth } from "../lib/auth.js";
import { env } from "../lib/env.js";
import { headers } from "../lib/shim/next-headers.js";
import { encrypt } from "../lib/encryption.js";
import { normalizeAppUrl } from "../lib/url-utils.js";
import { NextRequest } from "../lib/shim/next-server.js";
import {
  buildFacebookOAuthUrl,
  FACEBOOK_INSTAGRAM_PAGE_SCOPES,
  getFacebookInstagramLoginConfigId,
} from "../lib/facebook-oauth.js";
import { enforceRateLimit, oauthLimiter } from "../lib/ratelimit.js";
import { sanitizeReturnToPath } from "../lib/safe-return-to.js";
import { redirectWithOAuthConnectBinding } from "../lib/oauth-connect-binding.js";

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
