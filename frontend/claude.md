# Social0 Frontend — AI Guidance

This document is the **single source of truth for AI assistants** working in the Social0 codebase. It describes what the product is, how code is organized, architecture rules, known mistakes, and operational constraints. Read it before making changes so behavior stays consistent and safe.

**Audience:** Any AI (Claude, Cursor, Copilot, etc.) or human contributor editing `frontend/`.

**Related:** Product docs live in the separate **`social0-docs/`** Fumadocs app (`social0-docs/claude.md`). User-facing docs URLs are built in `lib/docs-url.ts`.

---

## 0. Project overview

### What Social0 is

Social0 is a **multi-platform social media scheduler and publisher**. Users connect accounts (LinkedIn, Facebook Pages, Instagram, YouTube, X/Twitter, Threads, Pinterest, TikTok, Bluesky), compose posts (text, image, video, threads, collections), schedule or publish immediately, and manage drafts, calendar, billing, auto-plug, and resurface features.

### Monorepo layout

| Path | Role |
|------|------|
| **`frontend/`** | **Main app** — Next.js 16 App Router, Drizzle/Postgres, Better Auth, publishing, dashboard, landing, billing. **All active development happens here.** |
| **`social0-docs/`** | Standalone Fumadocs site for product documentation. |
| **`backend/`** | Legacy/skeleton Hono API (`/v1/posts` stubs). **Not wired into the frontend.** Do not assume it runs in production. |

### Supported platforms

Canonical list: `lib/platforms.ts` (`Platform`, `PLATFORMS`, `PLATFORM_OAUTH_CONFIG`).

- **OAuth 2.0:** LinkedIn, Instagram (direct), YouTube, Pinterest, TikTok (PKCE), Threads, Facebook Pages.
- **OAuth 1.0a:** Twitter/X (separate flow, not in `PLATFORM_OAUTH_CONFIG`).
- **BYOK:** Bluesky (`/api/connect/bluesky/byok`).
- **Instagram via Facebook Page:** `/api/connect/instagram-facebook` → page picker → select.

Content types and allowed platforms: `lib/content-types.ts` (text, image, video, threads, collection).

---

## 1. Architecture rules

### 1.1 Tech stack

- **Framework:** Next.js 16 (App Router).
- **Runtime:** Node (server) + React 19 (client).
- **Database:** PostgreSQL via Drizzle ORM; schema in `db/schema.ts`, migrations in `db/migrations/`.
- **Auth:** Better Auth (Google OAuth + email/password); tables `user`, `session`, `account`, `verification` are owned by Better Auth — do not create app migrations that alter these; reference them for FKs and adapter only.
- **Storage:** Cloudflare R2 (S3-compatible) for media; optional — use `isR2Configured()` / `getR2Client()` / `getPresignedUploadUrl()` from `lib/r2.ts`. Media upload uses presign → client PUT → confirm flow; see §1.6.
- **Rate limiting:** Upstash Redis via `lib/ratelimit.ts` (API routes: upload, publish, OAuth, billing, sign-up). **Edge/network boundary:** `proxy.ts` + `lib/edge-ratelimit.ts` (page loads and `/api/auth/*` before SSR/Better Auth). See §1.13.
- **Styling:** Tailwind CSS v4; UI primitives from Radix/shadcn in `components/ui/`.
- **Validation:** Zod for env (`lib/env.ts`); shared validation in `lib/validation.ts` and `lib/publish-validation.ts`.
- **Billing:** Dodo Payments (optional); subscription tier in `user_settings`; checkout guards in `lib/billing-guards.ts` and `lib/pending-checkout.ts`; plans/limits in `lib/plans.ts`, `lib/plan-limits.ts`, `lib/subscription.ts`, `lib/billing-sync.ts`. See §1.8.
- **Sign-up:** Cloudflare Turnstile optional (`app/api/auth/sign-up-with-turnstile/route.ts`); error mapping in `lib/sign-up-errors.ts`.
- **Feedback:** Canny (embedded board); SSO via `GET /api/canny/sso`; see §1.11.

### 1.2 Directory layout

