# Social0 Backend v2 - AI Guidance

This document is the **single source of truth for AI assistants** working in `backend/`. It describes the queue-based architecture, package layout, what is implemented vs stubbed, publish UX (SSE + scheduling), reliability patterns, and how to extend without breaking the server → worker split.

**Audience:** Any AI or human contributor editing `backend/`.

**Related:** The production app still runs on **`frontend/`** (Next.js). This backend is a **parallel side-build** for cheaper infra (DigitalOcean + Redis + BullMQ). It shares the same Neon Postgres DB and encryption keys as the frontend. It can run standalone or gradually replace Next.js API routes.

**Branch:** `cursor/backend-v2-server-engine-worker`

---

## 0. Project overview

### What this backend is

A **standalone Fastify API + BullMQ workers** that mirrors the Next.js `frontend/app/api/**` surface.

| Layer      | Responsibility                                                               |
| ---------- | ---------------------------------------------------------------------------- |
| **server** | HTTP - validate, auth, enqueue, return fast (`202` or `200`)                 |
| **worker** | BullMQ consumers - fan-out, real platform publish, email, cron, billing sync |
| **shared** | Types, queues, DTOs, job progress store, route manifest                      |

Publishing to TikTok/YouTube/Meta takes 1–2.5 minutes. That work **never** runs inside the HTTP request.

### Implementation status (honest)

| Area                                                         | Status                                                                                     |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Architecture (thin server + queues + fan-out)                | ✅ Done                                                                                    |
| All `/api/*` route registrars                                | ✅ Done                                                                                    |
| Publish now + SSE progress                                   | ✅ Done                                                                                    |
| Schedule later + BullMQ delay                                | ✅ Done                                                                                    |
| Parallel per-platform jobs                                   | ✅ Done                                                                                    |
| **Better Auth** (Google + email OTP)                         | ✅ Ported from frontend                                                                    |
| **Platform OAuth** (9 platforms)                             | ✅ Ported from frontend                                                                    |
| DB + Drizzle (shared Neon)                                   | ✅ Wired in server + worker                                                                |
| Token encryption (HKDF per account)                          | ✅ Ported                                                                                  |
| **Real platform publish**                                    | ✅ Ported from `frontend/app/actions/publish.ts` → `worker/src/publish/execute-publish.ts` |
| R2 presign + media confirm                                   | ✅ `POST /api/media/presign`, `POST /api/media/confirm`                                    |
| Connected accounts CRUD                                      | ✅ `server/src/routes/api/accounts.ts`                                                     |
| **Billing** (checkout, portal, change-plan, cancel, sync, …) | ✅ Ported via route handlers                                                               |
| **Dodo webhook**                                             | ✅ `POST /api/webhooks/dodo` (raw-body signature verification)                             |
| Queue slots + add + next-slot                                | ✅ Ported via route handlers                                                               |
| Pinterest boards + default board                             | ✅ Ported                                                                                  |
| Canny SSO + change-email                                     | ✅ Ported                                                                                  |
| Job persistence + SSE DB fallback                            | ✅ `publish_jobs` + `publish_job_events`                                                   |
| Publish reliability tables                                   | ✅ `publish_attempts`, `publish_failures` (migration 002)                                  |
| Per-platform queues + DLQ + circuit breaker                  | ✅ `platform-publish-{platform}` + `platform-publish-dlq`                                  |
| Cron repost + autoplug                                       | ✅ Real logic in scheduler worker                                                          |
| Admin API                                                    | ✅ `/admin/jobs`, `/admin/failures`, `/admin/queues`                                       |
| API keys + user webhook subscriptions                        | ✅ `/api/api-keys`, `/api/webhooks/subscriptions`                                          |
| Observability                                                | ✅ Request IDs, structured logs, `GET /metrics`                                            |
| **v1 REST CRUD** (`/v1/posts`, `/v1/media`, …)               | ❌ Stubs only                                                                              |
| **CLI** (Phase 6)                                            | ❌ Not built                                                                               |

### Target production stack

| Layer             | Choice                                               |
| ----------------- | ---------------------------------------------------- |
| API               | Fastify (`server/`)                                  |
| Queue             | Redis + BullMQ                                       |
| Workers           | Node/Bun on DigitalOcean droplet (`worker/` process) |
| Database          | Neon Postgres (same as frontend)                     |
| Media             | Cloudflare R2 (presigned uploads)                    |
| Frontend (future) | React + Vite on Cloudflare Pages                     |
| Package manager   | **Bun** (`bun install`, `bun run build`)             |

### Monorepo layout

