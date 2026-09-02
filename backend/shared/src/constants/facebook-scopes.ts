/**
 * Facebook Page OAuth scopes.
 *
 * Connect requests everything the app uses except permissions Meta blocks
 * until a prerequisite is on the app:
 * - pages_manage_engagement requires pages_read_user_content (add both in App
 *   Review first, then uncomment ENGAGEMENT below).
 */
export const FACEBOOK_ALLOWED_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "read_insights", // Analytics: Page/post insights
  // "pages_manage_engagement", // Inbox comments — enable after pages_read_user_content is on the app
] as const;

const FACEBOOK_ALLOWED_SCOPE_SET = new Set<string>(FACEBOOK_ALLOWED_SCOPES);

/** Never send on Login — invalid or wrong product surface. */
export const FACEBOOK_BLOCKED_SCOPES = [
  "pages_messaging",
  "pages_messaging_subscriptions",
  "pages_messaging_phone_number",
  "pages_read_user_content",
  "pages_manage_engagement",
  "business_management",
] as const;

/** Exact scope string sent on Facebook / IG-via-Facebook Page Login. */
export const FACEBOOK_PAGE_SCOPES = FACEBOOK_ALLOWED_SCOPES.join(",");

/** Same scopes for Instagram-via-Facebook Page connect. */
export const FACEBOOK_INSTAGRAM_PAGE_SCOPES = FACEBOOK_PAGE_SCOPES;

/** OAuth scope param — always the connect allowlist. */
export function facebookOAuthScopeString(): string {
  return FACEBOOK_PAGE_SCOPES;
}

/** Keep only allowlisted scopes (drops blocked / unknown extras). */
export function sanitizeFacebookScopes(scope: string): string {
  const requested = new Set(
    scope
      .split(/[,\s]+/)
      .map((part) => part.trim())
      .filter(Boolean)
      .filter((part) => !FACEBOOK_BLOCKED_SCOPES.includes(part as (typeof FACEBOOK_BLOCKED_SCOPES)[number]))
      .filter((part) => FACEBOOK_ALLOWED_SCOPE_SET.has(part)),
  );
  return FACEBOOK_ALLOWED_SCOPES.filter((part) => requested.has(part)).join(",");
}
