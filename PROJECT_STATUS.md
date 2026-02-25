# Social0 - Social Media Management Platform

## 📋 Project Overview

**Social0** is a comprehensive social media management platform that allows users to create, schedule, and publish content across multiple social media platforms from a single dashboard. The platform supports various content types including text posts, image posts, video posts, threaded posts, and blog articles, with intelligent platform-specific formatting and optimization.

### Core Value Proposition

- **Unified Dashboard**: Manage all your social media accounts from one place
- **Multi-Platform Publishing**: Post to LinkedIn, Instagram, YouTube, Pinterest, TikTok, X (Twitter), Threads, and Bluesky simultaneously
- **Content Type Support**: Text, Images+Text, Video+Text, Threads, and Blog posts
- **Smart Scheduling**: Schedule posts for optimal engagement times
- **AI Enhancement**: Optional AI-powered content optimization
- **Secure Token Management**: Enterprise-grade encryption for OAuth tokens
- **Platform-Specific Optimization**: Automatic formatting and media handling per platform

---

## 📌 Recent Work (February 2026)

### OAuth & Platform Connections

- **Facebook OAuth**: Full Page OAuth (`/api/connect/facebook`), callback, token exchange. Multiple Pages → selection page `/dashboard/connect/facebook/select`; single Page saves directly. Uses `FACEBOOK_CLIENT_ID` / `FACEBOOK_CLIENT_SECRET` (same Meta app as Instagram/Threads).
- **Instagram: two connection methods**: (1) **Connect via Instagram** — existing direct OAuth; `platformMetadata.connectionMethod: 'direct'`. (2) **Connect via Facebook Page** — modal choice → Facebook OAuth (scopes: `instagram_basic`, `instagram_content_publish`, `pages_show_list`, `pages_read_engagement`) → callback fetches Pages, checks `instagram_business_account` per Page, fetches Instagram profile → one account saves directly; multiple → `/dashboard/connect/instagram-facebook/select` → `POST /api/connect/instagram-facebook/connect-page` with `platformMetadata: { facebookPageId, instagramBusinessAccountId, connectionMethod: 'facebook-page' }`. Routes: `/api/connect/instagram-facebook`, callback, select (GET), connect-page (POST). UI: `InstagramConnectionModal` (two cards).
- **OAuth redirect fix**: Callback was sometimes redirecting to an object → 404 / `oauth_failed`. All redirects now use `safeRedirect(url, fallback)` so only string URLs are passed to `redirect()`.
- **Pinterest / YouTube / LinkedIn**: Pinterest token exchange (Basic Auth + form body); scope `user_accounts:read`. YouTube scope `userinfo.profile`, profile fallbacks. LinkedIn scope `w_member_social`, profile fallbacks. **Note:** Pinterest callback can return 401 on token exchange in some environments (see Known Issues).
- **BYOK**: **Medium** (`/api/connect/medium/byok`), **Hashnode** (`/api/connect/hashnode/byok`), **Dev.to** (`/api/connect/devto/byok`) — users paste tokens/keys; no server env. `.env.example` updated with Facebook and BYOK notes.

### Automatic OAuth Token Refresh (Feb 2026)

- **`lib/token-refresh.ts`**: New utility `getValidToken(accountId, platform)` that returns a valid access token, auto-refreshing when the stored token is expired or expiring within 5 minutes. Supports **YouTube** (Google `oauth2.googleapis.com/token`) and **LinkedIn** (`linkedin.com/oauth/v2/accessToken`). Other platforms return the existing token (long-lived or no expiry).
- **YouTube publishing**: `publishToYouTube` in `lib/publish-platform.ts` now calls `getValidToken(pub.connectedAccountId, "youtube")` instead of using the passed-in token; refreshes and persists new token + `tokenExpiresAt` on success.
- **LinkedIn publishing**: LinkedIn flow in `app/actions/publish.ts` calls `getValidToken(pub.connectedAccountId, "linkedin")` before upload/post API calls; uses refreshed token for all LinkedIn requests.
- **Scope**: Only YouTube and LinkedIn use short-lived (1h) tokens requiring refresh; Instagram/Facebook/Threads use long-lived tokens; Twitter uses OAuth 1.0a; Bluesky/BYOK have no expiry.

