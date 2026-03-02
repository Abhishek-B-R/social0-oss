# Social0 Frontend — AI / Claude Guidance

This document describes **architecture rules**, **known mistakes** (what the AI got wrong and how to fix it), and **constraints** (security, performance, cost) for the Social0 frontend. Follow it when editing or adding code so behavior stays consistent and safe.

---

## 1. Architecture rules — how we structure code here

### 1.1 Tech stack

- **Framework:** Next.js 16 (App Router).
- **Runtime:** Node (server) + React 19 (client).
- **Database:** PostgreSQL via Drizzle ORM; schema in `db/schema.ts`, migrations in `db/migrations/`.
- **Auth:** Better Auth (Google OAuth); tables `user`, `session`, `account`, `verification` are owned by Better Auth — do not create app migrations that alter these; reference them for FKs and adapter only.
- **Storage:** Cloudflare R2 (S3-compatible) for media; optional — use `isR2Configured()` / `getR2Client()` from `lib/r2.ts`.
- **Rate limiting:** Upstash Redis via `lib/ratelimit.ts` (optional; used for API, OAuth, and upload routes).
- **Styling:** Tailwind CSS v4; UI primitives from Radix/shadcn in `components/ui/`.
- **Validation:** Zod for env (`lib/env.ts`); shared validation in `lib/validation.ts` and `lib/publish-validation.ts`.

### 1.2 Directory layout

- **`app/`** — App Router: routes, layouts, server components, server actions.
  - **`app/api/`** — API routes only (REST-style or cron). No page components here.
  - **`app/actions/`** — Server actions (`"use server"`): `publish.ts`, `posts.ts`, `resurface.ts`, `settings.ts`.
  - **`app/dashboard/`** — Dashboard layout and all dashboard pages; layout enforces auth and wraps content with sidebar + bottom nav.
- **`components/`** — Reusable React components; `components/ui/` for design system primitives; `components/dashboard/` for dashboard-specific UI; `components/autoplug/`, `components/repost/`, `components/bulk-tools/`, `components/landing/` for feature-specific UI.
- **`lib/`** — Pure or mostly pure logic: auth, encryption, platforms config, publish, validation, R2, token refresh, URL utils. No React components.
- **`db/`** — Drizzle schema (`schema.ts`), migrations, and `db/README.md` (migration commands and important notes).

### 1.3 Conventions

- **Imports:** Prefer `@/` aliases (e.g. `@/db`, `@/lib/env`, `@/components/...`).
- **Server vs client:** Use `"use client"` only where needed (hooks, browser APIs, interactivity). Keep server components and server actions as the default.
- **Auth in API routes:** Use `auth.api.getSession({ headers: await headers() })`; if no session, return 401 (or redirect for page routes). Dashboard layout already redirects unauthenticated users from `/dashboard/*`.
- **Env:** All env is validated at startup via `lib/env.ts` (Zod). Use `env` from `@/lib/env`; do not read `process.env` directly for keys that are in the schema (so missing/invalid env fails fast).
- **Platform IDs:** Use the canonical list and types from `lib/platforms.ts` (`Platform`, `PLATFORMS`, `PLATFORM_OAUTH_CONFIG`). OAuth-only platforms are in `PLATFORM_OAUTH_CONFIG`; Bluesky is BYOK (null in `PLATFORM_OAUTH_CONFIG`) with a separate connect flow (`app/api/connect/bluesky/byok/route.ts`). Twitter/X is null (OAuth 1.0a, handled separately).
- **Content types:** Post types (text, image, video, threads, collection) and their allowed platforms are defined in `lib/content-types.ts`; keep platform IDs in sync with `lib/platforms.ts`.
- **Redirects in route handlers:** Use `safeRedirect(url, fallback)` from `lib/redirect.ts` so we never pass an object or non-URL to `redirect()` (see Known mistakes).
- **Cron:** Cron handlers live under `app/api/cron/*`. They are invoked by Vercel Cron (see `vercel.json`). In development, `DevScheduledPostPoller` in the dashboard layout polls these endpoints; do not rely on polling in production.
- **Cron auth:** All cron routes use `lib/cron-auth.ts` to validate `Authorization: Bearer <CRON_SECRET>` with constant-time comparison; the check can be skipped in development.
- **Next config:** `outputFileTracingRoot` and `turbopack.root` are set to the frontend app root so Tailwind and deps resolve from `frontend/` even with multiple lockfiles. Do not remove or relax this without checking builds and Turbopack.

