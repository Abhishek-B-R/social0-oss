# Social0 — monorepo guide for AI agents

**Read this first.** Package-specific notes: [`frontend/claude.md`](frontend/claude.md), [`backend/claude.md`](backend/claude.md). Product surface: [`FEATURES.md`](FEATURES.md). Human setup: [`README.md`](README.md), [`CONTRIBUTING.md`](CONTRIBUTING.md).

Production stack in one line:

> `frontend/` (Cloudflare Pages SPA) → `backend/server` (Fastify + Better Auth + RPC) → `cloudflare/publish-worker` (Hyperdrive + R2 + Queues) + `backend/background-worker` (Upstash BullMQ cron) + `cloudflare/cron-worker`; public `social0-cli` / `social0-mcp` use `/v1` API keys.

**Package name vs folder:** the SPA lives in **`frontend/`** (npm name `react-frontend`). There is **no** `react-frontend/` directory. Older docs that call `frontend/` “legacy Next.js” are wrong — ignore that.

---

## 0. Hard rules for agents

1. **Separate packages** — Pages builds `frontend/` alone. Do **not** import `@social0/shared` (or anything under `backend/`) into the SPA.
2. **No DB migrations / schema edits** unless the user **explicitly** asks. Schema source of truth: `backend/server/src/db/schema.ts`. Keep `background-worker` schema copy in sync when schema *is* changed.
3. **Never await platform *publish* APIs inside HTTP handlers** — enqueue / CF dispatch; return fast (`202` / `200`). Analytics/inbox RPC reads *do* hit platform APIs in-request (timeouts + `RPC_LIVE_READ_HANDLERS` budget).
4. **No Next.js patterns** in the SPA (`"use server"`, App Router, `middleware.ts`). Vite + React Router only.
5. Prefer **deletion / smallest change**. New networks → `backend/server/src/lib/publish-platforms/` (+ `index.ts`). New RPC → `services/` + `routes/api/rpc.ts` + `frontend/src/api/` wrapper.
6. Do not invent env values; copy names from `backend/.env.example` / `frontend/.env.example` / worker READMEs.
7. **`LIVE_PLATFORMS` is backend-only** — `backend/server/src/lib/live-platforms.ts`. SPA account chips come from `analytics.listAccounts` / `inbox.listAccounts`. Do **not** duplicate this map in `frontend/`.

---

## 1. Repo map

Layout is whatever `ls` shows; ownership is not:

| Layer | Owns |
| ----- | ---- |
| **frontend** | Marketing, auth, onboarding, dashboard UI (composer, analytics, inbox); `rpc()` + REST |
| **server** | Auth, validation, RPC BFF, enqueue, billing, OAuth connect, live analytics/inbox, `/v1` |
| **publish-worker** | Long platform uploads (TikTok/YouTube/Meta/…); Postgres + R2 |
| **background-worker** | Cron: scheduled publish dispatch, repost, autoplug, token health, billing zombie |
| **cron-worker** | Triggers those cron HTTP endpoints on a schedule |
| **shared** | Queue names, job payloads, CF enqueue client, job progress helpers |
| **cli / mcp** | External developer surface on `/v1` with API keys |

---

## 2. Deploy & runtime

| Target | Location | Role |
| ------ | -------- | ---- |
| Cloudflare Pages | `frontend/` | `social0.app` SPA |
| API droplet | `backend/server` (PM2; `.github/workflows/deploy-backend.yml`) | `api.social0.app` |
| Background worker | `backend/background-worker` (same VM) | BullMQ cron jobs |
| CF publish worker | `cloudflare/publish-worker` | Platform publish |
| CF cron worker | `cloudflare/cron-worker` | Schedules → API |
| CF MCP worker | `cloudflare/mcp-worker` | Hosted MCP |

**How they talk**