### TikTok Photo Posts (Feb 2026)

- **Photo vs video**: In `publishToTikTok` (`lib/publish-platform.ts`), media type is detected — if the post has only images (no video), the **photo post** flow runs; if video is present, the existing video flow runs.
- **Photo endpoint**: `POST /v2/post/publish/content/init/` with `media_type: "PHOTO"`, `post_mode: "MEDIA_UPLOAD"` (used for unaudited apps; DIRECT_POST may be restricted for photo posts), `source_info.source: "PULL_FROM_URL"`, `photo_images: [urls]`, `photo_cover_index: 0` (0-based). Post info includes privacy_level, title, description, disable_comment (no duet/stitch for photos).
- **Validation**: PNG images rejected with a clear error (TikTok supports JPG/JPEG/WEBP only). Max 35 images per post. Min dimensions 360×360, aspect ratio 1:3–3:1.
- **Image processing** (`lib/tiktok-photo-process.ts`): Before calling the TikTok API, each image is processed with **sharp**: download from R2 URL → validate dimensions and aspect ratio → resize (scale up if shortest side &lt; 640px to 640; scale down if any side &gt; 4096px) → convert to JPEG quality 85 → re-upload to R2 with **-tiktok-processed** suffix → use the new R2 URL in `photo_images`. Final dimensions and file size (bytes) are logged before upload. R2 helpers: `getR2KeyFromUrl`, `getR2PublicBaseUrl` in `lib/r2.ts`.
- **TikTokSettings UI**: For photo-only posts, only “Allow Comments” is shown (Duet/Stitch hidden via `mediaType="photo"` on ImagePostForm and CollectionPostForm when no video).

### Post Creation & Media

- **Post Creation UI**
  - **Dashboard nav**: Added “Connect”, “Posts”, “New post” links in dashboard header.
  - **New post page** (`/dashboard/posts/new`): Text area for content, platform selector (only connected accounts), “Save as draft” option, Create post / Save draft actions. Uses server action to create post and `post_publications` (pending) for selected accounts.
  - **Posts list** (`/dashboard/posts`): Lists all posts for the user with status badge, created date, scheduled time (if set), platform count, and “View” link when a publication has a platform URL.
- **Create post flow**
  - **Server action** (`app/actions/posts.ts`): `createPost(content, selectedAccountIds, asDraft)` — inserts into `posts` (draft or scheduled), then inserts one `post_publications` row per selected connected account with status `pending`. Revalidates dashboard and posts paths.
- **Media upload API**: `POST /api/media/upload` — auth, multipart `file`, type/size validation, `media_uploads` row; CDN `url` TBD.
- **Other**: `frontend/.next` was committed earlier; removed from Git index so `.gitignore` applies.

**Next suggested steps:** Wire media IDs into post creation, CDN/storage for uploads, then publishing engine (platform formatters + API calls).

### Content Types & Publishing (Video, Pinterest, etc.)

- **Content types** (`frontend/lib/content-types.ts`): Defines post types (text, image, video, blog, threads, collection) and each type’s `platforms` array. The Video Post form and other type-specific forms only show platforms listed for that content type.
- **Video content type**: Supports Facebook, Bluesky, X (Twitter), LinkedIn, Threads, YouTube, TikTok, Instagram, and **Pinterest**. Pinterest was added so users can create video posts and publish video pins from the Video Post form.
- **Pinterest publishing** (`lib/publish-platform.ts` — `publishToPinterest`): Supports both **image pins** and **video pins**. If the post has video media, the publisher uses Pinterest’s `media_source` with `source_type: "video_url"` and the video URL; otherwise it creates an image pin with `source_type: "image_url"`. Video URLs must be publicly accessible for Pinterest’s API.

---

## 🏗️ Architecture

### Tech Stack