- **`app/`** — App Router: routes, layouts, server components, server actions.
  - **`app/api/`** — API routes only (REST-style or cron). No page components here.
    - **`app/api/billing/`** — Checkout, portal, sync, change-plan (Dodo Payments).
    - **`app/api/media/`** — `presign/` (get presigned PUT URL), `confirm/` (record upload after client PUT), `upload/` (deprecated; prefer presign + confirm).
    - **`app/api/cron/`** — `publish-scheduled`, `repost`, `autoplug`, `token-health`.
    - **`app/api/auth/`** — Better Auth catch-all, subscription-check, sign-up-with-turnstile.
    - **`app/api/connect/`** — OAuth and BYOK (Bluesky); Instagram-Facebook; **Facebook page select** (`facebook/select/`).
    - **`app/api/webhooks/dodo/`** — Dodo Payments webhook for subscription events.
    - **`app/api/canny/sso/`** — GET returns JWT for Canny SSO (auth required).
  - **`app/actions/`** — Server actions (`"use server"`): `publish.ts`, `posts.ts`, `resurface.ts`, `settings.ts`, `onboarding.ts`.
  - **`app/dashboard/`** — Dashboard layout and pages; layout enforces auth, onboarding redirect, sidebar + bottom nav; `SubscriptionSync` in layout.
  - **`app/dashboard/create/forms/`** — Five create forms: `TextPostForm`, `ImagePostForm`, `VideoPostForm`, `ThreadsPostForm`, `CollectionPostForm`. All use `publishPostWithParallelProgress` from `lib/publish-order.ts` for live per-platform progress.
  - **`app/dashboard/connections/facebook/select/`** — Facebook Page picker UI (after OAuth, before DB save).
  - **`app/onboarding/`** — Plan → goal (step2) → connect (step3) → done (step4).
- **`components/`** — Reusable React components.
  - **`components/ui/`** — Design system (shadcn/Radix).
  - **`components/dashboard/`** — Sidebar, bottom nav, `ConnectPlatformButton`, `SubscriptionSync`, disconnect modal.
  - **`components/landing/`** — Marketing pages (hero, features, mockups).
  - **`components/autoplug/`**, **`components/repost/`**, **`components/bulk-tools/`**, **`components/onboarding/`** — Feature UI.
  - **Key shared:** `AccountPicker`, `AccountBubbleSelector`, `AccountAvatar`, `CaptionCounter`, `UploadPublishOverlay`, `TikTokSettings` (inline hardcoded form, no creator-info API), `PinterestConfigInline`, `ConnectPlatformButton`, `PreConnectModal`, `InstagramConnectionModal`, `BlueskyByokModal`, `OAuthErrorHandler`.
- **`lib/`** — Pure or mostly pure logic (no React components). Notable modules:
  - **Platforms & OAuth:** `platforms.ts`, `facebook-scopes.ts` (client-safe scope strings), `facebook-oauth.ts` (**server-only** — imports `env.ts`), `preconnect.ts`.
  - **Publish:** `publish-platform.ts`, `publish-order.ts`, `publish-validation.ts`, `platform-view-url.ts` (TikTok profile links).
  - **Media:** `upload-file.ts`, `r2.ts`, `tiktok-photo-process.ts`, `video-duration.ts`, `video-aspect-ratio.ts`.
  - **Billing & plans:** `plans.ts`, `plan-limits.ts`, `subscription.ts`, `billing-sync.ts`, **`billing-guards.ts`**, **`pending-checkout.ts`**.
  - **Edge / proxy:** `edge-ratelimit.ts`, `proxy-request.ts`; network entry is **`proxy.ts`** (Next.js 16+, not `middleware.ts`).
  - **Other:** `encryption.ts`, `token-refresh.ts`, `token-health.ts`, `composer-bridge.ts`, `pinterest-settings.ts`, `sign-up-errors.ts`, `docs-url.ts`, `client-ip.ts`, `database-url.ts`.
- **`db/`** — Drizzle schema (`schema.ts`), migrations, `db/README.md`. Repair script: `scripts/db-repair-migrate.ts` when schema drifted ahead of journal.
- **`proxy.ts`** — Network boundary (sets `x-pathname`, edge rate limits). Matcher: `/`, `/auth`, `/dashboard`, `/api/auth`, `/api/connect`, `/api/accounts`.

### 1.3 Conventions