- Browser → API: session cookies; `POST /api/rpc`, REST `/api/*`. Dev: Vite proxies `/api` + `/v1` to `VITE_API_PROXY_TARGET` (default `:3001`). Leave `VITE_API_URL` empty in local proxy mode.
- Publish (default `PUBLISH_DISPATCH=cloudflare`): API writes `publish_jobs` / `post_publications` → HMAC enqueue to CF → Queues `social0-publish-now` / `social0-publish-scheduled` (DLQ `social0-publish-dlq`) → worker (Hyperdrive + R2) → platform APIs → finalize + job events. Publish-now progress: SSE `GET /api/jobs/:id/stream`.
- **X and TikTok stay on the API by default** (`SERVER_SIDE_PUBLISH_PLATFORMS` in `backend/shared/src/constants/server-side-publish.ts`) — chunked X video + TikTok 64-bit permalinks. Opt into CF with `TWITTER_PUBLISH_ON_CF=1` / `TIKTOK_PUBLISH_ON_CF=1` after the worker is current.
  This holds on **both** entry points. Publish-now branches in `services/publish-enqueue.ts` (`runPlatformJobOnServer`); the scheduled cron branches in `background-worker/src/cron/dispatch-scheduled-target.ts` and hands those jobs to `POST /api/cron/publish-platform` (needs `CRON_SECRET` + `INTERNAL_API_BASE_URL`/`AUTH_API_URL` in `backend/.env`). Add a platform to one branch and you must add it to the other, or the same post publishes two different ways depending on which button created it.
- Fallback: `PUBLISH_DISPATCH=bullmq` runs platform work on the droplet via shared queues.
- Cron: CF cron-worker → `POST /api/cron/{job}` + `CRON_SECRET` → enqueue → background-worker.
- Redis (Upstash): BullMQ, rate limits, auth secondary storage, job progress. Optional local Redis via `backend/docker-compose.yml`.
- R2: media. Hyperdrive: publish-worker DB. CLI/MCP: `Authorization: Bearer` API key → `/v1`.

---

## 3. Auth, onboarding, guest mode

| Piece | Path |
| ----- | ---- |
| Better Auth config | `backend/server/src/lib/auth.ts` |
| Auth HTTP | `GET/POST /api/auth/*` |
| SPA client | `frontend/src/lib/auth-client.ts` |
| Session / API key middleware | `backend/server/src/middleware/auth.ts`, `lib/session.ts` |
| Post-auth gate | `/auth/continue` → `frontend/src/features/auth/pages/AuthContinuePage.tsx` |
| Gate helpers | `frontend/src/lib/sign-in-url.ts` (`AUTH_CONTINUE_PATH`, `resolvePostAuthDestination`, `signInUrl`) |
| Onboarding status RPC | `onboarding.getOnboardingStatus` → `backend/server/src/services/onboarding.ts` |

**Post-auth flow (do not regress):**

1. Sign-in / sign-up / verify-email / signed-in hit on `/` → **`/auth/continue`** (loading).
2. Load session + onboarding status.
3. If `shouldOnboard` → `/onboarding` (invites `/invite/*` preserved).
4. Else → `/dashboard` or preserved deep link (`returnTo`).
5. `OnboardingLayout` also holds a loader until status says the user still needs onboarding (no flash-then-bounce).
6. `DashboardLayout` still redirects `shouldOnboard` users to onboarding as a safety net.

**Guest dashboard:** `/dashboard/*` browsable without session (`useIsGuest`, `GuestBanner`, `GuestTestModeDialog`). Cannot publish.

**Legal consent:** signed-in users must accept current terms/privacy (`legal_acceptances`). SPA `LegalConsentGate` in `DashboardLayout` → `GET/POST /api/legal/status` + `/api/legal/accept`. Cron can notify on legal updates (`POST /api/cron/notify-legal-update`).

Auth methods: email+password, email OTP verify (Resend), Google OAuth, forgot/reset password (`/auth/forgot-password`, `/auth/reset-password`). Prod cookies cross-subdomain on `social0.app`. Dev-only `x-user-id` when `ALLOW_DEV_USER_HEADER` + localhost.

---

## 4. Publish pipeline (detail)

```
UI / RPC publish.* / POST /api/publish
  → services/publish-dispatch.ts + publish-enqueue.ts
  → DB (publish_jobs, post_publications, events)
  → fan-out one job per platform
       ├─ CF publish-worker (prod default)
       └─ or BullMQ → publish/execute-publish.ts
  → platform APIs
  → publish/finalize-post.ts (maybeFinalizePostPublish)
       ├─ aggregate post status
       ├─ maybeSendPostFailureEmail (Resend; await — never void on CF)
       └─ user webhooks (`deliverUserWebhookEvent`; await — never void on CF)
```

| File | Role |
| ---- | ---- |
| `backend/server/src/services/publish-dispatch.ts` | CF vs BullMQ |
| `backend/server/src/services/publish-enqueue.ts` | Fan-out + job rows |
| `backend/server/src/publish/execute-publish.ts` | Core publish / bullmq path |
| `backend/server/src/publish/finalize-post.ts` | Aggregate status, email, webhooks |
| `backend/server/src/lib/post-failure-email.ts` | Failure email + claim dedupe |
| `backend/server/src/lib/publish-platforms/*` | Per-platform publishers (prefer here) |
| `backend/shared/src/lib/cf-publish-client.ts` | HMAC enqueue to CF |
| `cloudflare/publish-worker/src/process-platform.ts` | Edge job runner (imports server publish modules) |