```
backend/
├── package.json              # Bun workspaces root
├── bun.lock
├── docker-compose.yml        # Redis for local dev
├── docker-compose.prod.yml   # Redis + server + worker replicas
├── migrations/
│   ├── 001_publish_jobs.sql
│   └── 002_production_hardening.sql
├── .env.example
├── claude.md                 # this file
├── README.md
├── scripts/
│   └── fix-handler-imports.mjs
├── shared/                   # @social0/shared
│   └── src/
│       ├── queues.ts           # QUEUES, JOB_NAMES, platformPublishQueueName()
│       ├── lib/job-progress.ts
│       └── types/
├── server/                   # @social0/server - Fastify API
│   └── src/
│       ├── app.ts              # CORS, logging, metrics, queues, routes
│       ├── db/                 # Drizzle schema (synced with frontend)
│       ├── lib/                # Auth, billing, R2, shims, api-keys, …
│       ├── connect/            # Platform OAuth handlers
│       ├── plugins/            # queue, logging, metrics
│       ├── routes/
│       │   ├── api/            # Fastify route registrars
│       │   ├── handlers/       # Ported Next.js route handlers
│       │   ├── admin/          # Ops API
│       │   └── v1/             # Legacy REST (stubs)
│       └── services/enqueue.ts
└── worker/                   # @social0/worker - BullMQ process
    └── src/
        ├── main.ts             # Starts 11+ BullMQ workers
        ├── workers/            # Queue consumers
        ├── publish/
        │   ├── execute-publish.ts   # Real publish (ported from frontend)
        │   ├── load-targets.ts      # DB-backed publication targets
        │   └── finalize-post.ts
        ├── cron/               # repost-run, autoplug-run, publish-scheduled
        └── lib/                # job-progress, circuit-breaker, publish-reliability, …
```

> **Note:** The old `engine/` package was removed. All BullMQ consumers live in `worker/`.

---

## 1. Architecture

### 1.1 Request flow

```
Client
  ↓
server (Fastify)          - auth, validation, enqueue
  ↓
Redis / BullMQ
  ↓
worker (BullMQ)           - fan-out → per-platform publish → finalize
  ↓ on definitive platform failure
DLQ + publish_failures row + user webhook + email queue
```

### 1.2 Publish UX - two paths (important)

These are **different user expectations**. Do not use SSE for scheduled posts.

#### Path A: Publish now (live progress)

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

GET /api/jobs/:trackingId          (snapshot - reconnect / DB fallback)
```

**SSE event phases** (`shared/src/types/job-progress.ts`):

`queued` → `fan_out` → `platform_queued` → `platform_uploading` → `platform_success` | `platform_failed` → `completed` | `failed`

**Progress storage:**

- **Redis** (live): `job:state:{trackingId}` (24h TTL) + pub/sub `job:events:{trackingId}`
- **Postgres** (durable): `publish_jobs` + `publish_job_events` - SSE reconnect fallback via `loadJobSnapshotFromDb()`

Implemented in `shared/src/lib/job-progress.ts`. Server attaches `app.jobProgress`; worker uses `worker/src/lib/job-progress.ts` with persist hooks in `job-progress-persist.ts`.

#### Path B: Schedule later (fire and forget)

```
POST /api/publish  {
  postId,
  connectedAccountIds?,
  scheduledAt: "2026-06-15T10:00:00.000Z",
  mode: "schedule"
}
  → 200 { status: "scheduled", postId, scheduledAt, jobId }
```

- **No** `trackingId`, **no** SSE.
- BullMQ `delay` wakes `publish.post` at `scheduledAt`.

Mode detection (`server/src/routes/api/publish.ts`):

- `mode: "schedule"` → always schedule (requires `scheduledAt`)
- `mode: "now"` → always publish now
- omitted → schedule if `scheduledAt` is in the future, else publish now

### 1.3 Fan-out + parallel execution

**Not sequential.** Total publish time ≈ `max(platform_times)`, not `sum`.

```
publish.post (orchestrator, queue: publish)
    ↓
loadPublicationTargets()     ← DB: post_publications + connected_accounts
    ↓
N × platform-publish-{platform} jobs   ← enqueued in parallel (Promise.all)
    ↓
9 dedicated platform workers (one queue per platform)
    ↓
each job → executePublish(postId, userId, publicationId)
    ↓