- **Imports:** Prefer `@/` aliases (e.g. `@/db`, `@/lib/env`, `@/components/...`).
- **Server vs client:** Use `"use client"` only where needed (hooks, browser APIs, interactivity). Keep server components and server actions as the default.
- **Auth in API routes:** Use `auth.api.getSession({ headers: await headers() })`; if no session, return 401 (or redirect for page routes). Dashboard layout already redirects unauthenticated users from `/dashboard/*`.
- **Env (server-only):** All server env is validated at startup via `lib/env.ts` (Zod). Use `env` from `@/lib/env` in **server code only** (API routes, server actions, server components that never leak to client bundles). Do not read `process.env` directly for keys in the schema.
- **Client-safe shared constants:** Modules imported by client components (`lib/platforms.ts`, create forms, settings UI) **must not** transitively import `lib/env.ts`. Scope strings live in `lib/facebook-scopes.ts`; OAuth URL building lives in `lib/facebook-oauth.ts` (server routes only). See §2.9.
- **Platform IDs:** Use `lib/platforms.ts`. Bluesky is BYOK; Twitter/X is OAuth 1.0a (handled separately).
- **Plan limits and gating:** `checkAccountLimits`, `checkBulkToolsAllowed`, `checkAutoPlugAllowed`, `checkResurfaceAllowed`, `checkTwitterTweetLimit` from `lib/plan-limits.ts`.
- **Caption length (UI):** `lib/platform-limits.ts` + `CaptionCounter` component.
- **Video validation (client):** Do not block by aspect ratio; warn only via `getAspectRatioGuidance`. Max duration 300s via `lib/video-duration.ts`.
- **Redirects in route handlers:** Use `safeRedirect(url, fallback)` from `lib/redirect.ts`.
- **Cron:** Handlers under `app/api/cron/*`, invoked by Vercel Cron (`vercel.json`). In dev, `DevScheduledPostPoller` polls these; do not rely on polling in production.
- **Cron auth:** `lib/cron-auth.ts` validates `Authorization: Bearer <CRON_SECRET>` with constant-time comparison; skipped in development.
- **Next config:** `outputFileTracingRoot` and `turbopack.root` point at `frontend/` for monorepo lockfile resolution.

### 1.4 Database

- **Schema:** Single source of truth is `db/schema.ts`. Enums: `platform`, `post_status`, `publication_status`. Key tables: Better Auth tables; `connected_accounts` (includes `is_twitter_premium`, `platformMetadata` JSON); `media_uploads`, `posts`, `post_publications`, `user_settings`, **`trial_claims`** (one trial per normalized billing email), `platform_rate_limits`, `resurface_schedules`, `resurface_events`, `auto_plugs`.
- **Posts:** CHECK constraint — either non-empty `final_content` or at least one `media_id`. Enforce the same in app validation.
- **Migrations:** Generate with `npm run db:generate`; run with `npm run db:migrate`. Never edit existing `.sql` files or `_journal.json` (see §2.6). Use **direct** Neon URL for migrate (`DATABASE_URL_UNPOOLED` or strip `-pooler.` from host — see `drizzle.config.ts`). If migrate fails with “already exists” drift, run `npx tsx scripts/db-repair-migrate.ts`.
- **Encryption:** OAuth state and tokens are encrypted **on the server** in `lib/encryption.ts` (AES-256-GCM, HKDF per-account salt; format `version:salt:iv:ciphertext:authTag`). Never log or expose tokens to the client. See `db/README.md`.

### 1.5 OAuth and connect flows

- **Generic OAuth 2.0:** Entry `app/api/connect/[platform]/route.ts`; callback `app/api/connect/[platform]/callback/route.ts`.
- **Twitter/X:** OAuth 1.0a only. Request token in encrypted cookie; callback uses `oauth_token` + `oauth_verifier`.
- **TikTok:** PKCE. Code verifier in `verification` table (not in state — state size ~512 chars). On connect, store **`username`** and `profile_deep_link` in `platformUsername` / `platformMetadata.profileUrl` — **never** use `display_name` as the handle (see §2.10). **Connect route:** no OAuth rate limit / session-binding (plain redirect); callback skips `assertOAuthCallbackSession` — encrypted state + PKCE only. Scopes include `user.info.profile` for `@handle`.
- **Instagram (Meta):** (1) Direct Instagram OAuth, or (2) Instagram via Facebook Page (`/api/connect/instagram-facebook/...` → page list → POST `/api/connect/instagram-facebook/select`).
- **Pinterest:** After token exchange, fetch boards; redirect to board select or create-board flow; selection stored via `verification` table.
- **Facebook Pages (important — differs from old docs):**
  1. User clicks Connect → `GET /api/connect/facebook` → Meta OAuth (see §1.5.1).
  2. Callback fetches `/me/accounts` but **does not** insert `connected_accounts` yet.
  3. Pages JSON is stored in `verification` with identifier `facebook_pages` (5-minute TTL) and a `stateId` token.
  4. User is redirected to **`/dashboard/connections/facebook/select?token=...`**.
  5. User picks **one** page → **`POST /api/connect/facebook/select`** saves a single row with the **page access token** (not the user token).
  6. Multiple Facebook Pages require multiple connect flows (one page per connection).