### 1.4 Database

- **Schema:** Single source of truth is `db/schema.ts`. Enums: `platform`, `post_status`, `publication_status`. Key tables: `user`, `session`, `account`, `verification` (Better Auth); `connected_accounts`, `media_uploads`, `posts`, `post_publications`, `user_settings`, `platform_rate_limits`, `resurface_schedules`, `resurface_events`, `auto_plugs`.
- **Posts:** `posts` has a CHECK constraint: either `trim(final_content) != ''` or `array_length(media_ids, 1) > 0`. App-level validation must enforce the same before insert/update.
- **Migrations:** Generate with `npm run db:generate`; run with `npm run db:migrate`. Better Auth migrations must run before app migrations. See `db/README.md` for media cleanup index and encryption notes.
- **Encryption:** OAuth state and tokens are encrypted only in the backend. Token format: AES-256-GCM, HKDF per-account salt; storage format `version:salt:iv:ciphertext:authTag`. See `lib/encryption.ts` and `db/README.md`.

### 1.5 OAuth and connect flows

- **Generic OAuth 2.0:** Entry is `app/api/connect/[platform]/route.ts` (build state, redirect to provider). Callback is `app/api/connect/[platform]/callback/route.ts` (exchange code, store tokens, redirect to dashboard/connections or error). Handles: LinkedIn, Instagram, YouTube, Pinterest, TikTok, Threads, Facebook.
- **Twitter/X:** OAuth 1.0a only. Request token + secret stored in encrypted cookie; callback uses `oauth_token` + `oauth_verifier` (no `code`).
- **TikTok:** PKCE. Code verifier is stored in DB (`verification` table), not in state (state size limit ~512 chars). State holds `stateId` to look up verifier in callback.
- **Instagram (Meta):** Two paths: (1) Direct Instagram OAuth (`/api/connect/instagram/...`), (2) Instagram via Facebook Page (`/api/connect/instagram-facebook/...` — list Pages, then Pages with linked Instagram). The select step is a POST to `/api/connect/instagram-facebook/select`.
- **Pinterest:** After token exchange, we fetch boards; if none, redirect to "create board" flow; otherwise store selection in `verification` and redirect to board select page.
- **Facebook:** OAuth callback (`/api/connect/facebook/callback`) saves **all** connected Pages in a loop — each page gets its own `connected_accounts` row with a unique `platformUserId` (the page ID).
- **BYOK:** Only Bluesky uses "bring your own key" (`/api/connect/bluesky/byok/route.ts` — handle + app password). No OAuth callback.

### 1.6 Publishing and media

- **Publish pipeline:** `executePublish(postId)` in `app/actions/publish.ts` loads post + publications, marks post/publications as publishing, then calls platform-specific logic in `lib/publish-platform.ts` (with token refresh where applicable), then updates `post_publications` and post status. Always update post status so it is never left stuck in `publishing`.
- **Media:** Upload via `app/api/media/upload/route.ts` (auth required, R2 required). Allowed types and size limits are defined there (e.g. images up to 50MB, videos up to 500MB). Media is validated by magic bytes in `lib/validation.ts`. Stored under `uploads/{userId}/{uuid}.{ext}`.
- **TikTok images:** TikTok has min size/aspect rules. `lib/tiktok-photo-process.ts` downloads from R2, resizes (e.g. shortest side ≥ 640px, longest ≤ 4096px), converts to JPEG, re-uploads to R2 with a `-tiktok-processed` suffix. Use this for TikTok photo posts when required.
- **Thread/Bluesky containers:** Do not create all containers upfront; each step waits for the previous publish (see comment in `lib/publish-platform.ts`).

### 1.7 Token health

