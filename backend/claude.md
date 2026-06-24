# Social0 Backend v2 — AI Guidance

This document is the **single source of truth for AI assistants** working in `backend/`. It describes the queue-based architecture, package layout, what is implemented vs stubbed, publish UX (SSE + scheduling), and how to extend without breaking the server → worker split.

**Audience:** Any AI or human contributor editing `backend/`.

**Related:** The production app still runs on **`frontend/`** (Next.js). This backend is a **parallel side-build** for cheaper infra (DigitalOcean + Redis + BullMQ). Do not assume it is deployed or wired to the frontend yet.

**Branch:** `cursor/backend-v2-server-engine-worker`

---

## 0. Project overview

### What this backend is

A **standalone Fastify API + BullMQ workers** that mirrors the Next.js `frontend/app/api/**` surface.

| Layer | Responsibility |
|-------|----------------|
| **server** | HTTP — validate, auth, enqueue, return fast (`202` or `200`) |
| **worker** | BullMQ consumers + publish/email/token logic (port from `frontend/lib/`) |
| **shared** | Types, queues, DTOs, job progress store, route manifest |

Publishing to TikTok/YouTube/Meta takes 1–2.5 minutes. That work **never** runs inside the HTTP request.

### Implementation status (honest)

| Area | Status |
|------|--------|
| Architecture (thin server + queues + fan-out) | ✅ Done |
| All API route stubs registered | ✅ Done |
| Publish now + SSE progress | ✅ Done |
| Schedule later + BullMQ delay | ✅ Done |
| Parallel per-platform jobs | ✅ Done |
| **Better Auth** (Google + email OTP) | ✅ Ported from frontend |
| **Platform OAuth** (9 platforms) | ✅ Ported from frontend |
| DB + Drizzle (shared Neon) | ✅ Wired in server |
| Token encryption (HKDF per account) | ✅ Ported |
| Platform publish adapters | ❌ Stubs only |
| Billing, presign, webhooks | ❌ Stubs only |
| Per-platform queues (TikTok vs LinkedIn) | ❌ Future optimization |

**Scaffold complete ≠ backend complete.** Auth/connect are real; publish/billing still need wiring.

### Target production stack

| Layer | Choice |
|-------|--------|
| API | Fastify (`server/`) |
| Queue | Redis + BullMQ |
| Workers | Node on DigitalOcean droplet (`worker/` process) |
| Database | Neon Postgres (same as frontend) |
| Media | Cloudflare R2 (presigned uploads — port from `frontend/lib/r2.ts`) |
| Frontend (future) | React + Vite on Cloudflare Pages |
| Package manager | **Bun** (`bun install`, `bun run build`) |

### Monorepo layout

```
backend/
├── package.json          # Bun workspaces root
├── bun.lock
├── docker-compose.yml    # Redis for local dev
├── .env.example
├── claude.md             # this file
├── README.md
├── shared/               # @social0/shared
├── server/               # @social0/server — Fastify API + auth + connect
│   ├── src/db/           # Drizzle schema (copy of frontend/db/schema.ts)
│   ├── src/lib/          # Auth, encryption, platforms, token-refresh, shims
│   └── src/connect/      # Platform OAuth handlers (ported from frontend)
└── worker/               # @social0/worker — BullMQ process + platform adapters
    ├── src/main.ts       # BullMQ entrypoint (`bun run dev:worker`)
    ├── src/workers/      # Queue consumers (publish, email, cron, …)
    └── src/publish/      # Platform publish stubs
```

---

## 1. Architecture

### 1.1 Request flow

```
Client
  ↓
server (Fastify)          — auth, validation, enqueue
  ↓
Redis / BullMQ
  ↓
worker (BullMQ + adapters) — fan-out, SSE progress, cron, publishToPlatform()
  ↓ on definitive platform failure
email queue → sendPostFailedEmail
```

### 1.2 Publish UX — two paths (important)

These are **different user expectations**. Do not use SSE for scheduled posts.

#### Path A: Publish now (live progress)

User clicks Publish → wants to see what happened per platform.

```
POST /api/publish  { postId, connectedAccountIds? }
  → 202 {
      trackingId,
      jobId,
      status: "queued",
      queue: "publish",
      streamUrl: "/api/jobs/:trackingId/stream"
    }

GET /api/jobs/:trackingId/stream   (SSE)
  → event: progress  (many)
  → event: done

GET /api/jobs/:trackingId          (snapshot — reconnect / fallback)
```