maybeFinalizePostPublish()   ← aggregate post status + failure email
```

**Per-platform queues** (`shared/src/queues.ts`):

```ts
platformPublishQueueName("tiktok"); // → "platform-publish-tiktok"
allPlatformPublishQueueNames(); // → 9 queues, one per SUPPORTED_PLATFORMS
```

Concurrency is split: `floor(WORKER_PLATFORM_CONCURRENCY / 9)` per platform worker (min 1).

If TikTok fails, YouTube/LinkedIn jobs still succeed independently.

### 1.4 Queues

Defined in `shared/src/queues.ts`:

| Queue                         | Constant / pattern            | Purpose                                               |
| ----------------------------- | ----------------------------- | ----------------------------------------------------- |
| `publish`                     | `QUEUES.PUBLISH`              | Orchestrator: `publish.post` fans out                 |
| `platform-publish-{platform}` | `platformPublishQueueName()`  | One job per account/platform (1–2.5 min)              |
| `platform-publish-dlq`        | `QUEUES.PLATFORM_PUBLISH_DLQ` | Exhausted retries land here                           |
| `platform-publish`            | `QUEUES.PLATFORM_PUBLISH`     | Legacy name - fan-out uses per-platform queues        |
| `email`                       | `QUEUES.EMAIL`                | `email.post-failed`                                   |
| `token`                       | `QUEUES.TOKEN`                | `token.refresh`, `token.health-sweep`                 |
| `media`                       | `QUEUES.MEDIA`                | `media.confirm`                                       |
| `scheduler`                   | `QUEUES.SCHEDULER`            | Cron sweeps                                           |
| `billing`                     | `QUEUES.BILLING`              | `billing.sync` (async fallback; sync route is inline) |

Job names: `JOB_NAMES` in same file.

**Default job options** (`server/src/plugins/queue.ts`):

- Platform jobs: 5 attempts, exponential backoff (10s base in fan-out)
- DLQ: `removeOnComplete: false` - ops can inspect failed jobs
- Orchestrator: 3 attempts

### 1.5 Publish reliability

| Mechanism           | Where                                                                                                           |
| ------------------- | --------------------------------------------------------------------------------------------------------------- |
| **Idempotency**     | Skip if `post_publications.status === "published"` and `platformPostId` set                                     |
| **Attempt log**     | `publish_attempts` table (`started` / `succeeded` / `failed`)                                                   |
| **Failure log**     | `publish_failures` on final exhaustion                                                                          |
| **DLQ**             | Job copied to `platform-publish-dlq` after max attempts                                                         |
| **Circuit breaker** | Per-platform in-process (`worker/src/lib/circuit-breaker.ts`) - opens after 5 failures in 5 min, 2 min cooldown |
| **User webhooks**   | `dispatchUserWebhooks()` on `publish.platform_success` / `publish.platform_failed`                              |

### 1.6 Scheduling rules

| Use case              | Mechanism                                     |
| --------------------- | --------------------------------------------- |
| User schedules a post | BullMQ `delay` on `POST /api/publish`         |
| Periodic maintenance  | `POST /api/cron/*` → enqueue sweep jobs       |
| Repost / autoplug     | Scheduler worker runs ported cron logic       |
| **Never**             | Cron that scans DB every minute for due posts |

### 1.7 Job IDs

| Flow          | BullMQ jobId                             |
| ------------- | ---------------------------------------- |
| Publish now   | `publish-{trackingId}` (UUID)            |
| Scheduled     | `publish-scheduled-{postId}-{timestamp}` |
| Per-platform  | `platform-{publicationId}`               |
| DLQ           | `dlq-{publicationId}`                    |
| Failure email | `email-failed-{publicationId}` (deduped) |

---

## 2. Tech stack & commands

- **Runtime:** Node ≥20 / Bun
- **API:** Fastify 5 + `@fastify/cors` + `@fastify/cookie`
- **Queue:** BullMQ 5 + Redis 7
- **Progress/SSE:** ioredis pub/sub via `JobProgressStore`
- **Validation:** Zod
- **Build:** TypeScript `NodeNext`

```bash
cd backend
cp .env.example .env          # or copy frontend/.env
docker compose up -d redis

# Apply migrations (once per DB)
psql "$DATABASE_URL" -f migrations/001_publish_jobs.sql
psql "$DATABASE_URL" -f migrations/002_production_hardening.sql

bun install
bun run build                 # shared → worker → server
bun run dev:server            # :3001
bun run dev:worker            # 11 BullMQ workers
```

**Do not** use `npm run build --workspaces` at root - use `bun run --filter`.

### Environment

Copy the full `frontend/.env` into `backend/.env`. Critical vars:

| Var                            | Used by         | Notes                                                 |
| ------------------------------ | --------------- | ----------------------------------------------------- |
| `DATABASE_URL`                 | server + worker | Same Neon DB as frontend                              |
| `REDIS_URL`                    | server + worker | Default `redis://127.0.0.1:6379`                      |
| `BETTER_AUTH_SECRET`           | server          | Min 32 chars                                          |
| `BETTER_AUTH_URL`              | server          | `http://localhost:3001` when testing backend directly |
| `NEXT_PUBLIC_APP_URL`          | server          | OAuth redirect base (frontend or backend host)        |
| `ENCRYPTION_KEY`               | server + worker | **Must match frontend** (64 hex chars)                |
| `R2_*`                         | server + worker | Presign + publish media reads                         |
| `DODO_PAYMENTS_API_KEY`        | server + worker | Billing                                               |
| `DODO_PAYMENTS_WEBHOOK_SECRET` | server          | Webhook signature verification                        |
| `DODO_PAYMENTS_ENVIRONMENT`    | server          | `test_mode` \| `live_mode`                            |
| `DODO_PAYMENTS_*_PRODUCT_ID`   | server          | Starter / growth / pro                                |
| `CRON_SECRET`                  | server + worker | `POST /api/cron/*` + internal cron runners            |
| `ADMIN_API_KEY`                | server          | `/admin/*` (falls back to `CRON_SECRET`)              |
| `WORKER_PUBLISH_CONCURRENCY`   | worker          | Default `5`                                           |
| `WORKER_PLATFORM_CONCURRENCY`  | worker          | Default `20` (split across 9 platform workers)        |
| `WORKER_EMAIL_CONCURRENCY`     | worker          | Default `10`                                          |
| `UPSTASH_REDIS_REST_*`         | server          | Optional rate limits                                  |
| `TURNSTILE_*`                  | server          | Required in production for sign-up                    |
| Platform OAuth `*_CLIENT_*`    | server          | Connect flows                                         |
| `CANNY_PRIVATE_KEY`            | server          | Canny SSO JWT                                         |
| `LOG_LEVEL`                    | server          | Default `info`                                        |

Validated in `server/src/lib/env.ts` (Zod). Worker uses `shared/src/env.ts` for concurrency + Redis only.

---

## 3. Authentication

### 3.1 User auth (Better Auth)

| Flow                    | Endpoints                                          |
| ----------------------- | -------------------------------------------------- |
| Google OAuth            | `GET/POST /api/auth/*` via `auth.handler()`        |
| Email sign-up / sign-in | `POST /api/auth/sign-up`, `sign-up-with-turnstile` |
| Dev test sign-in        | `POST /api/auth/test-signin` (non-prod)            |

**Key files:** `server/src/lib/auth.ts`, `server/src/lib/session.ts`, `server/src/routes/api/auth.ts`

### 3.2 Session + API key auth

`requireUserId()` (`server/src/middleware/auth.ts`) resolves identity in order:

1. Better Auth session cookie
2. `Authorization: Bearer s0_live_*` API key (`server/src/lib/api-keys.ts`)
3. Dev fallback: `x-user-id` header

API keys are stored hashed in `api_keys` table. Create via `POST /api/api-keys` (returns raw key once).

### 3.3 Platform connect (9 platforms)

| Platform         | Start                                 | Notes                       |
| ---------------- | ------------------------------------- | --------------------------- |
| LinkedIn         | `GET /api/connect/linkedin`           | Company page multi-select   |
| Facebook         | `GET /api/connect/facebook`           | Page picker                 |
| Instagram        | `GET /api/connect/instagram`          | OAuth 2                     |
| Instagram via FB | `GET /api/connect/instagram-facebook` | Facebook Login for Business |
| YouTube          | `GET /api/connect/youtube`            | Google offline refresh      |
| Pinterest        | `GET /api/connect/pinterest`          | Board select in callback    |
| TikTok           | `GET /api/connect/tiktok`             | PKCE                        |
| X (Twitter)      | `GET /api/connect/twitter_x`          | OAuth 1.0a                  |
| Bluesky          | `POST /api/connect/bluesky/byok`      | BYOK                        |
| Threads          | `GET /api/connect/threads`            | Meta long-lived token       |

**Platform ID:** DB enum uses `twitter_x`. `shared/src/constants/platforms.ts` matches.

**Key files:** `server/src/connect/*`, `server/src/routes/api/connect/index.ts`

OAuth redirect URI: `{NEXT_PUBLIC_APP_URL}/api/connect/{platform}/callback`

When backend runs standalone, either register backend URLs in OAuth apps or proxy callbacks through frontend.

### 3.4 Next.js → Fastify shim

Ported handlers use `next/headers`, `next/server`. Mapped via:

- `server/package.json` `imports` field
- `server/tsconfig.json` `paths`
- Shim implementations in `server/src/lib/shim/`

`runNextRouteHandler()` sets request context (cookies, redirects, raw body for webhooks).

**Handler location:** `server/src/routes/handlers/**` - copied from `frontend/app/api/**`, imports fixed to `../../../lib/*.js`.

**Webhook raw body:** `POST /api/webhooks/dodo` uses a `preParsing` hook to capture `request.rawBody` before JSON parsing (required for Dodo signature verification).

---

## 4. Server (`server/`) - HTTP API

### 4.1 Plugins & boot

| File                     | Role                                           |
| ------------------------ | ---------------------------------------------- |
| `src/index.ts`           | Boot Fastify                                   |
| `src/app.ts`             | CORS, cookie, logging, metrics, queues, routes |
| `src/plugins/queue.ts`   | `app.queues` + `app.jobProgress` + DLQ queue   |
| `src/plugins/logging.ts` | `x-request-id` on every request                |
| `src/plugins/metrics.ts` | `GET /metrics` counters                        |

### 4.2 Route groups

| Prefix            | Notes                                             |
| ----------------- | ------------------------------------------------- |
| `GET /health`     | Liveness                                          |
| `GET /metrics`    | In-process counters                               |
| `GET /admin/*`    | Ops API - Bearer `ADMIN_API_KEY` or `CRON_SECRET` |
| `GET /api/routes` | Full route manifest                               |
| `/api/*`          | Mirrors `frontend/app/api/**`                     |
| `/v1/*`           | Legacy REST (mostly stubs)                        |

### 4.3 Implemented `/api/*` routes

#### Auth & accounts

| Route                            | Notes                   |
| -------------------------------- | ----------------------- |
| `GET/POST /api/auth/*`           | Better Auth catch-all   |
| `POST /api/auth/sign-up*`        | Dev / Turnstile sign-up |
| `GET /api/auth/check-email`      |                         |
| `GET /api/accounts`              | Connected accounts list |
| `DELETE /api/accounts/:id`       | Disconnect              |
| `POST /api/accounts/:id/refresh` | Token refresh           |

#### Connect (9 platforms)

| Route                                       | Notes                |
| ------------------------------------------- | -------------------- |
| `GET /api/connect/:platform`                | OAuth start          |
| `GET /api/connect/:platform/callback`       | Token exchange       |
| `GET/POST /api/connect/*/select`            | Page/account pickers |
| `POST /api/connect/bluesky/byok`            | Bluesky BYOK         |
| `POST /api/connect/refresh-tokens`          |                      |
| `POST /api/connect/refresh-twitter-premium` |                      |

#### Publish & jobs

| Route                              | Response                          |
| ---------------------------------- | --------------------------------- |
| `POST /api/publish` (now)          | `202` + `trackingId`, `streamUrl` |
| `POST /api/publish` (schedule)     | `200` + `status: "scheduled"`     |
| `GET /api/jobs/:trackingId`        | Snapshot (Redis → DB fallback)    |
| `GET /api/jobs/:trackingId/stream` | SSE                               |

#### Media

| Route                     | Notes                              |
| ------------------------- | ---------------------------------- |
| `POST /api/media/presign` | R2 presigned upload URL            |
| `POST /api/media/confirm` | Enqueue `media.confirm` worker job |

#### Billing (Dodo Payments)

| Route                                   | Notes                                             |
| --------------------------------------- | ------------------------------------------------- |
| `POST /api/billing/checkout`            |                                                   |
| `GET/POST /api/billing/portal`          | Customer portal                                   |
| `POST /api/billing/change-plan`         |                                                   |
| `POST /api/billing/preview-plan-change` |                                                   |
| `POST /api/billing/cancel`              |                                                   |
| `POST /api/billing/cancel-downgrade`    |                                                   |
| `POST /api/billing/undo-cancel`         |                                                   |
| `POST /api/billing/pause`               |                                                   |
| `POST /api/billing/sync`                | Inline `syncSubscriptionForUserId()` (not queued) |

**Billing libs:** `billing-guards.ts`, `pending-checkout.ts`, `webhook-idempotency.ts`, `billing-sync.ts`

#### Webhooks

| Route                     | Notes                                                           |
| ------------------------- | --------------------------------------------------------------- |
| `POST /api/webhooks/dodo` | Dodo subscription events - idempotent via `webhook-idempotency` |

> **Cutover:** Point Dodo webhook URL to backend when ready. Until then, keep webhook on frontend.

#### Queue scheduling

| Route                               | Notes                  |
| ----------------------------------- | ---------------------- |
| `GET/POST /api/queue/slots`         | Recurring weekly slots |
| `PATCH/DELETE /api/queue/slots/:id` |                        |
| `GET /api/queue/next-slot`          |                        |
| `POST /api/queue/add`               | Add post to queue      |

#### Misc

| Route                                     | Notes                           |
| ----------------------------------------- | ------------------------------- |
| `GET /api/pinterest/boards`               |                                 |
| `PUT /api/pinterest/default-board`        |                                 |
| `GET /api/canny/sso`                      | Canny JWT                       |
| `POST /api/account/change-email/send-otp` |                                 |
| `POST /api/account/change-email`          |                                 |
| `POST /api/dev/trigger-crons`             | Dev only - fires scheduler jobs |

#### API platform

| Route                                  | Notes                  |
| -------------------------------------- | ---------------------- |
| `POST/GET /api/api-keys`               | Create / list API keys |
| `DELETE /api/api-keys/:id`             | Revoke                 |
| `POST/GET /api/webhooks/subscriptions` | User outbound webhooks |

#### Cron (Bearer `CRON_SECRET`)

| Route                              | Enqueues                 |
| ---------------------------------- | ------------------------ |
| `POST /api/cron/publish-scheduled` | `cron.publish-scheduled` |
| `POST /api/cron/repost`            | `cron.repost`            |
| `POST /api/cron/autoplug`          | `cron.autoplug`          |
| `POST /api/cron/token-health`      | `token.health-sweep`     |

### 4.4 Admin API (`/admin`)

| Route                              | Purpose                       |
| ---------------------------------- | ----------------------------- |
| `GET /admin/jobs`                  | Recent `publish_jobs` rows    |
| `GET /admin/failures`              | Unresolved `publish_failures` |
| `GET /admin/queues`                | BullMQ depth per queue        |
| `POST /admin/failures/:id/resolve` | Mark failure resolved         |

Auth: `Authorization: Bearer {ADMIN_API_KEY}` or `{CRON_SECRET}`.

### 4.5 Stubbed routes

| Area                                                                | Status            |
| ------------------------------------------------------------------- | ----------------- |
| `/v1/posts`, `/v1/media`, `/v1/social-accounts`, `/v1/post-results` | `NOT_IMPLEMENTED` |
| `POST /api/media/upload`                                            | Deprecated stub   |

v1 publish (`POST /v1/posts/:id/publish`) **does** work - delegates to same publish flow.

---

## 5. Worker (`worker/`)

### 5.1 Workers started (`src/main.ts`)

| Worker                            | Queue(s)                      | Concurrency                              |
| --------------------------------- | ----------------------------- | ---------------------------------------- |
| `workers/publish.ts`              | `publish`                     | `WORKER_PUBLISH_CONCURRENCY`             |
| `workers/platform-publish.ts` × 9 | `platform-publish-{platform}` | `floor(WORKER_PLATFORM_CONCURRENCY / 9)` |
| `workers/email.ts`                | `email`                       | `WORKER_EMAIL_CONCURRENCY`               |
| `workers/token-refresh.ts`        | `token`                       | 5                                        |
| `workers/scheduler.ts`            | `scheduler`                   | 2                                        |
| `workers/billing.ts`              | `billing`                     | 3                                        |
| `workers/media.ts`                | `media`                       | 5                                        |

**Total:** 1 + 9 + 5 = **15 BullMQ worker instances** per process.

### 5.2 Publish pipeline

| File                         | Role                                                    |
| ---------------------------- | ------------------------------------------------------- |
| `publish/load-targets.ts`    | Load `post_publications` + `connected_accounts` from DB |
| `publish/execute-publish.ts` | Full platform publish logic (ported from frontend)      |
| `publish/finalize-post.ts`   | Aggregate post status, send failure email               |
| `lib/publish-reliability.ts` | Attempt/failure recording, idempotency check            |
| `lib/circuit-breaker.ts`     | Per-platform failure window                             |
| `lib/user-webhooks.ts`       | Outbound webhook delivery                               |
| `lib/billing-sync.ts`        | Dodo subscription sync (billing worker)                 |

> `worker/src/publish/platforms/index.ts` contains **unused stubs** - real publish goes through `execute-publish.ts` directly.

### 5.3 Platform publish failure handling

```ts
// worker/src/workers/platform-publish.ts
- 5 BullMQ attempts with exponential backoff
- UnrecoverableError on definitive platform failure (no infinite retry)
- On exhaustion: publish_failures row + DLQ job + user webhook
- lockDuration: 180_000 (3 min), stalledInterval: 60_000
```

### 5.4 Scheduler cron jobs

| Job                      | Implementation                                |
| ------------------------ | --------------------------------------------- |
| `cron.publish-scheduled` | `cron/publish-scheduled.ts`                   |
| `cron.repost`            | `cron/repost-run.ts` (ported from frontend)   |
| `cron.autoplug`          | `cron/autoplug-run.ts` (ported from frontend) |

Cron handlers verify `CRON_SECRET` via fake internal `Request`. Worker passes Bearer token from env.

### 5.5 Progress emission

When `trackingId` is present:

- **Orchestrator:** `fan_out`, `platform_queued` per target
- **Platform worker:** `platform_uploading` → `platform_success` | `platform_failed`
- **Auto-complete:** when `completed + failed >= total`

Scheduled jobs have **no** `trackingId` - no SSE when they wake up.

---

## 6. Shared (`shared/`)

| File                         | Purpose                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------- |
| `src/queues.ts`              | `QUEUES`, `JOB_NAMES`, `platformPublishQueueName()`, `allPlatformPublishQueueNames()` |
| `src/env.ts`                 | Worker env (Redis, concurrency)                                                       |
| `src/types/jobs.ts`          | BullMQ payloads                                                                       |
| `src/types/job-progress.ts`  | SSE event types                                                                       |
| `src/types/dto.ts`           | v1 REST DTOs                                                                          |
| `src/lib/job-progress.ts`    | `JobProgressStore` - Redis state + pub/sub                                            |
| `src/lib/pagination.ts`      | v1 list helpers                                                                       |
| `src/api-routes.ts`          | `FRONTEND_API_ROUTES` manifest                                                        |
| `src/constants/platforms.ts` | `SUPPORTED_PLATFORMS`, `twitter_x`                                                    |

---

## 7. Database migrations

Run against the same Neon DB as frontend:

```bash
psql "$DATABASE_URL" -f migrations/001_publish_jobs.sql
psql "$DATABASE_URL" -f migrations/002_production_hardening.sql
```

| Migration                      | Tables                                                                                              |
| ------------------------------ | --------------------------------------------------------------------------------------------------- |
| `001_publish_jobs.sql`         | `publish_jobs`, `publish_job_events`                                                                |
| `002_production_hardening.sql` | `publish_attempts`, `publish_failures`, `security_events`, `api_keys`, `user_webhook_subscriptions` |

Schema source of truth: `server/src/db/schema.ts` (also copied to `worker/src/db/schema.ts` - keep in sync when adding tables).

---

## 8. Frontend integration

### Publish now - SSE

```ts
const res = await fetch(`${API}/api/publish`, {
  method: "POST",
  credentials: "include",
  body: JSON.stringify({ postId, connectedAccountIds }),
});
const { trackingId, streamUrl } = await res.json();