- **Proactive refresh:** `app/api/cron/token-health/route.ts` runs daily at 6 AM. It calls `lib/token-health.ts` to identify tokens nearing expiry and refreshes them before they fail at publish time.
- **On-demand refresh:** `lib/token-refresh.ts` exports `getValidToken()` — used in the publish pipeline to refresh expired tokens inline before each platform publish call.

---

## 2. Known mistakes — what the AI got wrong and how to fix it

### 2.1 NEXT_REDIRECT in catch blocks (critical)

**Mistake:** In route handlers that use Next.js `redirect()`, catching exceptions and then handling "all" errors can catch the special error Next.js throws to perform the redirect. That error has a `digest` starting with `NEXT_REDIRECT` (and in some cases `message === "NEXT_REDIRECT"`). If you don't rethrow it, the redirect never happens and the user can see a 500 or wrong response.

**Where it matters:** Any route that calls `redirect()` (or a helper that calls it, e.g. `safeRedirect`) and has a `try/catch` around that code. In this repo the critical files are:

- `app/api/connect/[platform]/callback/route.ts`
- `app/api/connect/instagram-facebook/callback/route.ts`
- `app/api/connect/instagram-facebook/select/route.ts`

**Fix:** In **every** catch block in those files, at the very top of the catch, rethrow the Next.js redirect error before any other handling:

```ts
} catch (err) {
  if ((err as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) {
    throw err;
  }
  if (err instanceof Error && err.message === "NEXT_REDIRECT") {
    throw err;
  }
  // … rest of error handling unchanged (logging, safeRedirect, Response.json, etc.)
}
```

Use the same pattern for any new route that both redirects and has try/catch. If the catch uses a different variable (e.g. `fetchError`, `parseErr`), apply the same checks to that variable and then `throw` it.

**Do not:** Change any other behavior (what you log, what you return, or how you build redirect URLs). Only add this rethrow so redirects are not swallowed.

### 2.2 Redirect URL must be a string (safeRedirect)

**Mistake:** Passing a non-string (e.g. an object from state or `callbackUrl`) into `redirect()` can cause 404s or broken behavior.

**Fix:** Use `safeRedirect(url, fallback)` from `lib/redirect.ts`. It coerces to a string URL and falls back to a safe path:

- Only redirects to a string that is either a path starting with `/` or an absolute `http`/`https` URL; otherwise uses `fallback`.

Keep using `safeRedirect` (or an equivalent) whenever the redirect target can come from query/state/cookie.

### 2.3 OAuth state and TikTok PKCE

**Mistake:** Putting the PKCE code verifier in the OAuth `state` parameter. State is size-limited (~512 chars) and may not reliably hold a long verifier.

**Fix:** Store the code verifier in the `verification` table and put only a short `stateId` (and `userId`, `platform`) in the encrypted state. In the callback, decrypt state, look up the verifier by `stateId`, then delete the verification row (one-time use). See `app/api/connect/[platform]/route.ts` (TikTok branch) and callback handling for TikTok.

### 2.4 Double publish / stuck "publishing"

**Mistake:** Not marking the post (and publications) as "publishing" at the start of `executePublish`, or not updating status on failure, can lead to double publish or post stuck in "publishing".

**Fix:** At the start of publish, set post and pending publications to a "publishing" state so the UI and any other process can avoid double work. In a `finally` (or equivalent), always set the post status to a terminal state (e.g. `published` or `failed`) so it is never left permanently in `publishing`. See `app/actions/publish.ts`.

### 2.5 Account and media ownership

**Mistake:** Allowing post create/update or publish to use accounts or media that do not belong to the current user.

**Fix:** Before creating/updating posts or running publish, ensure every `connectedAccountId` and every `mediaId` is owned by the current user (match `userId` from session to `connected_accounts.userId` and `media_uploads.userId`). Return a clear error (e.g. "One or more selected accounts are invalid or do not belong to you") when validation fails. See `app/actions/posts.ts` and publish flow.

### 2.6 Migration file corruption

**Mistake:** Modifying existing migration files (`.sql`) or `db/migrations/meta/_journal.json` causes migration history to diverge, duplicate or conflicting migrations, and failed applies.