**SSE event phases** (`shared/src/types/job-progress.ts`):

`queued` → `fan_out` → `platform_queued` → `platform_uploading` → `platform_success` | `platform_failed` → `completed` | `failed`

Each event includes `progress: { completed, failed, total }` when applicable.

**Redis keys:**

- State snapshot: `job:state:{trackingId}` (24h TTL)
- Live pub/sub: `job:events:{trackingId}`

Implemented in `shared/src/lib/job-progress.ts` (`JobProgressStore`). Server attaches `app.jobProgress`; worker uses `worker/src/lib/job-progress.ts`.

#### Path B: Schedule later (fire and forget)

User picks a future time → just wants confirmation.

```
POST /api/publish  {
  postId,
  connectedAccountIds?,
  scheduledAt: "2026-06-15T10:00:00.000Z",
  mode: "schedule"                    // optional if scheduledAt is in the future
}
  → 200 {
      status: "scheduled",
      postId,
      scheduledAt,
      jobId,
      message: "Post scheduled successfully"
    }
```

- **No** `trackingId`, **no** SSE, **no** WebSockets.
- BullMQ `delay` wakes `publish.post` at `scheduledAt`.
- **Do not** use per-post cron or DB scan loops for this.

Mode detection (`server/src/routes/api/publish.ts`):

- `mode: "schedule"` → always schedule (requires `scheduledAt`)
- `mode: "now"` → always publish now
- omitted → schedule if `scheduledAt` is in the future, else publish now

### 1.3 Fan-out + parallel execution

**Not sequential.** Total publish time ≈ `max(platform_times)`, not `sum`.

```
publish.post (orchestrator)
    ↓
loadPublicationTargets()     ← stub; wire DB
    ↓
N × platform-publish jobs    ← all enqueued at once (Promise.all on queue.add)
    ↓
BullMQ runs up to WORKER_PLATFORM_CONCURRENCY (default 20) in parallel
    ↓
each job → publishToPlatform() for ONE platform only
```

If TikTok fails, YouTube/LinkedIn jobs still succeed independently.

**Future optimization:** split `platform-publish` into per-platform queues (`tiktok`, `youtube`, `linkedin`, …) with different concurrency limits. Not implemented yet — single shared queue works for now.

### 1.4 Queues

Defined in `shared/src/queues.ts`:

| Queue | Constant | Purpose |
|-------|----------|---------|
| `publish` | `QUEUES.PUBLISH` | Orchestrator: `publish.post` fans out |
| `platform-publish` | `QUEUES.PLATFORM_PUBLISH` | One job per account/platform (1–2.5 min) |
| `email` | `QUEUES.EMAIL` | `email.post-failed` |
| `token` | `QUEUES.TOKEN` | `token.refresh`, `token.health-sweep` |
| `media` | `QUEUES.MEDIA` | `media.confirm` |
| `scheduler` | `QUEUES.SCHEDULER` | Cron sweeps only |
| `billing` | `QUEUES.BILLING` | `billing.sync` |

Job names: `JOB_NAMES` in same file.

### 1.5 Scheduling rules

| Use case | Mechanism |
|----------|-----------|
| User schedules a post | BullMQ `delay` on `POST /api/publish` |
| Periodic maintenance | `POST /api/cron/*` → enqueue sweep jobs (token health, etc.) |
| **Never** | Cron that scans DB every minute for due posts |

```ts
// server/src/services/enqueue.ts
enqueuePublishPost(app, data, { delay: scheduledAt - Date.now() })
```

### 1.6 Job IDs

| Flow | BullMQ jobId |
|------|--------------|
| Publish now | `publish-{trackingId}` (UUID) |
| Scheduled | `publish-scheduled-{postId}-{timestamp}` |
| Per-platform | `platform-{publicationId}` |
| Failure email | `email-failed-{publicationId}` (deduped) |

---

## 2. Tech stack & commands

- **Runtime:** Node ≥20
- **Package manager:** Bun
- **API:** Fastify 5 + `@fastify/cors`
- **Queue:** BullMQ 5 + Redis 7 (`docker compose up -d redis`)
- **Progress/SSE:** ioredis pub/sub via `JobProgressStore` in shared
- **Validation:** Zod
- **Build:** TypeScript `NodeNext`, workspace `composite: true`

```bash
cd backend
cp .env.example .env
docker compose up -d redis
bun install
bun run build                # shared → worker → server
bun run dev:server           # :3001
bun run dev:worker           # BullMQ consumers
```

