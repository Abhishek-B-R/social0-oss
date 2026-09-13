import {
  FACEBOOK_INSTAGRAM_PAGE_SCOPES,
  FACEBOOK_PAGE_SCOPES,
} from "@social0/shared";

export { FACEBOOK_INSTAGRAM_PAGE_SCOPES, FACEBOOK_PAGE_SCOPES };

const FACEBOOK_AUTH_URL = "https://www.facebook.com/dialog/oauth";

export type BuildFacebookOAuthUrlParams = {
  clientId: string;
  redirectUri: string;
  state: string;
  /**
   * Ignored. Login-for-Business config_id is never sent - a dashboard config
   * can still list pages_messaging, which this app does not have.
   */
  configId?: string | null;
  /** Page scopes. Blocked permissions are stripped before the URL is built. */
  scope?: string;
};

/**
 * Build Meta OAuth dialog URL with an explicit scope list only.
 * Never send config_id; never request Messenger.
 */
export function buildFacebookOAuthUrl({
  clientId,
  redirectUri,
  state,
}: BuildFacebookOAuthUrlParams): string {
  const url = new URL(FACEBOOK_AUTH_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);

  // Always the allowlisted Page scopes — ignore caller scope/config extras.
  url.searchParams.set("scope", FACEBOOK_PAGE_SCOPES);

  return url.toString();
}