**Fix:** Never let Cursor (or any tool) modify existing migration files or `_journal.json`. Always generate new migrations with `npm run db:generate`. If a migration fails mid-apply, use `npm run db:push` to sync the schema directly to the DB (skips migration history). Never manually edit `_journal.json` unless adding a new entry at the end.

### 2.7 Platform enum removal

**Mistake:** Removing a platform from `platformEnum` in `db/schema.ts` and then altering the enum in a migration without cleaning data first. PostgreSQL will fail because existing rows still reference the removed enum value.

**Fix:** When removing a platform from `platformEnum`, always delete existing rows first in the migration, e.g. `DELETE FROM connected_accounts WHERE platform = 'medium';`. Then drop/recreate the enum (or alter as needed). Never just alter the enum without cleaning data first.

### 2.8 Facebook saves all pages, not one

**Mistake:** Assuming Facebook OAuth connects a single page or that there is a "select one page" step. Re-adding a page-selection UI or changing the callback to save only one page breaks the intended behavior.

**Fix:** The Facebook OAuth callback saves **all** connected pages in a loop. Each page gets its own row in `connected_accounts` with a unique `platformUserId` (the page ID). There is no page-selection UI — do not add one.

---

## 3. Constraints — security, performance, and cost

### 3.1 Security

- **Env:** Never commit `.env` or `.env.local`. All runtime env is validated through `lib/env.ts` (Zod). `ENCRYPTION_KEY` must be 32 bytes (64 hex chars). `BETTER_AUTH_SECRET` must be at least 32 characters.
- **Auth:** All dashboard and API routes that touch user data must check session (e.g. `auth.api.getSession({ headers: await headers() })`). Cron routes must be protected by `lib/cron-auth.ts` (constant-time Bearer token check); in development the cron auth check can be skipped for convenience.
- **OAuth state:** State must be encrypted and include `userId` and `platform` (and optionally `stateId` for PKCE). Callback must verify state, decrypt it, and ensure `platform` matches and the user is authorized.
- **Tokens:** Access/refresh tokens are stored only in the DB, encrypted (see `lib/encryption.ts`). Never log or send tokens to the client. Use `getValidToken()` (or equivalent) so expired tokens are refreshed when the platform supports it (e.g. YouTube, LinkedIn).
- **Media URLs (SSRF):** When publishing, only allow media URLs that are on an allowlist: app origin and (if set) R2 public URL. Use `isAllowedMediaUrl` and `getAllowedMediaOrigins` from `lib/publish-validation.ts`. Do not fetch or redirect to user-controlled URLs outside this allowlist.
- **Uploads:** Validate file type by MIME and by magic bytes (`lib/validation.ts`). Sanitize filenames (no path traversal, no control characters). Enforce max size (e.g. 50MB images, 500MB videos) and reject oversized or disallowed types.
- **Cron:** Do not expose cron endpoints without auth. Use `lib/cron-auth.ts` which validates `Authorization: Bearer <CRON_SECRET>` with constant-time compare in production.

### 3.2 Performance

- **Next.js:** Use the existing `optimizePackageImports` for large libraries (e.g. `react-icons`) as in `next.config.ts`. Keep `outputFileTracingRoot` and `turbopack.root` aligned so builds and dev are consistent.
- **DB:** Use indexed columns for frequent filters (e.g. `posts.status`, `posts.scheduledAt`, `post_publications.postId`). The `db/README.md` suggests an index for media cleanup; add it if you run cleanup jobs.
- **Publish:** Publish is synchronous per post; for many accounts we run them in sequence. Do not create all Bluesky/Threads containers upfront; wait for each step before creating the next (see `lib/publish-platform.ts`).
- **Media:** Large files are streamed/stored in R2. TikTok image processing (resize, re-upload) runs on the server; keep image dimensions and quality within the documented limits to avoid timeouts.

### 3.3 Cost and limits

