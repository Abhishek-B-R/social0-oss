// Order: color groups - blues → reds → gradient → blacks (visually consistent everywhere)
import { FACEBOOK_PAGE_SCOPES } from "@social0/shared";

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
    // manage_insights + manage_comments + manage_messages: additive — existing tokens keep publishing.
    scope:
      "instagram_business_basic,instagram_business_content_publish,instagram_business_manage_insights,instagram_business_manage_comments,instagram_business_manage_messages",
  },
  youtube: {
    clientIdEnv: "YOUTUBE_CLIENT_ID",
    clientSecretEnv: "YOUTUBE_CLIENT_SECRET",
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    // youtube.readonly covers video statistics; yt-analytics.readonly for Reports API (future).
    scope:
      "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/yt-analytics.readonly https://www.googleapis.com/auth/youtube.force-ssl https://www.googleapis.com/auth/userinfo.profile",
  },
  twitter_x: null, // OAuth 1.0a - handled separately in route handler
  threads: {
    clientIdEnv: "THREADS_CLIENT_ID",
    clientSecretEnv: "THREADS_CLIENT_SECRET",
    authUrl: "https://threads.net/oauth/authorize",
    tokenUrl: "https://graph.threads.net/oauth/access_token",
    // threads_manage_insights: post/user insights (Meta App Review)
    scope:
      "threads_basic,threads_content_publish,threads_manage_replies,threads_manage_insights",
  },
  bluesky: null, // Bluesky uses BYOK (Bring Your Own Keys) - handle + app password
  pinterest: {
    clientIdEnv: "PINTEREST_CLIENT_ID",
    clientSecretEnv: "PINTEREST_CLIENT_SECRET",
    authUrl: "https://www.pinterest.com/oauth/",
    tokenUrl: "https://api.pinterest.com/v5/oauth/token",
    // pins:read already covers pin analytics endpoints
    scope: "boards:read boards:write pins:read pins:write user_accounts:read",
  },
  tiktok: {
    clientIdEnv: "TIKTOK_CLIENT_ID",
    clientSecretEnv: "TIKTOK_CLIENT_SECRET",
    authUrl: "https://www.tiktok.com/v2/auth/authorize/",
    tokenUrl: "https://open.tiktokapis.com/v2/oauth/token/",
    // video.list + user.info.stats: Display API metrics (needs TikTok review). Keep publish scopes.
    // Still avoid user.info.profile unless separately approved.
    scope:
      "user.info.basic,video.upload,video.publish,video.list,user.info.stats",
  },
  facebook: {
    clientIdEnv: "FACEBOOK_CLIENT_ID",
    clientSecretEnv: "FACEBOOK_CLIENT_SECRET",
    authUrl: "https://www.facebook.com/dialog/oauth",
    tokenUrl: "https://graph.facebook.com/v21.0/oauth/access_token",
    // read_insights + pages_manage_engagement + pages_messaging. If FACEBOOK_LOGIN_CONFIG_ID is set, add them in Meta Login config too.
    scope: FACEBOOK_PAGE_SCOPES,
  },
};
