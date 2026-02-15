// Order: color groups — blues → reds → gradient → blacks (visually consistent everywhere)
export const PLATFORMS = [
  { id: "linkedin", name: "LinkedIn", icon: null },
  { id: "facebook", name: "Facebook", icon: null },
  { id: "bluesky", name: "Bluesky", icon: null },
  { id: "hashnode", name: "Hashnode", icon: null },
  { id: "youtube", name: "YouTube", icon: null },
  { id: "pinterest", name: "Pinterest", icon: null },
  { id: "instagram", name: "Instagram", icon: null },
  { id: "tiktok", name: "TikTok", icon: null },
  { id: "twitter_x", name: "X (Twitter)", icon: null },
  { id: "threads", name: "Threads", icon: null },
  { id: "devto", name: "Dev.to", icon: null },
  { id: "medium", name: "Medium", icon: null },
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
    // OpenID Connect + w_member_social for profile and future posting
    scope: "openid profile email w_member_social",
  },
  instagram: {
    clientIdEnv: "INSTAGRAM_CLIENT_ID",
    clientSecretEnv: "INSTAGRAM_CLIENT_SECRET",
    authUrl: "https://api.instagram.com/oauth/authorize",
    tokenUrl: "https://api.instagram.com/oauth/access_token",
    // Instagram Graph API (Basic Display API was deprecated Dec 2024)
    // Requires Instagram Business or Creator account
    // Requires Facebook Page to be linked to Instagram account
    // instagram_business_basic: read profile, media, insights
    // instagram_content_publish: publish posts (requires additional permissions)
    scope: "instagram_business_basic",
  },
  youtube: {
    clientIdEnv: "YOUTUBE_CLIENT_ID",
    clientSecretEnv: "YOUTUBE_CLIENT_SECRET",
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    // YouTube + userinfo.profile for channel/name and avatar
    scope: "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube https://www.googleapis.com/auth/userinfo.profile",
  },
  twitter_x: {
    clientIdEnv: "TWITTER_CLIENT_ID",
    clientSecretEnv: "TWITTER_CLIENT_SECRET",
    authUrl: "https://twitter.com/i/oauth2/authorize",
    tokenUrl: "https://api.twitter.com/2/oauth2/token",
    // X (Twitter) OAuth 2.0 scopes
    // tweet.read: read tweets
    // tweet.write: post tweets
    // users.read: read user profile
    // offline.access: required to get refresh_token
    scope: "tweet.read tweet.write users.read offline.access",
  },
  threads: {
    clientIdEnv: "THREADS_CLIENT_ID",
    clientSecretEnv: "THREADS_CLIENT_SECRET",
    authUrl: "https://threads.net/oauth/authorize",
    tokenUrl: "https://graph.facebook.com/v18.0/oauth/access_token",
    // Threads API scopes (Meta Graph API)
    // threads_basic: required for all Threads endpoints
    // threads_content_publish: required for publishing posts
    scope: "threads_basic threads_content_publish",
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
    scope: "user.info.basic",
  },
  facebook: {
    clientIdEnv: "FACEBOOK_CLIENT_ID",
    clientSecretEnv: "FACEBOOK_CLIENT_SECRET",
    authUrl: "https://www.facebook.com/v21.0/dialog/oauth",
    tokenUrl: "https://graph.facebook.com/v21.0/oauth/access_token",
    scope: "pages_manage_posts,pages_read_engagement,pages_show_list",
  },
  devto: null, // BYOK - API key
  hashnode: null, // BYOK - API key + Publication ID
  medium: null, // BYOK - Integration token (medium.com/me/settings)
};