**Do not** use `npm run build --workspaces` at root — infinite recursion under Bun. Root scripts use `bun run --filter`.

### Environment

| Var | Default | Used by |
|-----|---------|---------|
| `REDIS_URL` | `redis://127.0.0.1:6379` | server + worker |
| `PORT` / `HOST` | `3001` / `0.0.0.0` | server |
| `WORKER_PUBLISH_CONCURRENCY` | `5` | worker |
| `WORKER_PLATFORM_CONCURRENCY` | `20` | worker |
| `WORKER_EMAIL_CONCURRENCY` | `10` | worker |
| `CRON_SECRET` | — | `POST /api/cron/*` Bearer auth |
| `WORKER_STUB_FAIL=1` | — | Force stub publish failures (test email/SSE) |
| `DATABASE_URL` | — | Not wired yet |

---

## 3. Authentication (11 flows)

Auth is **ported from `frontend/`** — same DB, same encryption format, same OAuth logic. Uses a Next.js compatibility shim (`server/src/lib/shim/`) so ported route handlers run on Fastify unchanged.

### 3.1 User auth (Better Auth) — 2 flows

| Flow | Endpoints | Notes |
|------|-----------|-------|
| **Google OAuth** | `GET/POST /api/auth/*` | Better Auth catch-all via `auth.handler()` |
| **Email sign-up / sign-in** | `POST /api/auth/sign-up`, `sign-up-with-turnstile` | OTP via Resend + `emailOTP` plugin |

**Key files:**

| File | Role |
|------|------|
| `server/src/lib/auth.ts` | `betterAuth()` — same config as `frontend/lib/auth.ts` |
| `server/src/lib/env.ts` | All auth + OAuth env vars (Zod) |
| `server/src/db/index.ts` | Drizzle pool — **same Neon DB as frontend** |
| `server/src/db/schema.ts` | `user`, `session`, `account`, `verification`, `connected_accounts` |
| `server/src/lib/encryption.ts` | OAuth state + `encryptToken`/`decryptToken` (HKDF per account) |
| `server/src/lib/session.ts` | `getSessionFromRequest()` for Fastify routes |
| `server/src/routes/api/auth.ts` | Better Auth mount + sign-up/check-email routes |

**Session in API routes:** `requireUserId()` calls `auth.api.getSession()` from cookies. Dev fallback: `x-user-id` header.

**Env (must match frontend):** `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GOOGLE_CLIENT_*`, `ENCRYPTION_KEY`, `RESEND_*`, `NEXT_PUBLIC_APP_URL`.

### 3.2 Platform connect (9 platforms) — 9 flows

| # | Platform | Start | Callback / connect | Special |
|---|----------|-------|---------------------|---------|
| 1 | LinkedIn | `GET /api/connect/linkedin` | callback + `linkedin/select` | Company page multi-select |
| 2 | Facebook | `GET /api/connect/facebook` | callback + `facebook/select` | Page picker |
| 3 | Instagram (direct) | `GET /api/connect/instagram` | callback | OAuth 2 |
| 4 | Instagram via FB | `GET /api/connect/instagram-facebook` | callback + `select` | Facebook Login for Business |
| 5 | YouTube | `GET /api/connect/youtube` | callback | Google offline refresh |
| 6 | Pinterest | `GET /api/connect/pinterest` | callback | Board select in callback |
| 7 | TikTok | `GET /api/connect/tiktok` | callback | **PKCE** — verifier in `verification` table |
| 8 | X (Twitter) | `GET /api/connect/twitter_x` | callback | **OAuth 1.0a** — not OAuth 2 |
| 9 | Bluesky | — | `POST /api/connect/bluesky/byok` | **BYOK** — handle + app password |
| + | Threads | `GET /api/connect/threads` | callback | Meta long-lived token |

**Token storage** (`connected_accounts`):

- `encryptedAccessToken` — always set (`encryptToken(token, accountId)`)
- `encryptedRefreshToken` — refresh token, Twitter secret, or Bluesky app password
- `platformMetadata` — JSON (connection method, page IDs, etc.)
- Unique: `(userId, platform, platformUserId)`

**Platform ID:** DB enum uses `twitter_x` (not `twitter`). Backend `shared` publish stubs use `twitter` — align when wiring publish.

**Key files:**

