import { env } from "@/lib/env";

/** Scopes used when FACEBOOK_LOGIN_CONFIG_ID is not set (legacy scope-based OAuth). */
export const FACEBOOK_PAGE_SCOPES =
  "pages_show_list,pages_read_engagement,pages_manage_posts";

/** Instagram-via-Facebook Page flow scopes (legacy). */
export const FACEBOOK_INSTAGRAM_PAGE_SCOPES =
  "pages_show_list,pages_read_engagement,pages_manage_posts,business_management";

const FACEBOOK_AUTH_URL = "https://www.facebook.com/dialog/oauth";

export type BuildFacebookOAuthUrlParams = {
  clientId: string;
  redirectUri: string;
  state: string;
  /** Facebook Login for Business configuration ID (preferred over scope). */
  configId?: string | null;
  /** Fallback when configId is absent. */
  scope?: string;
};

/**
 * Build Meta OAuth dialog URL.
 * @see https://developers.facebook.com/docs/facebook-login/facebook-login-for-business/
 * When config_id is set, scope should not be sent (Meta recommendation).
 */
export function buildFacebookOAuthUrl({
  clientId,
  redirectUri,
  state,
  configId,
  scope,
}: BuildFacebookOAuthUrlParams): string {
  const url = new URL(FACEBOOK_AUTH_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);

  const trimmedConfigId = configId?.trim();
  if (trimmedConfigId) {
    url.searchParams.set("config_id", trimmedConfigId);
  } else if (scope) {
    url.searchParams.set("scope", scope);
  }

  return url.toString();
}

export function getFacebookLoginConfigId(): string | undefined {
  const id = env.FACEBOOK_LOGIN_CONFIG_ID?.trim();
  return id || undefined;
}

export function getFacebookInstagramLoginConfigId(): string | undefined {
  const instagramId = env.FACEBOOK_INSTAGRAM_LOGIN_CONFIG_ID?.trim();
  if (instagramId) return instagramId;
  return getFacebookLoginConfigId();
}
