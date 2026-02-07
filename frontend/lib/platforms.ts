export const PLATFORMS = [
  { id: "linkedin", name: "LinkedIn", icon: null }, // Add icons later
  { id: "instagram", name: "Instagram", icon: null },
  { id: "youtube", name: "YouTube", icon: null },
  { id: "pinterest", name: "Pinterest", icon: null },
  { id: "tiktok", name: "TikTok", icon: null },
  { id: "twitter_x", name: "X (Twitter)", icon: null },
  { id: "threads", name: "Threads", icon: null },
  { id: "bluesky", name: "Bluesky", icon: null },
] as const;

export type Platform = (typeof PLATFORMS)[number]["id"];

// OAuth config per platform (add as you implement)
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
    // LinkedIn deprecated r_liteprofile and r_emailaddress in Aug 2023
    // Now requires OpenID Connect scopes: openid, profile, email
    // w_member_social is still needed for posting
    scope: "openid profile email",
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
    // YouTube Data API v3 scopes
    // youtube.upload for posting videos, youtube for full access
    scope: "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube",
  },
  twitter_x: null, // X (Twitter) uses BYOK (Bring Your Own Keys) instead of OAuth
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
    // Pinterest OAuth scopes
    // boards:read, boards:write, pins:read, pins:write for full access
    scope: "boards:read boards:write pins:read pins:write",
  },
  tiktok: {
    clientIdEnv: "TIKTOK_CLIENT_ID",
    clientSecretEnv: "TIKTOK_CLIENT_SECRET",
    authUrl: "https://www.tiktok.com/v2/auth/authorize/",
    tokenUrl: "https://open.tiktokapis.com/v2/oauth/token/",
    // TikTok OAuth scopes
    // user.info.basic: read profile, video.publish: post videos
    scope: "user.info.basic video.publish",
  },
};