- **BYOK:** Bluesky only — `/api/connect/bluesky/byok/route.ts` (handle + app password).

#### 1.5.1 Facebook Login for Business

Production Facebook connect should use **Facebook Login for Business** with a Meta **configuration ID**:

- Env: `FACEBOOK_LOGIN_CONFIG_ID` (and optional `FACEBOOK_INSTAGRAM_LOGIN_CONFIG_ID` for Instagram-via-Facebook).
- URL builder: `lib/facebook-oauth.ts` → `buildFacebookOAuthUrl({ configId, ... })`. When `config_id` is set, **do not** send `scope` (Meta recommendation).
- Fallback without config ID: scope-based OAuth using strings from **`lib/facebook-scopes.ts`** only:
  - Facebook Pages: `pages_show_list,pages_read_engagement,pages_manage_posts`
  - Instagram-via-Facebook: above + `business_management`
- **`lib/facebook-oauth.ts` imports `env.ts`** — never import it from client-bound modules.

#### 1.5.2 Connect UI

- **`ConnectPlatformButton`** (`components/dashboard/ConnectPlatformButton.tsx`): Primary connect entry on connections/onboarding. Handles pre-connect modals (`PreConnectModal`, `InstagramConnectionModal`, `BlueskyByokModal`), plan-limit disabled state, and `returnTo` query for onboarding.
- **`PRE_CONNECT`** config in `lib/preconnect.ts`: Platforms that show an informational modal before OAuth.
- OAuth errors surfaced via query params; **`OAuthErrorHandler`** maps codes like `no_facebook_pages`, `oauth_failed`, `limit_reached`.

### 1.6 Publishing and media

#### Publish pipeline (server)

- **`executePublish(postId)`** in `app/actions/publish.ts`:
  1. Loads post + publications; validates ownership.
  2. Marks post and pending publications as **`publishing`** (prevents double publish).
  3. Runs **`Promise.allSettled`** over all platform publish tasks — **platforms publish in parallel on the server**.
  4. Each task calls platform logic in **`lib/publish-platform.ts`** (with `getValidToken()` refresh where applicable).
  5. Updates `post_publications` rows and sets terminal post status (`published`, `failed`, or `partial`). Never leave post stuck in `publishing`.
- **Thread/Bluesky containers:** Do not create all containers upfront; each step waits for the previous publish (see comments in `lib/publish-platform.ts`).

#### Publish UI (client)

- **Do not** call separate server actions per platform from the client — Next.js serializes multiple server actions and makes publish feel sequential (~47s+).
- Use **`publishPostWithParallelProgress`** from **`lib/publish-order.ts`**:
  - Single `publishPost(postId)` server action (one round trip).
  - Polls `getPostPublicationList(postId)` every **1.2s** for per-platform status, `platformPostUrl`, `lastError`.
  - `sortBySlowPlatformsLast` orders TikTok/Threads last in the **progress UI only** (not server execution order).
- All five create forms and the composer flow should follow this pattern.

#### Platform “View” links

- **`lib/platform-view-url.ts`**: `getPublicationViewUrl()` for post detail “View on platform”.
- **TikTok:** Links to **creator profile** (`https://www.tiktok.com/@handle`), not display name or wrong video ID. Resolves from `platformMetadata.profileUrl`, `platformUsername`, or API (`fetchTikTokConnectAccount`). On successful TikTok publish, `publish.ts` may backfill `platformUsername` and `profileUrl` on `connected_accounts`.
- **Instagram:** Profile/view links use **`platformUsername` (handle)**, not numeric Graph API id — `resolveInstagramProfileUrl()` / `buildInstagramProfileUrl()` in `lib/platform-view-url.ts`.

