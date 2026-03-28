// Order: color groups — blues → reds → gradient → blacks (visually consistent everywhere)
export const PLATFORMS = [
  { id: "linkedin", name: "LinkedIn", icon: null },
  { id: "facebook", name: "Facebook", icon: null },
  { id: "bluesky", name: "Bluesky", icon: null },
  { id: "youtube", name: "YouTube", icon: null },
  { id: "pinterest", name: "Pinterest", icon: null },
  { id: "instagram", name: "Instagram", icon: null },
  { id: "tiktok", name: "TikTok", icon: null },
  { id: "twitter_x", name: "X (Twitter)", icon: null },
  { id: "threads", name: "Threads", icon: null },
] as const;

export type Platform = (typeof PLATFORMS)[number]["id"];

export const PLATFORM_OAUTH_CONFIG: Record<
  Platform,
  {
    clientIdEnv: string;
    clientSecretEnv: string;
    authUrl: string;
    tokenUrl: string;
    scope: string;
  } | null
> = {
  linkedin: {
    clientIdEnv: "LINKEDIN_CLIENT_ID",
    clientSecretEnv: "LINKEDIN_CLIENT_SECRET",
    authUrl: "https://www.linkedin.com/oauth/v2/authorization",
    tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
    // OpenID Connect + w_member_social for profile and posting.
    // When LinkedIn MDP approves org access, add: r_organization_social w_organization_social r_organization_admin
    scope: "openid profile email w_member_social",
  },
  instagram: {
    clientIdEnv: "INSTAGRAM_CLIENT_ID", // Your Meta app ID
    clientSecretEnv: "INSTAGRAM_CLIENT_SECRET",
    authUrl: "https://www.instagram.com/oauth/authorize", // ✅ This is correct
    tokenUrl: "https://api.instagram.com/oauth/access_token", // ✅ This too
    scope: "instagram_business_basic,instagram_business_content_publish", // ✅ Correct scopes
  },
  youtube: {
    clientIdEnv: "YOUTUBE_CLIENT_ID",
    clientSecretEnv: "YOUTUBE_CLIENT_SECRET",
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    // YouTube + userinfo.profile for channel/name and avatar
    scope:
      "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/userinfo.profile",
  },
  twitter_x: null, // OAuth 1.0a - handled separately in route handler
  threads: {
    clientIdEnv: "THREADS_CLIENT_ID",
    clientSecretEnv: "THREADS_CLIENT_SECRET",
    authUrl: "https://threads.net/oauth/authorize",
    tokenUrl: "https://graph.threads.net/oauth/access_token",
    // Threads API scopes (Meta Graph API)
    // threads_basic: required for all Threads endpoints
    // threads_content_publish: required for publishing posts
    scope: "threads_basic,threads_content_publish,threads_manage_replies",
  },
  bluesky: null, // Bluesky uses BYOK (Bring Your Own Keys) - handle + app password
  pinterest: {
    clientIdEnv: "PINTEREST_CLIENT_ID",
    clientSecretEnv: "PINTEREST_CLIENT_SECRET",
    authUrl: "https://www.pinterest.com/oauth/",
    tokenUrl: "https://api.pinterest.com/v5/oauth/token",
    // Pinterest OAuth scopes (user_accounts:read required for profile fetch in callback)
    scope: "boards:read boards:write pins:read pins:write user_accounts:read",
  },
  tiktok: {
    clientIdEnv: "TIKTOK_CLIENT_ID",
    clientSecretEnv: "TIKTOK_CLIENT_SECRET",
    authUrl: "https://www.tiktok.com/v2/auth/authorize/",
    tokenUrl: "https://open.tiktokapis.com/v2/oauth/token/",
    // user.info.basic: profile; video.upload + video.publish: Content Posting API (Direct Post with PULL_FROM_URL)
    // TikTok Login Kit for Web requires comma-separated scopes.
    scope: "user.info.basic,video.upload,video.publish",
  },
  facebook: {
    clientIdEnv: "FACEBOOK_CLIENT_ID",
    clientSecretEnv: "FACEBOOK_CLIENT_SECRET",
    authUrl: "https://www.facebook.com/dialog/oauth",
    tokenUrl: "https://graph.facebook.com/v21.0/oauth/access_token",
    // pages_show_list: me/accounts; pages_manage_posts: feed/photos publish; pages_read_engagement if we read insights
    scope:
      "pages_show_list,pages_read_engagement,pages_manage_posts",
  },
};