| File | Role |
|------|------|
| `server/src/connect/platform-start.ts` | OAuth redirect start |
| `server/src/connect/platform-callback.ts` | Token exchange + DB insert (~1350 lines) |
| `server/src/connect/instagram-facebook-*.ts` | IG-via-Facebook flow |
| `server/src/connect/*-select.ts` | Page/account pickers |
| `server/src/connect/bluesky-byok.ts` | Bluesky BYOK |
| `server/src/lib/platforms.ts` | `PLATFORM_OAUTH_CONFIG` |
| `server/src/lib/oauth-connect-binding.ts` | CSRF connect binding cookie |
| `server/src/lib/tiktok-connect.ts` | TikTok profile resolution |
| `server/src/lib/token-refresh.ts` | `getValidToken()` for publish |
| `server/src/routes/api/connect/index.ts` | Fastify route registration |

**Also:**

- `POST /api/connect/refresh-tokens` — refresh all accounts for a platform
- `POST /api/connect/refresh-twitter-premium` — X Premium flag
- `GET /api/connect/:platform/reauth` — re-auth existing account

**OAuth redirect URI pattern:** `{NEXT_PUBLIC_APP_URL}/api/connect/{platform}/callback`

When backend runs standalone, set `NEXT_PUBLIC_APP_URL` to the URL that receives OAuth callbacks (frontend or backend).

### 3.3 Next.js → Fastify shim

Ported handlers use `next/headers`, `next/server`, `next/navigation`. Mapped via `server/package.json` `imports` to `server/src/lib/shim/*`.

`runNextRouteHandler()` in `server/src/lib/run-next-handler.ts` sets request context (cookies, redirects) per request.

**Do not edit ported connect logic** unless necessary — fix the shim layer instead.

---

## 4. Server (`server/`) — HTTP API

### 4.1 Key files

| File | Role |
|------|------|
| `src/index.ts` | Boot Fastify |
| `src/app.ts` | CORS, plugins, routes |
| `src/plugins/queue.ts` | `app.queues` + `app.jobProgress` |
| `src/routes/api/publish.ts` | Publish + jobs routes (SSE) |
| `src/services/enqueue.ts` | `enqueuePublishPost`, `createPublishTrackingId` |
| `src/middleware/auth.ts` | `requireUserId` (dev: `x-user-id` header) |

### 4.2 Route groups

| Prefix | Notes |
|--------|-------|
| `GET /health` | Liveness |
| `GET /api/routes` | Full route manifest |
| `/api/*` | Mirrors `frontend/app/api/**` |
| `/v1/*` | Legacy REST (posts, media, accounts) |

### 4.3 Implemented routes (not stubs)

| Route | Response | Notes |
|-------|----------|-------|
| `GET/POST /api/auth/*` | Better Auth | Google, email OTP, session |
| `POST /api/auth/sign-up*` | JSON | Dev / Turnstile sign-up |
| `GET /api/auth/check-email` | JSON | |
| `GET /api/connect/:platform` | Redirect | OAuth start (9 platforms) |
| `GET /api/connect/:platform/callback` | Redirect | Token exchange → `connected_accounts` |
| `GET /api/connect/instagram-facebook/*` | Redirect | IG via Facebook |
| `GET/POST /api/connect/*/select` | JSON | Page/account pickers |
| `POST /api/connect/bluesky/byok` | JSON | Bluesky BYOK |
| `POST /api/connect/refresh-tokens` | JSON | Sync token refresh |
| `POST /api/publish` (now) | `202` + `trackingId`, `streamUrl` | Initializes Redis progress |
| `POST /api/publish` (schedule) | `200` + `status: "scheduled"` | BullMQ delay, no SSE |
| `GET /api/jobs/:trackingId` | `200` snapshot / `404` / `403` | Poll fallback |
| `GET /api/jobs/:trackingId/stream` | SSE | `event: progress`, `event: done` |
| `POST /v1/posts/:id/publish` | `202` + SSE (same as publish now) | |
| `POST /api/media/confirm` | `202` | |
| `POST /api/billing/sync` | `202` | |
| `POST /api/cron/*` | `202` | Bearer `CRON_SECRET` |
| Token refresh routes | `202` | |

Billing, presign, webhooks still return `NOT_IMPLEMENTED`.

### 4.4 Session auth

`requireUserId()` uses Better Auth session cookies via `getSessionFromRequest()`. Dev fallback: `x-user-id` header.

Publish/jobs/connect routes return proper `401`/`403`/`404`.

---

## 5. Worker (`worker/`)

Runnable BullMQ process (`src/main.ts`) plus platform adapter library.

### 5.1 Queue consumers