#### Media

- **Preferred upload:** presign → client PUT → confirm via `lib/upload-file.ts`. Rate limiting on presign.
- **Rules:** MIME + magic bytes validation; images up to 50MB, videos up to 500MB; stored under `uploads/{userId}/{uuid}.{ext}`.
- **TikTok images:** `lib/tiktok-photo-process.ts` resizes/converts for TikTok min size rules.

### 1.7 Token health

- **Proactive:** `app/api/cron/token-health/route.ts` daily 6 AM via `lib/token-health.ts`.
- **On-demand:** `getValidToken()` in `lib/token-refresh.ts` before each publish.

### 1.8 Subscription and billing

- **Tiers:** `free`, `starter`, `growth` in `lib/plans.ts`.
- **Storage:** `user_settings.subscriptionTier`, `subscriptionExpiresAt`, `subscriptionId`, `customerId`, `hasUsedTrial` (sticky once user ever had a paid tier), `pendingPlanTier`, `subscriptionCancelAtPeriodEnd`.
- **Trial dedup:** `trial_claims` table — one row per **normalized** billing email (`normalizeBillingEmail()` in `billing-guards.ts` strips Gmail `+alias` and dots). Written on successful webhook activation; checkout sets `subscription_data.trial_period_days` to **0** if trial already claimed.
- **Checkout (`POST /api/billing/checkout`):**
  1. `evaluateCheckoutEligibility()` — block if active paid tier, or any open Dodo sub (`active` / `on_hold` / `pending`); returns `code: use_change_plan` or `use_portal`.
  2. `resolveCheckoutSession()` in `pending-checkout.ts` — **one pending checkout per user** (Redis, 1h TTL); double-tab returns same `cks_…` URL; concurrent creates serialized with Redis lock.
  3. Passes `trial_period_days: 7 | 0` explicitly to Dodo (do not rely on product default alone).
- **Change plan (`POST /api/billing/change-plan`):** In-place `changePlan` on existing `subscriptionId`. Trial users (`previous_billing_date` empty) must use checkout (`trial_upgrade_requires_checkout`). `on_hold` → `use_portal`.
- **Webhook (`POST /api/webhooks/dodo`):** Idempotent via `claimWebhookDelivery`. Tier updates only when subscription `active`. **Upgrades** require a recent **paid** payment (`total_amount > 0`) via `findRecentPaidUpgradePayment`. Ignores duplicate `subscription_id` when user already has canonical active sub. `subscription.on_hold` → revert user to `free`. Clears pending checkout on success. Records `trial_claims`.
- **Sync:** `syncSubscriptionForUserId()` in `lib/billing-sync.ts` (client poll after checkout); webhook is primary source of truth.
- **Portal:** `POST /api/billing/portal` → Dodo customer portal (allowlisted redirect domains only).
- **Gating:** `lib/plan-limits.ts` before connect, bulk tools, auto-plug, resurface, Twitter publish. `hasUsedTrial` drives “Start trial” vs “Upgrade” copy in billing/onboarding.

### 1.9 Onboarding

- New users redirected to `/onboarding` when `getOnboardingStatus().shouldOnboard`.
- Steps: plan → goal (step2) → connect (step3) → done (step4). `setOnboardingCompleted()` unlocks dashboard.

### 1.10 Twitter (X) Premium

- `connected_accounts.is_twitter_premium` → 25k vs 280 char limit via `lib/platform-limits.ts`. Set on connect + manual refresh on connections page.

### 1.11 Canny feedback

- SSO: `GET /api/canny/sso` → JWT with `env.CANNY_PRIVATE_KEY`.
- Client: `app/dashboard/feedback/page.tsx` loads Canny SDK with `NEXT_PUBLIC_CANNY_BOARD_TOKEN`. Fallback link to https://social0.canny.io.

### 1.12 Meta developer dashboard (operational)

For **use-case-based** Meta apps (common for Social0):