**Platforms (9):** LinkedIn, Instagram, YouTube, Pinterest, TikTok, X (`twitter_x`), Threads, Bluesky, Facebook Pages. LinkedIn + X still partly inline in `execute-publish.ts` — new networks go in `publish-platforms/`. X + TikTok default to the API process, not the CF worker (see §2).

**Content types:** text, image, video, threads, collection — composer + `/dashboard/create/:type`.

**Failure emails:** only from awaited `maybeFinalizePostPublish`. Settings: `automationEmails` + `emailOnPostFailed` (default on). Publish-worker needs `RESEND_API_KEY`.

**User webhooks (`post.published` / `post.failed`):** also only from awaited `maybeFinalizePostPublish`. `backend/server/src/lib/user-webhook-delivery.ts` owns delivery — 3 attempts (retry on 5xx/408/425/429/network, never on other 4xx), SSRF-checked on every redirect hop, and every outcome written to `webhook_deliveries` plus `user_webhook_subscriptions.last_delivery_*`. Emission is claimed once per post via `posts.metadata._publishWebhookSentAt` because platform jobs finalize concurrently. Debug surfaces: `GET /v1/webhooks/:id`, `GET /v1/webhooks/:id/deliveries`, `POST /v1/webhooks/:id/test` (and the `/api/webhooks/subscriptions/*` twins the dashboard uses).

---

## 5. Frontend (`frontend/`)

Stack, `src/` layout, route table, theming tokens and data-access rules: **[`frontend/claude.md`](frontend/claude.md)** — it loads automatically when you work under `frontend/`. Routes are defined in `frontend/src/routes/router.tsx`.

---

## 6. Backend (`backend/`)

Layout, RPC BFF surface, REST groups, cron workers and `@social0/shared` contents: **[`backend/claude.md`](backend/claude.md)** — it loads automatically when you work under `backend/`. Schema source of truth stays `backend/server/src/db/schema.ts`.

---

## 7. Cloudflare workers

### publish-worker

- Bootstraps env (`src/runtime/bootstrap.ts`) then dynamic-imports server publish modules.
- Secrets: `PUBLISH_HMAC_SECRET`, `ENCRYPTION_KEY`, `RESEND_*`, R2, platform OAuth; Hyperdrive binding.
- Must **await** finalize (failure email) — never fire-and-forget Resend on Workers.

### cron-worker

- Cron triggers → `API_BASE_URL` + `CRON_SECRET` → Fastify cron routes.

### mcp-worker

- Hosted MCP at `mcp.social0.app` with OAuth; SPA helper `/oauth/mcp/connect`.

---

## 8. Teams, workspaces, billing, media, analytics, inbox

| Area | Backend | Frontend |
| ---- | ------- | -------- |
| Teams / workspaces | `lib/workspace/*`, `routes/api/team.ts`, schema `teams` / `teamMembers` / `workspaces` | `features/dashboard/teams`, `workspaces`, `api/team.ts`, `TeamAppLayout` |
| Team roles | `lib/workspace/permissions.ts` — admin, member, community, analyst | Analyst: analytics only. Community: inbox + reply, cannot publish. Member/Admin: both |
| Billing | `handlers/billing/*`, `/api/billing/*`, Dodo webhook | `features/dashboard/billing`, plans in `lib/plans.ts` |
| Media | R2 presign/confirm `/api/media/*` | upload helpers in create/composer |
| API keys / webhooks | `/api/api-keys`, `/v1/webhooks` | `/dashboard/api-keys` |
| Feedback | Canny SSO | `/dashboard/feedback` |
| Analytics | `services/analytics.ts`, `lib/analytics/*`, `lib/live-platforms.ts` | `features/dashboard/analytics`, `api/analytics.ts` |
| Inbox | `services/inbox.ts`, `lib/inbox/*` (live fetch; no inbox tables) | `features/dashboard/inbox`, `api/inbox.ts` |

Billing provider: **Dodo Payments** (not Stripe). Env: `DODO_PAYMENTS_*`.

**Analytics / inbox (do not regress):**