- **Frontend**: Next.js 16.1.6 (React) with TypeScript
- **Backend**: Next.js API Routes (Server Actions)
- **Database**: PostgreSQL with Drizzle ORM
- **Authentication**: Better Auth (OAuth 2.0)
- **Encryption**: AES-256-GCM with HKDF key derivation
- **Deployment**: Vercel-ready (Next.js)

### Database Schema

The platform uses a well-structured PostgreSQL database with the following core tables:

1. **`user`** - User accounts (managed by Better Auth)
2. **`connected_accounts`** - Platform OAuth connections with encrypted tokens; `platformMetadata` (JSONB) stores e.g. `connectionMethod: 'direct' | 'facebook-page'`, `facebookPageId`, `instagramBusinessAccountId`, `publicationId` (Hashnode)
3. **`posts`** - Post content with original and AI-enhanced versions
4. **`post_publications`** - Per-platform publication tracking with retry logic
5. **`media_uploads`** - Media files with lifecycle management
6. **`user_settings`** - User preferences and subscription info
7. **`platform_rate_limits`** - Rate limit tracking per platform

---

## ✅ Completed Features

### 1. Authentication System

- ✅ **Better Auth Integration**: Complete OAuth 2.0 authentication system
- ✅ **Google Sign-In**: Users can sign in with Google accounts
- ✅ **Session Management**: Secure session handling with HTTP-only cookies
- ✅ **User Management**: User profiles with email verification support

### 2. Platform OAuth Integrations

The platform supports OAuth 2.0 connections for the following platforms:

#### ✅ Fully Implemented (OAuth 2.0)

1. **LinkedIn**
   - OAuth 2.0 with OpenID Connect
   - Scopes: `openid profile email`
   - Token refresh support
   - User profile fetching

2. **Instagram**
   - **Direct OAuth**: Meta/Instagram OAuth; scopes `instagram_business_basic`; stored with `platformMetadata.connectionMethod: 'direct'`.
   - **Via Facebook Page**: User chooses in modal → Facebook OAuth (scopes: `instagram_basic`, `instagram_content_publish`, `pages_show_list`, `pages_read_engagement`) → fetch Pages → check `instagram_business_account` → single save or selection UI; stored with `platformMetadata: { facebookPageId, instagramBusinessAccountId, connectionMethod: 'facebook-page' }`.
   - Both methods store as `platform: 'instagram'` in `connected_accounts`.

3. **YouTube**
   - Google OAuth 2.0
   - Scopes: `youtube.upload youtube`
   - Refresh token support with `offline.access`
   - Channel info fetching

4. **Pinterest**
   - Pinterest API v5 OAuth
   - Scopes: `boards:read boards:write pins:read pins:write` (and `user_accounts:read` for token exchange)
   - Image pins and video pins (`media_source` with `image_url` or `video_url`)
   - User account info fetching

5. **TikTok**
   - OAuth 2.0 with PKCE (Proof Key for Code Exchange)
   - Scopes: `user.info.basic`
   - PKCE verifier stored in database
   - User info fetching via TikTok API v2
   - **Publishing**: Video posts via `post/publish/video/init/`; photo posts via `post/publish/content/init/` with `media_type: "PHOTO"`, `post_mode: "MEDIA_UPLOAD"`. Images processed with sharp (resize/JPEG) and re-uploaded to R2 with `-tiktok-processed` suffix before sending to TikTok.

6. **X (Twitter)**
   - OAuth 2.0 with PKCE
   - Scopes: `tweet.read tweet.write users.read offline.access`
   - PKCE verifier stored in HTTP-only cookies
   - Basic Auth header for token exchange
   - Refresh token support (2-hour expiry)
   - User profile fetching via X API v2

7. **Threads**
   - Meta Graph API integration
   - Scopes: `threads_basic threads_content_publish`
   - User info fetching via Threads API

8. **Facebook**
   - Facebook (Page) OAuth; scopes `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`
   - Multiple Pages → selection page; single Page saves directly
   - Uses same Meta app as Instagram/Threads (`FACEBOOK_CLIENT_ID` / `FACEBOOK_CLIENT_SECRET`)