- Permissions are under **Use cases → Manage everything on your Page → Customize → Permissions and features** (not a legacy “Permissions and Features” sidebar).
- **`pages_*` permissions** should show **“Ready to publish”** for production posting.
- **`public_profile` stuck at “Ready for testing”** (= Standard Access) blocks **external** Facebook Login users (testers/roles only). Fix in Meta dashboard by completing app review / removing testing-only permission states — not fixable in code alone.
- Production: set **`FACEBOOK_LOGIN_CONFIG_ID`** in hosting env (Vercel) when using Login for Business.

### 1.13 Edge rate limiting (`proxy.ts`)

Next.js 16 uses **`proxy.ts`** at the network boundary (replaces deprecated `middleware.ts` for this app).

- **Page limit** (`edgePageIpLimiter`): **300/min per IP** — only **full document loads** (`isFullPageDocumentRequest()` in `lib/proxy-request.ts`). **Do not** count RSC flights (`Rsc: 1`), router prefetches, or `text/x-component` requests — one dashboard refresh fans out to dozens of internal requests; counting all of them caused false 429s.
- **Auth limit** (`edgeAuthIpLimiter`): **120/min per IP** on `/api/auth/*` (sign-up, sign-in, etc.).
- **Session poll** (`edgeAuthSessionPollLimiter`): **600/min per IP** for `get-session`, `subscription-check`.
- **Fails open** if Redis unavailable (site stays up; limits disabled briefly). API route limits in `lib/ratelimit.ts` are separate and may fail closed in production.
- **TikTok connect** bypasses `oauthLimiter` in connect route (by design); other platforms use `oauthLimiter` (120/10min per user).

---

## 2. Known mistakes — what went wrong and how to fix it

### 2.1 NEXT_REDIRECT in catch blocks (critical)

In route handlers that call `redirect()` inside `try/catch`, **rethrow** Next.js redirect errors before any other handling:

```ts
if ((err as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw err;
if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
```

Critical files: OAuth callbacks and select routes under `app/api/connect/`.

### 2.2 Redirect URL must be a string (safeRedirect)

Use `safeRedirect(url, fallback)` from `lib/redirect.ts`. Never pass objects to `redirect()`.

### 2.3 OAuth state and TikTok PKCE

Store PKCE verifier in `verification` table; state holds only short `stateId` + `userId` + `platform`.

### 2.4 Double publish / stuck "publishing"

Mark post/publications as `publishing` at start of `executePublish`; always set terminal status when done.

### 2.5 Account and media ownership

Every `connectedAccountId` and `mediaId` must belong to the session user before create/update/publish.

### 2.6 Migration file corruption

Never edit existing migration `.sql` files or `_journal.json`. Always `npm run db:generate` for new migrations.

### 2.7 Platform enum removal

When removing a platform from `platformEnum`, delete existing rows in the migration first, then alter enum.

### 2.8 Facebook: page picker, NOT save-all-pages (critical)

**Wrong (old behavior/docs):** OAuth callback saves every Page in a loop → multiple `connected_accounts` rows automatically.

**Correct (current code):** Callback caches pages in `verification` (`facebook_pages`) and redirects to **`/dashboard/connections/facebook/select`**. User selects **one** page; **`POST /api/connect/facebook/select`** persists **one** row with the page access token. Do not revert to save-all or remove the picker without an explicit product decision.

### 2.9 Client bundle must not import `env.ts` (critical)

**Symptom:** Settings or connections page crashes in browser with **ZodError** from `lib/env.ts`.

**Cause:** Client component imports a chain like `platforms.ts` → `facebook-oauth.ts` → `env.ts`, which runs Zod parse in the browser where server env vars are missing.

**Fix:**
- Keep scope strings in **`lib/facebook-scopes.ts`** (no env import).
- Keep **`lib/facebook-oauth.ts`** server-only (API routes).
- Before adding imports to `lib/platforms.ts` or any `"use client"` file, trace the import graph — **nothing that imports `env.ts` may reach the client bundle**.

### 2.10 TikTok: display name ≠ username

**Wrong:** Storing TikTok `display_name` as `platformUsername` → broken “View on TikTok” links like `@Abhishek%20BR`.

**Correct:** Store `username` and `profile_deep_link` on connect; use `lib/platform-view-url.ts` for links; backfill on publish success. `isLikelyTikTokHandle()` rejects strings with spaces.

### 2.11 Per-platform server actions make publish feel sequential