- Not plan-gated. Flask in sidebar = early access.
- Metrics and threads are for **posts published through Social0**, fetched live from platform APIs (gated by `LIVE_PLATFORMS`).
- Flip a platform in `live-platforms.ts` when App Review lands. `false` = hide chip, skip fetch, skip reconnect nag.
- Inbox DMs today: Instagram, X, Bluesky, TikTok (TikTok needs Business Messaging; Login Kit tokens fail until a BM app is connected).
- Post-detail analytics stay **collapsed** until the user clicks Show analytics (`analytics.getPostAnalytics`).
- Team-scoped under `/dashboard/teams/:teamId/analytics` and `/inbox`.
- Service functions come in pairs: `getAnalyticsOverview(input)` resolves the
  session, `analyticsOverviewForScope(ctx, input)` holds the logic. RPC uses the
  first, `/v1` the second. Same for every `inbox.*` handler.
- Coverage flags are independent: `sampled` = publication page was capped,
  `partial` = live budget ran out (`lib/analytics/coverage.ts`). Never fold
  one into the other.
- A dead platform token (401 / X code 89) is a **reconnect**, not a transient
  error: `lib/platform-auth-errors.ts` maps it to `status: "scope_missing"`
  with `missingScopes: ["token_expired"]` so it rides the existing reconnect
  path on every surface.
- TikTok: a `ttpub:` publish id that no longer resolves is backfilled from
  `video.list` by publish time (`pickTikTokVideoByPublishTime`) and persisted
  onto `post_publications` by `metricsForPub` - the same core `/v1` uses.
- Comment pages are per publication, so `threads: []` with `hasMore: true` is
  normal (X pages once). CLI/MCP follow the cursor once, then say so.

---

## 9. Public CLI & MCP

| Package | Use |
| ------- | --- |
| `social0-cli/` | npm CLI `social0` → `/v1` with `SOCIAL0_API_KEY` |
| `social0-mcp/` | `@social0/mcp` stdio tools → same `/v1` (also bundled by `cloudflare/mcp-worker`) |

`/v1` routes are **implemented** (`me`, `accounts`, `posts`, `media`, `jobs`, `webhooks`, `analytics`, `inbox`) — not stubs. Auth: Bearer API key (`sk_live_…` / legacy `s0_live_`).

### Analytics + inbox on `/v1`

| Route | Notes |
| ----- | ----- |
| `GET /v1/analytics/{accounts,overview,posts/:postId}` | Live metrics; `range`/`since`/`until`/`account_id`/`fresh` |
| `GET /v1/inbox/{accounts,comments,dms}` | Live reads; `before`/`limit` paging via `next_before` |
| `GET /v1/inbox/dms/:conversationId` | One DM thread (`account_id` required) |
| `POST /v1/inbox/comments/:commentId/{reply,like,hide}` | Body carries `publication_id` |
| `POST /v1/inbox/dms/:conversationId/reply` | Body carries `account_id` |

- Services: `services/v1-analytics.ts`, `services/v1-inbox.ts` — thin snake_case
  DTO mappers over the **same cores** the dashboard RPC uses
  (`*ForScope(ctx, input)` in `services/analytics.ts` / `services/inbox.ts`).
  Add behavior to the core, never to one caller.
- Scope: API keys read the **personal (main) pool** (`workspaceId: null`), same
  rule as `/v1/accounts`. Workspace-scoped accounts stay dashboard-only.
- Same `LIVE_PLATFORMS` gate, cache, and outbound platform limits as the SPA.
  Live reads and inbox mutations also sit behind the per-minute
  `rpcLiveReadLimiter` / `rpcMutationLimiter` budgets (route-level
  `middleware/v1-live-limits.ts`, keys namespaced `v1:`), on top of the
  hourly tier limit from `requireV1ApiKey`.
- Keep `backend/server/openapi/openapi.json` in step — `src/tests/v1-analytics-inbox-contract.test.ts` fails if a route or scope drifts.
- CLI: `social0 analytics …`, `social0 inbox …`.
  MCP: `get_analytics`, `get_post_analytics`, `list_inbox_comments`,
  `reply_to_comment`, `moderate_comment`, `list_inbox_dms`,
  `get_inbox_dm_thread`, `reply_to_dm`.

---

## 10. Database

- Migrations: `backend/migrations/`
- Schema: `backend/server/src/db/schema.ts` (+ worker copy)
- Hosting: Neon Postgres
- **AI: never migrate / alter schema without an explicit user command.**

Notable domains: users/sessions (Better Auth), `user_settings` (onboarding flags, email prefs, plan tier), `legal_acceptances`, `connected_accounts`, `posts` / `post_publications` / media, `publish_jobs` / events, teams/workspaces, queue slots, resurface/autoplug, API keys, webhooks. Analytics and inbox are live platform fetches — no dedicated tables (analytics may persist a resolved TikTok public video id onto `post_publications`).