#### ⚠️ BYOK (Bring Your Own Keys)

9. **Bluesky**
   - BYOK: handle + app password (bsky.app/settings/app-passwords)
   - **Future**: Migrate to OAuth 2.0 when available

10. **Medium**
    - BYOK: Integration Token from medium.com/me/settings; `POST /api/connect/medium/byok`

11. **Hashnode**
    - BYOK: API key + Publication ID; `POST /api/connect/hashnode/byok`

12. **Dev.to**
    - BYOK: API key from dev.to/settings/extensions; `POST /api/connect/devto/byok`

### 3. Security & Encryption

- ✅ **Token Encryption**: AES-256-GCM encryption for all OAuth tokens
- ✅ **Per-Account Key Derivation**: HKDF with per-account salt
- ✅ **Secure Storage**: Tokens never exposed to frontend
- ✅ **State Encryption**: OAuth state parameters encrypted for CSRF protection
- ✅ **PKCE Support**: Implemented for TikTok and X (Twitter)

### 4. Database Infrastructure

- ✅ **Schema Design**: Complete database schema with relationships
- ✅ **Migrations**: Drizzle migrations configured and working
- ✅ **Type Safety**: Full TypeScript types for all database operations
- ✅ **Constraints**: Database-level validation for data integrity

### 5. UI Components

- ✅ **Dashboard Layout**: User dashboard with platform cards
- ✅ **Platform Cards**: Visual cards showing connection status
- ✅ **OAuth Error Handling**: User-friendly error messages
- ✅ **Loading States**: Skeleton loaders for better UX
- ✅ **Dark Mode**: Full dark mode support

### 6. API Routes

- ✅ **OAuth Connect Routes**: `/api/connect/[platform]` for OAuth; `/api/connect/instagram-facebook` for Instagram via Facebook Page; `/api/connect/facebook` for Facebook Pages
- ✅ **OAuth Callback Routes**: `/api/connect/[platform]/callback`; `/api/connect/instagram-facebook/callback`
- ✅ **Page/Account Selection**: `/api/connect/facebook/select`, `connect-page`; `/api/connect/instagram-facebook/select`, `connect-page`
- ✅ **BYOK**: `/api/connect/{bluesky,medium,hashnode,devto}/byok`
- ✅ **Account Management**: `/api/accounts`
- ✅ **Auth Routes**: `/api/auth/[...all]` (Better Auth)

---

## 🚧 In Progress / Partially Complete

### 1. Post Creation & Management

- ✅ **Database Schema**: Posts table with media support
- ✅ **Post Status Tracking**: Draft, scheduled, publishing, published, failed
- ✅ **Post Creation UI**: New post page at `/dashboard/posts/new` with content textarea, platform selection (connected accounts), save as draft / create post
- ✅ **Posts List**: `/dashboard/posts` lists all user posts with status, date, platform count, and link to view published post
- ✅ **Create Post Server Action**: Inserts post + `post_publications` rows for selected accounts (status pending)
- ⚠️ **Post Editor**: Edit existing posts not yet implemented
- ✅ **Media Upload API**: `POST /api/media/upload` — auth, validation (image/video types & size), DB record creation; CDN/storage URL still to be wired

### 2. Publishing System

- ✅ **Publication Tracking**: Database schema for per-platform publications; retry fields
- ✅ **Publishing API**: `executePublish` in `app/actions/publish.ts`; `publishToPlatform` in `lib/publish-platform.ts` with platform-specific publishers (Facebook, Bluesky, Hashnode, YouTube, Pinterest, Instagram, TikTok, Threads, Dev.to); LinkedIn handled in `publish.ts`. Pinterest: image and video pins. TikTok: video via `video/init/`, photo posts via `content/init/` (PHOTO, MEDIA_UPLOAD) with sharp-processed images re-uploaded to R2 (`-tiktok-processed`).
- ✅ **Platform-Specific Formatters**: Content/media validation and formatting per platform in `lib/publish-platform.ts` and `lib/publish-validation.ts`
- ✅ **Token Refresh**: Automatic refresh for YouTube and LinkedIn via `lib/token-refresh.ts` (`getValidToken`)