const es = new EventSource(`${API}${streamUrl}`, { withCredentials: true });
es.addEventListener("progress", (e) => updateUI(JSON.parse(e.data)));
es.addEventListener("done", () => es.close());
```

**SSE auth:** Use session cookies (`withCredentials: true`). `EventSource` cannot send custom headers.

### Point frontend at backend

Set in frontend env when cutting over:

```
BETTER_AUTH_URL=https://api.yourdomain.com
# or proxy /api/* to backend
```

### Billing webhook cutover

1. Deploy backend with `DODO_PAYMENTS_WEBHOOK_SECRET`
2. Update Dodo dashboard webhook URL → `https://api.yourdomain.com/api/webhooks/dodo`
3. Verify with test event before removing frontend webhook

---

## 9. Migration strategy (lowest risk)

1. **Redis + workers** - run backend alongside frontend (same DB)
2. **Media + publish** - point `POST /api/publish` and presign at backend
3. **Billing webhook** - switch Dodo webhook URL last (money-critical)
4. **Full API cutover** - proxy all `/api/*` to backend or update `BETTER_AUTH_URL`
5. **v1 REST** - port when external API consumers exist

Each step can run against the same Neon DB without data migration.

---

## 10. Conventions

- **Imports:** `@social0/shared`; `.js` extensions in TS source (`NodeNext`).
- **Heavy work:** enqueue + fast HTTP response. Never await social APIs in server.
- **Publish now:** always `createPublishTrackingId()` + `jobProgress.initJob()` before enqueue.
- **Schedule:** never create `trackingId`; return `200 scheduled`.
- **New queue job:** `shared` types → `JOB_NAMES` → `enqueue.ts` → `worker/src/workers/`.
- **New API route from frontend:** copy to `routes/handlers/`, fix imports, wire in `routes/api/*.ts` via `runNextRouteHandler()`.
- **New table:** update both `server` and `worker` schema copies + add SQL migration.
- **No CF Worker per post** - BullMQ handles long work.

