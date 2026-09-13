/**
 * Facebook Page OAuth scopes.
 *
 * pages_manage_engagement requires pages_read_user_content — both are Advanced
 * Access after App Review. Do not add pages_messaging (wrong product).
 */
export const FACEBOOK_ALLOWED_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "read_insights",
  "pages_read_user_content",
  "pages_manage_engagement",
] as const;

const FACEBOOK_ALLOWED_SCOPE_SET = new Set<string>(FACEBOOK_ALLOWED_SCOPES);

/** Never send on Login — invalid or wrong product surface. */
export const FACEBOOK_BLOCKED_SCOPES = [
  "pages_messaging",
  "pages_messaging_subscriptions",
  "pages_messaging_phone_number",
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