### 3. Scheduling System

- ✅ **Database Support**: `scheduledAt` timestamp field
- ⚠️ **Scheduler UI**: Not yet implemented
- ⚠️ **Cron Jobs**: Not yet implemented
- ⚠️ **Timezone Handling**: Schema ready, logic pending

---

## ❌ Not Yet Implemented

### 1. Post Types & Content Creation

The platform is designed to support **5 different post types**, but none are currently implemented:

#### 📝 Text Posts

- Simple text-only posts
- Character limit handling per platform
- Hashtag and mention detection
- **Supported Platforms**: All platforms

#### 🖼️ Image + Text Posts

- Single or multiple image uploads
- Image optimization and compression
- Platform-specific image requirements
- Alt text support
- **Supported Platforms**:
  - LinkedIn (images)
  - Instagram (single image or carousel)
  - X/Twitter (up to 4 images)
  - Threads (images)
  - Pinterest (pins with images)
  - Bluesky (images)
  - TikTok (photo posts; images processed via sharp, JPG/WEBP only, max 35)

#### 🎥 Video + Text Posts

- Video upload and transcoding
- Thumbnail generation
- Platform-specific video formats
- Video duration limits per platform
- **Supported Platforms**:
  - LinkedIn (videos)
  - Facebook (videos)
  - Instagram (Reels, IGTV)
  - YouTube (videos)
  - TikTok (videos and photo posts)
  - X/Twitter (videos)
  - Threads (video)
  - Bluesky (video)
  - Pinterest (video pins via `video_url`)

#### 🧵 Thread Posts

- Multi-part threaded posts
- Character limit per thread segment
- Thread ordering and structure
- **Supported Platforms**:
  - X (Twitter) - Native threads
  - Threads - Native threads
  - **Potential**: Bluesky (if thread-like posts are supported)

#### 📚 Blog Posts

- Long-form article content
- Rich text editor
- SEO optimization
- Featured images
- **Supported Platforms** (Future):
  - Medium (via Medium API)
  - Hashnode (via Hashnode API)
  - X Articles (via X API)
  - **Potential**: LinkedIn Articles, Dev.to

### 2. Media Management System

- ✅ **File Upload API**: `POST /api/media/upload` — accepts multipart file, validates type/size, creates `media_uploads` record (url/CDN TBD)
- ❌ **Media Processing**: Image compression, video transcoding
- ❌ **CDN Integration**: CloudFront/R2 CDN setup
- ❌ **Media Library UI**: Browse and manage uploaded media
- ❌ **Media Deduplication**: Hash-based duplicate detection
- ❌ **Media Cleanup**: Automatic cleanup of orphaned media

### 3. Publishing Engine

- ❌ **Platform-Specific Formatters**: Convert post content to platform format
- ❌ **API Integrations**: Post to each platform's API
- ❌ **Error Handling**: Retry logic and error reporting
- ❌ **Rate Limit Management**: Respect platform rate limits
- ❌ **Webhook Handling**: Handle platform webhooks for status updates

### 4. Scheduling System

- ❌ **Scheduler UI**: Calendar view for scheduled posts
- ❌ **Time Zone Support**: User timezone handling
- ❌ **Optimal Timing**: AI-suggested posting times
- ❌ **Cron Jobs**: Background job processor for scheduled posts
- ❌ **Queue System**: Job queue for publishing tasks

### 5. AI Enhancement Features

- ❌ **AI Integration**: OpenAI/Anthropic API integration
- ❌ **Content Optimization**: AI-powered content improvement
- ❌ **Hashtag Suggestions**: AI-generated hashtag recommendations
- ❌ **Platform Optimization**: AI adapts content per platform

### 6. Analytics & Insights

- ❌ **Post Performance**: Track views, likes, shares, comments
- ❌ **Platform Analytics**: Aggregate stats across platforms
- ❌ **Engagement Metrics**: Best performing content types
- ❌ **Reporting**: Export reports and insights