---

## 11. Known issues & caveats

### 11.1 v1 REST stubs

`/v1/posts`, `/v1/media`, etc. return `NOT_IMPLEMENTED`. API key auth works but handlers aren't ported.

### 11.2 DTO type mismatch

`shared/src/types/dto.ts` uses `social_accounts: number[]`; frontend uses UUIDs. Fix when porting v1.

### 11.3 Circuit breaker scope

In-process only - each worker replica has independent breaker state. For multi-replica deployments, consider Redis-backed breaker (hook exists in `initCircuitBreaker()`).

### 11.4 Duplicate schema

`server/src/db/schema.ts` and `worker/src/db/schema.ts` are copies. Keep them in sync manually.

### 11.5 Production Dockerfiles

`docker-compose.prod.yml` references `Dockerfile.server` and `Dockerfile.worker` - create these before prod deploy.

### Fixed (do not re-introduce)

- ~~Platform publish stubs~~ → real `execute-publish.ts`
- ~~Billing/webhook stubs~~ → full Dodo integration
- ~~Single shared platform queue~~ → per-platform queues + DLQ
- ~~No job DB persistence~~ → `publish_jobs` + SSE fallback
- ~~Duplicate emails on retry~~ → `UnrecoverableError` + deduped email jobId
- ~~Fixed publish jobId blocking re-publish~~ → UUID `trackingId` per attempt

