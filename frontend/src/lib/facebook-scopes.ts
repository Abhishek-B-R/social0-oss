/**
 * Facebook Page OAuth scopes — mirror backend/shared facebook-scopes.ts.
 */
export const FACEBOOK_ALLOWED_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "read_insights",
] as const;

export const FACEBOOK_PAGE_SCOPES = FACEBOOK_ALLOWED_SCOPES.join(",");

export const FACEBOOK_INSTAGRAM_PAGE_SCOPES = FACEBOOK_PAGE_SCOPES;