### 7. User Settings & Preferences

- ✅ **Database Schema**: User settings table exists
- ❌ **Settings UI**: User preferences interface
- ❌ **Default Platforms**: Set default platforms for posting
- ❌ **Notification Settings**: Email notification preferences

### 8. Subscription & Billing

- ✅ **Database Schema**: Subscription tier fields exist
- ❌ **Payment Integration**: Stripe/Paddle integration
- ❌ **Subscription Management**: Upgrade/downgrade flows
- ❌ **Usage Limits**: Enforce limits based on subscription tier

---

## 🔮 Future Plans & Roadmap

### Phase 1: Core Posting (Current Priority)

1. **Post Creation UI**
   - Rich text editor for post content
   - Media upload interface
   - Platform selection UI
   - Preview functionality

2. **Basic Publishing**
   - Text post publishing to all platforms
   - Image + text publishing
   - Error handling and retry logic

3. **Media Management**
   - File upload system
   - Image optimization
   - CDN integration

### Phase 2: Advanced Content Types

1. **Video Support**
   - Video upload and transcoding
   - Platform-specific video handling
   - Thumbnail generation

2. **Thread Support**
   - Thread creation UI
   - Multi-part post management
   - X and Threads native thread support

3. **Blog Platform Integration**
   - Medium API integration
   - Hashnode API integration
   - X Articles support
   - Rich text editor for blog posts

### Phase 3: Intelligence & Automation

1. **AI Features**
   - Content optimization
   - Hashtag suggestions
   - Platform-specific adaptations
   - A/B testing suggestions

2. **Scheduling Intelligence**
   - Optimal posting time detection
   - AI-suggested schedules
   - Auto-scheduling based on engagement data

3. **Analytics**
   - Post performance tracking
   - Cross-platform analytics
   - Engagement insights
   - ROI calculations

### Phase 4: Platform Expansion

1. **Additional Platforms**
   - Reddit (mentioned in schema)
   - Mastodon (mentioned in schema)
   - Peerlist (mentioned in schema)
   - ~~Facebook Pages~~ ✅ Done (Page OAuth + selection)
   - Discord (for community management)

2. **Blog Platform Expansion**
   - ~~Dev.to~~ ✅ BYOK done
   - LinkedIn Articles
   - Substack
   - Ghost

3. **Bluesky OAuth Migration**
   - Migrate from BYOK to OAuth 2.0 when available
   - Improve user experience

### Phase 5: Enterprise Features

1. **Team Collaboration**
   - Multi-user accounts
   - Role-based permissions
   - Approval workflows
   - Team analytics

2. **White-Label Options**
   - Custom branding
   - API access
   - Webhook integrations

3. **Advanced Automation**
   - RSS feed integration
   - Content curation
   - Auto-reply functionality
   - Social listening

---

## 📊 Platform Support Matrix

| Platform    | OAuth Status | Text | Images | Video | Threads | Blogs | Notes                              |
| ----------- | ------------ | ---- | ------ | ----- | ------- | ----- | ---------------------------------- |
| LinkedIn    | ✅ Complete  | ✅   | ✅     | ✅    | ❌      | 🔮    | Articles planned                   |
| Facebook    | ✅ Complete  | ✅   | ✅     | ✅    | ❌      | ❌    | Page-only; selection if multiple   |
| Instagram   | ✅ Complete  | ✅   | ✅     | ✅    | ❌      | ❌    | Direct OAuth or via Facebook Page  |
| YouTube     | ✅ Complete  | ✅   | ❌     | ✅    | ❌      | ❌    | Video-only platform                |
| Pinterest   | ✅ Complete  | ✅   | ✅     | ✅    | ❌      | ❌    | Image and video pins               |
| TikTok      | ✅ Complete  | ✅   | ✅     | ✅    | ❌      | ❌    | Video and photo posts; sharp processing for images |
| X (Twitter) | ✅ Complete  | ✅   | ✅     | ✅    | ✅      | 🔮    | X Articles planned                 |
| Threads     | ✅ Complete  | ✅   | ✅     | ✅    | ✅      | ❌    | Native threads                     |
| Bluesky     | ⚠️ BYOK      | ✅   | ✅     | ✅    | 🔮      | ❌    | App password; OAuth when available |
| Medium      | ⚠️ BYOK      | ✅   | ✅     | ❌    | ❌      | ✅    | Integration token                  |
| Hashnode    | ⚠️ BYOK      | ✅   | ✅     | ❌    | ❌      | ✅    | API key + Publication ID           |
| Dev.to      | ⚠️ BYOK      | ✅   | ✅     | ❌    | ❌      | ✅    | API key                            |