---

## 11. Env patterns (names only)

| Surface | Examples |
| ------- | -------- |
| API | `DATABASE_URL`, Upstash Redis, `BETTER_AUTH_*`, `AUTH_API_URL`, `APP_URL` / `NEXT_PUBLIC_APP_URL`, `ENCRYPTION_KEY`, `PUBLISH_DISPATCH`, `CF_PUBLISH_*`, `TWITTER_PUBLISH_ON_CF`, `TIKTOK_PUBLISH_ON_CF`, `CRON_SECRET`, `ADMIN_API_KEY`, `RESEND_*`, Turnstile, `R2_*`, platform `*_CLIENT_*`, `DODO_PAYMENTS_*`, `MCP_*` |
| SPA | `VITE_API_URL`, `VITE_API_PROXY_TARGET`, `VITE_APP_URL`, Turnstile, PostHog, Vemetric (`VITE_VEMETRIC_TOKEN`), optional Dodo product IDs |
| Publish worker | HMAC, encryption, Resend, R2, OAuth, Hyperdrive |
| Cron worker | `CRON_SECRET`, `API_BASE_URL` |
| CLI/MCP | `SOCIAL0_API_KEY`, `SOCIAL0_API_URL` |

SPA never ships server secrets. `ENCRYPTION_KEY` / publish HMAC must match API ↔ publish-worker.

---

## 12. Dev commands

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
npm run install:all
```

Everything else (`dev`, `build`, `typecheck`, `db:*`) is in root `package.json` scripts.

Backend workspace: `cd backend && bun install` (or npm), then `bun run build` — build order matters: **shared → background-worker → server**. Do not `npm run build` inside `server/` without installing at `backend/` first.

Publish worker: see `cloudflare/publish-worker/README.md`.

---

## 13. Conventions cheat-sheet

**Backend**

- TS imports use `.js` extensions where the server tsconfig requires them.
- Prefer `publishLog` over raw `console.log` on publish paths.
- Publish-now: create `trackingId` + init job progress **before** enqueue.

**Frontend**

- New page: `features/…` UI + thin `pages/…` + `router.tsx`.
- Dashboard accents = design tokens; landing = `.landing` scope only.
- Auth deep links: `signInUrl(path)` always goes through `/auth/continue?returnTo=…`.
- Analytics/inbox chips: call `listAccounts` RPC; never hardcode `LIVE_PLATFORMS` in the SPA.

**Cross-cutting**

- Keep `main` deployable; backend changes on `main` auto-deploy via workflow when `backend/**` changes.
- When fixing CF worker email/send paths: **await** work before the isolate returns.
- Same rule for user webhooks: publish paths call `deliverUserWebhookEvent` (awaited). `emitUserWebhookEvent` is fire-and-forget and is only safe inside Fastify handlers on the API droplet — on Workers the isolate is torn down and the request never leaves.

---

## 14. Known caveats

- LinkedIn + X publish logic not fully extracted into `publish-platforms/`.
- X + TikTok publish on the API by default (not CF), from both the composer and the cron. See `server-side-publish.ts` and `background-worker/src/cron/dispatch-scheduled-target.ts`.
- `background-worker` schema is duplicated — update both when schema changes (only with explicit permission).
- Older docs may still say `react-frontend/` — treat **`frontend/`** as the live SPA.
- Failure-email claim (`posts.metadata._failureEmailSentAt`) is one-shot; stuck claims from old bugs won’t re-send until cleared.
- `LIVE_PLATFORMS` false ≠ “platform unsupported forever”; it means skip live fetch until App Review. Do not copy it into the SPA.

---

## 15. Where to look next

| Task | Start here |
| ---- | ---------- |
| UI / dashboard | `frontend/claude.md`, `frontend/src/routes/router.tsx` |
| API / RPC / publish | `backend/claude.md`, `backend/server/src/routes/api/rpc.ts` |
| Analytics / inbox | `backend/server/src/lib/live-platforms.ts`, `services/analytics.ts`, `services/inbox.ts`, `frontend/src/features/dashboard/{analytics,inbox}` |
| Edge publish | `cloudflare/publish-worker/README.md` |
| Product behavior / plans | `FEATURES.md`, `frontend/src/lib/plans.ts` |
| CLI | `social0-cli/README.md` |
| MCP | `social0-mcp/README.md`, `cloudflare/mcp-worker/` |
