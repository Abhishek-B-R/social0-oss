# Platform configuration

This document describes how to configure each social platform for connect and publish.

## Security overview

- **OAuth state**: Encrypted with AES-256-GCM (key: `ENCRYPTION_KEY`). Never log state or tokens.
- **Stored tokens**: Encrypted per-account with HKDF-derived keys. Stored in `connected_accounts`.
- **Media URLs**: Only URLs from `NEXT_PUBLIC_APP_URL` or `R2_PUBLIC_URL` are used when publishing (SSRF allowlist).
- **Content**: Length and media count are validated per platform before publish.

---

## OAuth platforms (app credentials in env)

Redirect URI for all: `{NEXT_PUBLIC_APP_URL}/api/connect/{platform}/callback`

### LinkedIn

- **Env**: `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`
- **Console**: [LinkedIn Developer](https://www.linkedin.com/developers/apps) → Create app → Auth → Redirect URL
- **Scopes**: `openid profile email w_member_social`

### X (Twitter)

- **Env**: `TWITTER_CONSUMER_KEY`, `TWITTER_CONSUMER_SECRET`
- **Console**: [Twitter Developer](https://developer.twitter.com/) → Project → App → Keys (Consumer Keys)
- **Callback**: Same as above. Uses OAuth 1.0a (no client_id in URL).

### Facebook

- **Env**: `FACEBOOK_CLIENT_ID`, `FACEBOOK_CLIENT_SECRET`
- **Console**: [Meta for Developers](https://developers.facebook.com/apps/) → Facebook Login → Settings → Valid OAuth Redirect URIs
- **Scopes**: `pages_show_list,pages_read_engagement,pages_manage_posts,pages_manage_metadata` (all required for posting as a Page)
- **Note**: User selects a Page; we store the Page access token. If you see a "permission must be granted" error, disconnect and reconnect the Page so the app can request the updated scopes.

### Instagram

- **Env**: `INSTAGRAM_CLIENT_ID`, `INSTAGRAM_CLIENT_SECRET`
- **Console**: Same Meta app → Instagram Graph API (or Instagram Basic Display). Redirect URI as above.
- **Scopes**: `instagram_business_basic instagram_content_publish`
- **Note**: Requires Instagram Business/Creator account linked to a Facebook Page.

### Threads

- **Env**: `THREADS_CLIENT_ID`, `THREADS_CLIENT_SECRET`
- **Console**: Same Meta app → Threads API. Redirect URI as above.
- **Scopes**: `threads_basic threads_content_publish`
- **Note**: After login we exchange the short-lived token for a **long-lived token (60 days)**. If you see "Session has expired", reconnect Threads from the dashboard to get a new token.

### YouTube

- **Env**: `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`
- **Console**: [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials → OAuth 2.0 (separate from main app Google sign-in). Authorized redirect URI as above. Enable **YouTube Data API v3** and request write access.
- **Scopes**: `youtube.upload`, `youtube`, `userinfo.profile`
- **Publish**: **YouTube Shorts only.** Video is fetched from your allowlisted media URL and uploaded via the resumable upload API. Max file size 50MB (typical for under 60 seconds). Title/description get `#Shorts`. Long-form videos are not supported.

### Pinterest

- **Env**: `PINTEREST_CLIENT_ID`, `PINTEREST_CLIENT_SECRET`
- **Console**: [Pinterest Developers](https://developers.pinterest.com/apps/) → Redirect URI
- **Scopes**: `boards:read boards:write pins:read pins:write user_accounts:read`
- **Publish**: Uses first board; pin requires one image (from allowlisted URL).

### TikTok

- **Env**: `TIKTOK_CLIENT_ID`, `TIKTOK_CLIENT_SECRET`
- **Console**: [TikTok for Developers](https://developers.tiktok.com/) → Redirect URL. Add **Content Posting API** and request **video.upload** and **video.publish**. Verify the domain or URL prefix that will host your video URLs (required for PULL_FROM_URL).
- **Scopes**: `user.info.basic video.upload video.publish`
- **Publish**: **Direct Post** with `PULL_FROM_URL`. Video URL must be from a **verified domain** in your TikTok app. Caption (title) up to 2200 characters. We poll publish status until complete and return the TikTok video URL when available.

---

## BYOK (Bring Your Own Keys)

No app-level env vars. Users add credentials in the dashboard.

### Bluesky

- **User provides**: Handle (e.g. `user.bsky.social`) and App Password
- **Where**: Bluesky Settings → App Passwords. Stored encrypted; session created at publish time.

### Hashnode

- **User provides**: Personal Access Token + Publication ID
- **Where**: Hashnode Settings → Developer. Publication ID from publication URL/dashboard.
- **Publish**: Tries `createPublicationStory` then `createStory` (GraphQL).

### Dev.to

- **User provides**: API key
- **Where**: Dev.to Settings → Extensions → DEV API Keys.

### Medium

- **User provides**: Integration token (optional; publish to Medium not implemented yet).
- **Where**: Medium → Settings → Security and apps → Integration tokens.

---

## Media and R2

- For images/video to be used in publish, uploads must be stored and served from a URL that is either:
  - Same origin as `NEXT_PUBLIC_APP_URL`, or
  - `R2_PUBLIC_URL` (e.g. R2 public bucket or custom domain).
- Set `R2_PUBLIC_URL` in env if you use R2 for media; otherwise only same-origin URLs are allowlisted.

---

## Optional: Instagram via Facebook Page

If you prefer connecting Instagram through a Facebook Page (same Meta app):

- Use the Instagram–Facebook flow: `/api/connect/instagram-facebook` and related routes.
- Ensures the Instagram Business Account is linked to the selected Page before storing the token.