- **R2:** Optional. If not configured, media upload and any flow that depends on R2 (e.g. TikTok processed images) should fail gracefully with a clear message (e.g. 503 "Media storage (R2) is not configured").
- **Platform limits:** Respect platform-specific content length and media limits (e.g. Twitter 280, TikTok/Instagram caption 2200, Bluesky 3000). These are in `lib/publish-validation.ts` (`CONTENT_LIMITS`, `MAX_MEDIA_IDS`, etc.). Validate before publish and ideally in the UI.
- **Rate limits:** `lib/ratelimit.ts` uses Upstash Redis for optional rate limiting on API, OAuth, and upload routes. Prefer not to burst large numbers of requests to a single platform.
- **Cron:** Vercel Cron has limits on frequency and duration. Our crons — `publish-scheduled`, `repost`, `autoplug` (daily at midnight), `token-health` (daily at 6 AM) — must stay idempotent and within the configured `maxDuration` (e.g. 60s for publish-scheduled).

### 3.4 Token management rules

- **YouTube:** Tokens expire in 1 hour. Always store `encryptedRefreshToken` and call `getValidToken()` before publishing. Require `access_type=offline&prompt=consent` in the YouTube OAuth URL or Google will not return a refresh token on repeat auths.
- **TikTok:** Refresh tokens rotate. Save the **new** refresh token on every refresh call (the API returns a new one).
- **Instagram/Threads (Meta):** Tokens expire in 60 days. Refresh proactively when &lt; 14 days remain using `graph.instagram.com/refresh_access_token` (no client secret needed).
- **LinkedIn:** Tokens expire in 60 days. Refresh when &lt; 7 days remain.

### 3.5 Soft delete only

Never hard-delete `connected_accounts` rows. On disconnect, set `isActive = false`. Post history (`post_publications`) is preserved. Queries must filter `WHERE isActive = true`. If the user reconnects the same `platformUserId`, history comes back automatically.

---

## 4. Quick reference

| Area              | Location / rule |
|-------------------|------------------|
| Env               | `lib/env.ts` only; use `env` from there. |
| Platform list     | `lib/platforms.ts` (`Platform`, `PLATFORMS`, `PLATFORM_OAUTH_CONFIG`). |
| Content types     | `lib/content-types.ts`; keep platforms in sync with `lib/platforms.ts`. |
| Auth in API       | `auth.api.getSession({ headers: await headers() })`; 401 if no session. |
| Redirect in catch | Rethrow if `digest?.startsWith("NEXT_REDIRECT")` or `message === "NEXT_REDIRECT"`. |
| Safe redirect     | Use `safeRedirect(url, fallback)` from `lib/redirect.ts`; never pass object to `redirect()`. |
| PKCE (TikTok)     | Verifier in DB; state holds only `stateId` + `userId` + `platform`. |
| Publish status    | Set "publishing" at start; always set terminal status in `finally`. |
| Media SSRF        | Only allow app origin + R2 public URL via `isAllowedMediaUrl` / `getAllowedMediaOrigins`. |
| Token storage     | Encrypted in DB only; never log or send to client. |
| Cron auth         | `lib/cron-auth.ts` — Bearer token + constant-time compare; skip only in development. |
| Token refresh     | `getValidToken()` in `lib/token-refresh.ts`; YouTube/TikTok auto-refresh before publish. |
| Token health cron | `app/api/cron/token-health` runs daily at 6 AM via `lib/token-health.ts`. |
| Rate limiting     | `lib/ratelimit.ts` (Upstash Redis); optional. |
| Disconnect        | Set `isActive=false` only; never DELETE `connected_accounts` rows. |
| Facebook pages    | Save ALL pages in loop in callback; no select UI. |
| Instagram-Facebook select | POST to `/api/connect/instagram-facebook/select`. |
| BYOK              | Only Bluesky: `app/api/connect/bluesky/byok/route.ts`. |
| Migration safety  | Never edit existing `.sql` files; always `db:generate` for new migrations. |

If you add new routes that call `redirect()` inside try/catch, add the NEXT_REDIRECT rethrow in every catch block. If you add new platforms or content types, update `lib/platforms.ts` and/or `lib/content-types.ts` and keep validation and publish logic in sync.