**Wrong:** Calling `publishPost` once per platform from the client (or multiple server actions in a loop).

**Correct:** One `publishPost` call; server uses `Promise.allSettled`; client uses **`publishPostWithParallelProgress`** for polling UI.

### 2.12 Billing: unchecked checkout creates duplicate Dodo subscriptions (critical)

**Wrong:** `checkoutSessions.create()` on every Upgrade click with no guards; product-default `trial_period_days`; webhook upgrades tier on any `active` event including ₹0 trial payments.

**Correct (current code):**
- `evaluateCheckoutEligibility()` before checkout; `resolveCheckoutSession()` for idempotency.
- Explicit `subscription_data.trial_period_days`; `trial_claims` + `hasUsedTrial`.
- Webhook: paid upgrade verification, ignore duplicate sub IDs, `on_hold` → free, `clearPendingCheckout`.
- UI handles `use_portal`, `use_change_plan`, `checkout_in_progress` (reuse existing URL).

### 2.13 Edge rate limit counted every RSC request as a page view

**Wrong:** Rate-limit every `GET /dashboard/*` in `proxy.ts` — a few refreshes exhaust 120/min.

**Correct:** Only throttle `isFullPageDocumentRequest()` (browser hard reload with `Accept: text/html`). RSC/prefetch passes through.

### 2.14 Instagram profile links use numeric user id

**Wrong:** `instagram.com/{platformUserId}` from Graph API numeric id.

**Correct:** `platformUsername` handle via `resolveInstagramProfileUrl()` in `lib/platform-view-url.ts`.

---

## 3. Constraints — security, performance, and cost

### 3.1 Security

- **Env:** Never commit `.env`. Server keys via `lib/env.ts` only on server. Client may use `NEXT_PUBLIC_*` vars defined in schema.
- **Auth:** Session check on all user-data API routes and server actions.
- **OAuth state:** Encrypted; includes `userId` + `platform`; verify on callback.
- **Tokens:** Encrypted in DB only; never log or send to client.
- **Media URLs (SSRF):** Allowlist via `isAllowedMediaUrl` / `getAllowedMediaOrigins` in `lib/publish-validation.ts`.
- **Uploads:** Magic-byte validation, size limits, sanitized filenames.
- **Cron:** Protected by `lib/cron-auth.ts` in production.

### 3.2 Performance

- **Publish:** Server runs all platforms **in parallel** (`Promise.allSettled`). UI uses one server action + polling — not N actions.
- **Bluesky/Threads:** Sequential **within** a single thread/carousel publish (platform API constraint), but different platforms still run in parallel.
- **DB:** Use indexed columns for frequent filters (`posts.status`, `posts.scheduledAt`, etc.).
- **Package imports:** `optimizePackageImports` in `next.config.ts` for large icon libraries.

### 3.3 Cost and limits

- **R2:** Optional; fail gracefully with clear message if not configured.
- **Platform limits:** `lib/platform-limits.ts` (UI), `lib/publish-validation.ts` (server).
- **Plan limits:** Enforce before connect and feature use.
- **Rate limits (API):** Upstash via `lib/ratelimit.ts` — upload, publish, oauth (except TikTok connect), checkout, sign-up, billing sync, etc.
- **Rate limits (edge):** `proxy.ts` + `lib/edge-ratelimit.ts`; document loads only (see §1.13). Requires `UPSTASH_REDIS_REST_URL` + token on Vercel.
- **Cron:** Idempotent; respect Vercel `maxDuration` (e.g. 60s for publish-scheduled).

### 3.4 Token management rules

- **YouTube:** 1h access token; require refresh token (`access_type=offline&prompt=consent`).
- **TikTok:** Refresh tokens rotate — save new refresh token on every refresh.
- **Instagram/Threads:** 60-day tokens; refresh when < 14 days remain.
- **LinkedIn:** 60-day tokens; refresh when < 7 days remain.

### 3.5 Soft delete on disconnect

Revoke token on platform (best effort), then DELETE `connected_accounts` row. `post_publications.connected_account_id` is `ON DELETE SET NULL` — history preserved.

---

## 4. Quick reference