| File | Queue | Concurrency |
|------|-------|-------------|
| `workers/publish.ts` | `publish` | `WORKER_PUBLISH_CONCURRENCY` |
| `workers/platform-publish.ts` | `platform-publish` | `WORKER_PLATFORM_CONCURRENCY` |
| `workers/email.ts` | `email` | `WORKER_EMAIL_CONCURRENCY` |
| `workers/token-refresh.ts` | `token` | 5 |
| `workers/scheduler.ts` | `scheduler` | 2 |
| `workers/billing.ts` | `billing` | 3 |
| `workers/media.ts` | `media` | 5 |

### 5.2 Library exports (`src/index.ts`)

| Export | Port from |
|--------|-----------|
| `publishToPlatform(ctx)` | `frontend/lib/publish-platform.ts` |
| `sendPostFailedEmail(job)` | Frontend email templates |
| `refreshPlatformToken(job)` | `frontend/lib/token-refresh.ts` |

Platform stubs: `worker/src/publish/platforms/index.ts` — all 9 platforms log and return fake success unless `WORKER_STUB_FAIL=1`.

### 5.3 Progress emission

`workers/publish.ts` — if `trackingId` present:

- `fan_out` + `setTotal`
- `platform_queued` per target

`workers/platform-publish.ts` — if `trackingId` present:

- `platform_uploading` → `platform_success` or `platform_failed`
- Auto `completed`/`failed` when `completed + failed >= total`

Scheduled jobs have **no** `trackingId` — no SSE when they wake up. Failures → email queue + optional in-app notification (wire later).

### 5.4 Platform publish failure handling

```ts
// worker/src/workers/platform-publish.ts
throw new UnrecoverableError(...)  // no BullMQ retry loop
emailQueue.add(..., { jobId: `email-failed-${publicationId}` })  // deduped
```

- `lockDuration: 180_000` (3 min)
- `stalledInterval: 60_000`

### 5.5 Stubs to wire

| Location | Port from |
|----------|-----------|
| `loadPublicationTargets()` | `frontend/db` — `post_publications` + `connected_accounts` |
| `workers/scheduler.ts` | `frontend/app/api/cron/*` |
| `workers/billing.ts` | `frontend/lib/billing-sync.ts` |
| token health sweep | `frontend/lib/token-health.ts` |

---

## 6. Shared (`shared/`)

| File | Purpose |
|------|---------|
| `src/queues.ts` | `QUEUES`, `JOB_NAMES` |
| `src/env.ts` | Zod env, `loadEnv()` |
| `src/types/jobs.ts` | BullMQ payloads (`trackingId` on publish jobs) |
| `src/types/job-progress.ts` | SSE event types, response DTOs |
| `src/types/dto.ts` | v1 REST DTOs |
| `src/lib/job-progress.ts` | `JobProgressStore` — Redis state + pub/sub |
| `src/lib/pagination.ts` | v1 list helpers |
| `src/api-routes.ts` | `FRONTEND_API_ROUTES` manifest |
| `src/constants/platforms.ts` | Sync with `frontend/lib/platforms.ts` |

---

## 7. Frontend integration (when wiring)

### Publish now — replace polling with SSE

Today frontend uses `publishPostWithParallelProgress` (`lib/publish-order.ts`) which polls DB publication rows. On this backend:

```ts
// 1. Start publish
const res = await fetch(`${API}/api/publish`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  credentials: "include",
  body: JSON.stringify({ postId, connectedAccountIds }),
});
const { trackingId, streamUrl } = await res.json();

// 2. Stream progress (use full URL if API is on different host)
const es = new EventSource(`${API}${streamUrl}`, { withCredentials: true });

es.addEventListener("progress", (e) => {
  const event = JSON.parse(e.data);
  // event.phase, event.platform, event.progress, event.message
  updatePlatformRow(event);
});

es.addEventListener("done", () => es.close());
```

**Note:** `EventSource` cannot send custom headers — use session cookies for auth, or pass a short-lived token as query param when Better Auth is wired.

### Schedule later

```ts
await fetch(`${API}/api/publish`, {
  method: "POST",
  body: JSON.stringify({
    postId,
    scheduledAt: scheduledAt.toISOString(),
    mode: "schedule",
  }),
});
// → show toast "Scheduled for {time}" — done, no stream
```

Store post + media refs in DB **before** calling publish (same as today).

---

## 9. Migration strategy (lowest risk)

Do **not** port everything at once. Keep Next.js in prod; migrate in this order:

1. **Redis + BullMQ** — move publish off Vercel (biggest cost win)
2. **Point frontend** `BETTER_AUTH_URL` / API at backend when ready
3. **Token refreshes** → already on backend; wire worker jobs to `getValidToken`
4. **Billing sync** → queue
5. **Replace API layer** — only when standalone frontend exists

Each step can run against the same Neon DB.

---

## 9. Conventions

- **Imports:** `@social0/shared`, `@social0/worker`; `.js` extensions in TS source.
- **Heavy work:** enqueue + fast HTTP response. Never await social APIs in server.
- **Publish now:** always create `trackingId` + `jobProgress.initJob()` before enqueue.
- **Schedule:** never create `trackingId`; return `200 scheduled`.
- **New queue job:** update `shared` types → `JOB_NAMES` → `enqueue.ts` → `worker/src/workers/`.
- **New route:** `api-routes.ts` manifest + `server/src/routes/api/`.
- **No CF Worker per post** — BullMQ on DO handles long work.

---

## 10. Known issues

### 10.1 HTTP status codes on older stubs

Many stub routes still return `200` with `NOT_IMPLEMENTED` body. Publish, jobs, and v1 publish routes use correct statuses.

### 10.2 Stub platform in fan-out

`loadPublicationTargets()` hardcodes `platform: "twitter"` when `connectedAccountIds` is passed. Wire DB before real multi-platform testing.

### 10.3 DTO type mismatch

`shared/src/types/dto.ts` uses `social_accounts: number[]`; frontend uses UUIDs. Fix when porting Drizzle.

### 10.4 SSE auth with EventSource

Cannot set `x-user-id` header from browser `EventSource`. Wire cookie-based Better Auth or token query param before production SSE.

### 10.5 Per-platform queues

Single `platform-publish` queue for all platforms. Split when TikTok rate limits clog LinkedIn.

### Fixed (do not re-introduce)

- ~~Duplicate emails on retry~~ → `UnrecoverableError` + deduped email jobId
- ~~Fixed publish jobId blocking re-publish~~ → UUID `trackingId` per attempt
- ~~No job status API~~ → `GET /api/jobs/:id` + SSE stream

---

## 11. Testing locally

```bash
# Terminal 1
docker compose up -d redis && bun run dev:server

# Terminal 2
bun run dev:worker

# Publish now
curl -s -X POST http://localhost:3001/api/publish \
  -H 'Content-Type: application/json' \
  -H 'x-user-id: user_test' \
  -d '{"postId":"post_123","connectedAccountIds":["acc_1","acc_2"]}'

# SSE (replace trackingId)
curl -N -H 'x-user-id: user_test' \
  http://localhost:3001/api/jobs/<trackingId>/stream

# Snapshot
curl -H 'x-user-id: user_test' \
  http://localhost:3001/api/jobs/<trackingId>

# Schedule later
curl -s -X POST http://localhost:3001/api/publish \
  -H 'Content-Type: application/json' \
  -H 'x-user-id: user_test' \
  -d '{"postId":"post_123","scheduledAt":"2026-06-15T10:00:00.000Z","mode":"schedule"}'

# Force platform failure (test email + SSE failed phase)
WORKER_STUB_FAIL=1 bun run dev:worker
```

---

## 12. Relationship to frontend

| Frontend | Backend |
|----------|---------|
| `app/api/**/route.ts` | `server/src/routes/api/*.ts` |
| `app/actions/publish.ts` | `POST /api/publish` + worker |
| `lib/publish-order.ts` (poll DB) | Replace with SSE for publish now |
| `lib/publish-platform.ts` | `worker/src/publish/` |
| `lib/token-refresh.ts` | `worker/src/tokens/refresh.ts` |
| `app/api/cron/*` | server enqueues → `worker/src/workers/scheduler.ts` |
| `db/schema.ts` | Port when wiring DB |

---

## 13. Scale & cost

- **server** — stateless, horizontal behind nginx
- **worker** — scale processes or `WORKER_*_CONCURRENCY`
- **Bottlenecks** — platform API rate limits and upload duration, not your API
- **Cost** — DO droplet (~$24) + Neon + R2 usage; avoids Vercel long-function billing

Rough capacity: thousands of active users on one droplet before splitting API vs worker machines.

---

## 14. Future (not built)

- Per-platform BullMQ queues with independent concurrency
- `publish-retry` + dead-letter queues (vs same-queue retries)
- `GET /api/jobs` list for user history
- In-app notifications on scheduled post failure