**Legend:**

- ✅ = Fully supported / Implemented
- ⚠️ = Partial support / In progress
- ❌ = Not supported by platform
- 🔮 = Planned for future

---

## 🔐 Security Considerations

### Implemented Security Features

1. **Token Encryption**
   - AES-256-GCM encryption
   - Per-account key derivation (HKDF)
   - Tokens never exposed to frontend
   - Secure key management

2. **OAuth Security**
   - PKCE for TikTok and X
   - Encrypted state parameters
   - CSRF protection
   - Secure redirect URIs

3. **Database Security**
   - Parameterized queries (Drizzle ORM)
   - Foreign key constraints
   - Input validation
   - SQL injection prevention

### Security Improvements Needed

1. **Rate Limiting**
   - API rate limiting per user
   - Platform-specific rate limit tracking
   - DDoS protection

2. **Media Security**
   - File type validation
   - Virus scanning
   - Content moderation
   - Access control

3. **Audit Logging**
   - User action logging
   - Security event tracking
   - Compliance reporting

---

## 🛠️ Development Status

### Current Sprint Focus

1. ✅ **OAuth Integration**: All platforms (OAuth + BYOK); Facebook Page + Instagram via Facebook Page; safeRedirect fix
2. ✅ **Post Creation UI**: New post page, posts list, create-post action
3. ✅ **Publishing Engine**: Platform publishers (Facebook, Bluesky, Hashnode, YouTube, Pinterest, Instagram, TikTok, Threads, Dev.to, LinkedIn); token refresh for YouTube and LinkedIn; TikTok photo posts with sharp image processing and MEDIA_UPLOAD
4. ✅ **Media Upload API**: Upload endpoint and DB record; CDN/storage integration pending
5. ⏳ **Media in posts**: Wire media IDs into post creation; attach uploads to posts
6. ⚠️ **Pinterest OAuth**: Investigate 401 on token exchange when connecting account

### Technical Debt

1. **Bluesky OAuth**: Migrate from BYOK to OAuth when available
2. **Error Handling**: Comprehensive error handling across all routes
3. **Testing**: Unit tests and integration tests needed
4. **Documentation**: API documentation and developer guides
5. **Monitoring**: Application monitoring and logging setup

### Known Issues

1. **Middleware Deprecation**: Next.js middleware convention deprecated, needs migration to proxy
2. **Platform Enum**: Some platforms in enum (reddit, mastodon, peerlist) not yet implemented
3. **Token Refresh**: Automatic refresh implemented for YouTube and LinkedIn (1h tokens). Instagram/Facebook/Threads use long-lived tokens; Twitter OAuth 1.0a and BYOK platforms do not require refresh.
4. **Existing Instagram rows**: Legacy rows may have null `platformMetadata.connectionMethod`; new direct connections set `'direct'`; Facebook Page flow sets `'facebook-page'`
5. **Pinterest OAuth 401**: Token exchange in `/api/connect/[platform]/callback` can return 401 for Pinterest; verify `PINTEREST_CLIENT_ID`/`PINTEREST_CLIENT_SECRET`, redirect URI, and Pinterest app settings if connection fails.

---

## 📝 Environment Variables

### Required Variables