| Area | Location / rule |
|------|------------------|
| **Main app** | `frontend/` only; `backend/` is unused skeleton |
| **Product docs** | `social0-docs/`; URLs in `lib/docs-url.ts` |
| Env (server) | `lib/env.ts`; never import from client-bound modules |
| Client-safe scopes | `lib/facebook-scopes.ts` |
| Facebook OAuth URLs | `lib/facebook-oauth.ts` (server routes only) |
| Platform list | `lib/platforms.ts` |
| Content types | `lib/content-types.ts` |
| Auth in API | `auth.api.getSession({ headers: await headers() })`; 401 if no session |
| Redirect in catch | Rethrow `NEXT_REDIRECT` before other handling |
| Safe redirect | `safeRedirect(url, fallback)` from `lib/redirect.ts` |
| PKCE (TikTok) | Verifier in DB; state has `stateId` only |
| Publish (server) | `executePublish` → `Promise.allSettled` in `app/actions/publish.ts` |
| Publish (client UI) | `publishPostWithParallelProgress` in `lib/publish-order.ts` |
| Publish platform logic | `lib/publish-platform.ts` |
| TikTok view links | `lib/platform-view-url.ts` → `getPublicationViewUrl`, `fetchTikTokConnectAccount` |
| Instagram view links | `lib/platform-view-url.ts` → `resolveInstagramProfileUrl` (handle, not numeric id) |
| Media upload | `lib/upload-file.ts`: presign → PUT → confirm |
| Media SSRF | `isAllowedMediaUrl` / `getAllowedMediaOrigins` |
| Plan limits | `lib/plan-limits.ts` + `lib/plans.ts` |
| Facebook connect | OAuth → `verification` → `/dashboard/connections/facebook/select` → POST select (one page) |
| Facebook Login for Business | `FACEBOOK_LOGIN_CONFIG_ID`; `buildFacebookOAuthUrl` |
| Instagram-Facebook | POST `/api/connect/instagram-facebook/select` |
| BYOK | Bluesky: `/api/connect/bluesky/byok` |
| Connect button | `components/dashboard/ConnectPlatformButton.tsx` |
| Create forms | `app/dashboard/create/forms/*PostForm.tsx` (5 forms) |
| TikTok settings UI | `components/TikTokSettings.tsx` (hardcoded; no creator-info fetch) |
| Pinterest settings type | `lib/pinterest-settings.ts` |
| Sign-up errors | `lib/sign-up-errors.ts` |
| Cron auth | `lib/cron-auth.ts` |
| Crons | `vercel.json`: publish-scheduled, repost, autoplug; token-health 6 AM |
| Token refresh | `getValidToken()` in `lib/token-refresh.ts` |
| Billing checkout guards | `lib/billing-guards.ts`, `lib/pending-checkout.ts`; `trial_claims` table |
| Billing routes | `app/api/billing/checkout`, `change-plan`, `portal`, `sync`; webhook `app/api/webhooks/dodo` |
| Edge rate limits | `proxy.ts`, `lib/edge-ratelimit.ts`, `lib/proxy-request.ts` |
| DB migrate (Neon) | Direct URL / `DATABASE_URL_UNPOOLED`; repair: `scripts/db-repair-migrate.ts` |
| Migration safety | Never edit existing `.sql`; use `db:generate` |
| Meta dashboard | Use-case permissions; `public_profile` testing blocks external login |

---

## 5. When adding new code

1. **New platform:** Update `lib/platforms.ts`, `lib/content-types.ts`, connect callback branch, `lib/publish-platform.ts`, and validation limits.
2. **New OAuth route with redirect:** Add NEXT_REDIRECT rethrow in every catch block.
3. **New client-imported lib module:** Trace imports — must not pull in `env.ts`.
4. **New publish UI:** Use `publishPostWithParallelProgress`, not per-platform server actions.
5. **Facebook changes:** Preserve page-picker flow unless product explicitly changes multi-page behavior.
6. **Billing/checkout changes:** Preserve eligibility checks, pending-checkout idempotency, webhook payment verification, and trial_claims — do not create checkout without guards.
7. **Edge rate limits:** Never count RSC flight requests toward page limits; use `isFullPageDocumentRequest()`.

If something in this doc conflicts with code, **trust the code** and update this doc — but for Facebook page selection, parallel publish, client/env boundaries, billing guards, and edge rate-limit request classification, the code described here is authoritative as of the latest branch work (`cursor/billing-checkout-guards-trial-claims` and `main` proxy limits).