---

## 12. Testing locally

```bash
# Terminal 1
docker compose up -d redis && bun run dev:server

# Terminal 2
bun run dev:worker

# Publish now (dev auth)
curl -s -X POST http://localhost:3001/api/publish \
  -H 'Content-Type: application/json' \
  -H 'x-user-id: <your-user-id>' \
  -d '{"postId":"<uuid>"}'

# SSE
curl -N -H 'x-user-id: <your-user-id>' \
  http://localhost:3001/api/jobs/<trackingId>/stream

# Admin queues
curl -H "Authorization: Bearer $CRON_SECRET" \
  http://localhost:3001/admin/queues

# Metrics
curl http://localhost:3001/metrics

# Schedule later
curl -s -X POST http://localhost:3001/api/publish \
  -H 'Content-Type: application/json' \
  -H 'x-user-id: <your-user-id>' \
  -d '{"postId":"<uuid>","scheduledAt":"2026-12-01T10:00:00.000Z","mode":"schedule"}'
```

Use real session cookies (not `x-user-id`) when testing Better Auth flows.

---

## 13. Relationship to frontend

| Frontend                         | Backend                                             |
| -------------------------------- | --------------------------------------------------- |
| `app/api/**/route.ts`            | `server/src/routes/handlers/**` + `routes/api/*.ts` |
| `app/actions/publish.ts`         | `worker/src/publish/execute-publish.ts`             |
| `lib/publish-order.ts` (poll DB) | Replace with SSE for publish now                    |
| `lib/billing-guards.ts` etc.     | `server/src/lib/billing-*.ts`                       |
| `app/api/webhooks/dodo/route.ts` | `routes/handlers/webhooks/dodo.ts`                  |
| `app/api/cron/*`                 | server enqueues → `worker/src/workers/scheduler.ts` |
| `db/schema.ts`                   | `server/src/db/schema.ts` (+ worker copy)           |

---

## 14. Scale & cost

- **server** - stateless, horizontal behind nginx/CF
- **worker** - scale processes or tune `WORKER_*_CONCURRENCY`; per-platform queues prevent slow platforms blocking fast ones
- **Bottlenecks** - platform API rate limits and upload duration, not your API
- **Ops** - `/admin/queues`, `/admin/failures`, DLQ inspection, `publish_attempts` audit trail
- **Cost** - DO droplet (~$24) + Neon + R2; avoids Vercel long-function billing

Rough capacity: thousands of active users on one droplet before splitting API vs worker machines.

---

## 15. Future (not built)

- **v1 REST CRUD** - full parity with external API consumers
- **CLI** (Phase 6) - developer tooling
- **Redis-backed circuit breaker** - shared state across worker replicas
- **`GET /api/jobs`** - user-facing job history list
- **In-app notifications** on scheduled post failure
- **Production Dockerfiles** - referenced in `docker-compose.prod.yml`
- **Horizontal worker specialization** - dedicated droplets per platform family (optional)
