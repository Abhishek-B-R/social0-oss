import { auth } from "../lib/auth.js";
import { env } from "../lib/env.js";
import { headers } from "../lib/http/request-cookies.js";
import { encrypt } from "@social0/shared";
import { getConnectCallbackBaseUrl } from "../lib/app-url.js";
import { AppRequest } from "../lib/http/http.js";
import {
  buildFacebookOAuthUrl,
  FACEBOOK_INSTAGRAM_PAGE_SCOPES,
  getFacebookInstagramLoginConfigId,
} from "../lib/facebook-oauth.js";
import { enforceRateLimit, oauthLimiter } from "../lib/ratelimit.js";
import { sanitizeReturnToPath } from "@social0/shared";
import { redirectWithOAuthConnectBinding } from "../lib/oauth-connect-binding.js";

export async function igFbStart(req: AppRequest) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rate = await enforceRateLimit(oauthLimiter, session.user.id);
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

  const redirectUri = `${getConnectCallbackBaseUrl()}/api/connect/instagram-facebook/callback`;

  const returnTo = sanitizeReturnToPath(req.parsedUrl.searchParams.get("returnTo"));

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