```bash
# Database
DATABASE_URL=postgresql://...

# Authentication
BETTER_AUTH_URL=http://localhost:3000
BETTER_AUTH_SECRET=<64-char-secret>
GOOGLE_CLIENT_ID=<google-oauth-client-id>
GOOGLE_CLIENT_SECRET=<google-oauth-client-secret>

# App Configuration
NEXT_PUBLIC_APP_URL=http://localhost:3000
ENCRYPTION_KEY=<64-char-hex-key>

# Platform OAuth Credentials
LINKEDIN_CLIENT_ID=<linkedin-client-id>
LINKEDIN_CLIENT_SECRET=<linkedin-client-secret>
INSTAGRAM_CLIENT_ID=<instagram-client-id>
INSTAGRAM_CLIENT_SECRET=<instagram-client-secret>
YOUTUBE_CLIENT_ID=<youtube-client-id>
YOUTUBE_CLIENT_SECRET=<youtube-client-secret>
PINTEREST_CLIENT_ID=<pinterest-client-id>
PINTEREST_CLIENT_SECRET=<pinterest-client-secret>
TIKTOK_CLIENT_ID=<tiktok-client-id>
TIKTOK_CLIENT_SECRET=<tiktok-client-secret>
TWITTER_CLIENT_ID=<twitter-client-id>
TWITTER_CLIENT_SECRET=<twitter-client-secret>
THREADS_CLIENT_ID=<threads-client-id>
THREADS_CLIENT_SECRET=<threads-client-secret>
FACEBOOK_CLIENT_ID=<meta-app-id>
FACEBOOK_CLIENT_SECRET=<meta-app-secret>
```

**Where to get them:** Meta (Facebook/Instagram/Threads): [developers.facebook.com](https://developers.facebook.com/apps/) → App → Settings → Basic (App ID, App Secret). Same app can be used for Facebook, Instagram (via Page), and Threads.

**BYOK (no app env vars):** Medium, Hashnode, Dev.to, Bluesky — users add their own keys/tokens in the dashboard.

---

## 🎯 Success Metrics

### Current Metrics

- ✅ **12 Platforms**: LinkedIn, Facebook, Instagram (direct + via Page), YouTube, Pinterest, TikTok, X, Threads, Bluesky, Medium, Hashnode, Dev.to
- ✅ **8 OAuth Flows**: LinkedIn, Instagram (direct), YouTube, Pinterest, TikTok, X, Threads, Facebook (+ Instagram via Facebook Page)
- ✅ **4 BYOK Flows**: Bluesky, Medium, Hashnode, Dev.to
- ✅ **100% Type Safety**: Full TypeScript coverage
- ✅ **Zero Build Errors**: Production-ready build

### Target Metrics (Post-Launch)

- **Post Creation Time**: < 2 minutes for multi-platform post
- **Publishing Success Rate**: > 99% success rate
- **Media Upload Speed**: < 5 seconds for images, < 30 seconds for videos
- **User Satisfaction**: > 4.5/5 rating
- **Platform Coverage**: Support for 10+ platforms

---

## 📚 Documentation

### Existing Documentation

- ✅ `SETUP.md` - Initial setup instructions
- ✅ `PINTEREST_TIKTOK_SETUP.md` - Platform-specific setup guides
- ✅ `PLATFORM_SETUP.md` - Platform configuration guide
- ✅ `db/README.md` - Database schema documentation

### Documentation Needed

- ❌ API Documentation (OpenAPI/Swagger)
- ❌ User Guide
- ❌ Developer Guide
- ❌ Platform Integration Guide
- ❌ Troubleshooting Guide

---

## 🤝 Contributing

### Development Workflow

1. **Feature Branch**: Create feature branch from `main`
2. **Development**: Implement feature with tests
3. **Code Review**: Submit PR for review
4. **Testing**: Ensure all tests pass
5. **Deployment**: Merge to `main` triggers deployment

### Code Standards

- **TypeScript**: Strict mode enabled
- **ESLint**: Configured and enforced
- **Prettier**: Code formatting
- **Conventions**: Follow Next.js best practices

---

## 📞 Support & Contact

For questions, issues, or contributions, please refer to the project repository or contact the development team.

---

**Last Updated**: February 21, 2026  
**Version**: 0.1.0 (Alpha)  
**Status**: Active Development
