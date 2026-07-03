# Social0 — AI guidance (`backend/` + `react-frontend/`)

Single source of truth for AI assistants working on the **production stack**: Fastify API (`backend/`), slim BullMQ cron worker (`backend/background-worker/`), Cloudflare publish worker (`cloudflare/publish-worker/`), and the **React SPA** (`react-frontend/`).

**Audience:** Anyone editing `backend/` or integrating with `react-frontend/`.

**Legacy:** `frontend/` (Next.js App Router) is **not deployed** — kept for reference and porting history only. Its AI doc (`frontend/claude.md`) is archived; do not treat it as the active app. **All new UI work goes in `react-frontend/`.** Both legacy and production stacks share the same Neon Postgres DB and `backend/server` API surface.

**Branch:** `main`

---

## 0. Repo layout

```
social0/
├── backend/                 # Bun workspaces — API + cron worker + shared
│   ├── server/              # @social0/server — Fastify HTTP + RPC BFF
│   ├── background-worker/   # @social0/background-worker — cron BullMQ only
│   ├── shared/              # @social0/shared — queues, CF client, types
│   ├── migrations/
│   ├── claude.md            # this file
│   └── README.md
├── react-frontend/          # Production SPA (Vite + React Router 7)
├── cloudflare/publish-worker/  # Platform publish at the edge (default prod path)
└── frontend/                # Legacy Next.js (do not extend unless explicitly asked)
```

| Layer | Responsibility |
| ----- | -------------- |
| **react-frontend** | UI — marketing, auth, dashboard, onboarding; calls `/api/*` and `POST /api/rpc` |
| **server** | HTTP — auth, validation, RPC services, enqueue, fast `202`/`200` |
| **CF publish worker** | Per-platform publish (1–2.5 min) — Postgres + R2 → platform APIs |
| **background-worker** | Cron-only BullMQ — scheduled dispatch, repost, autoplug, token health, billing zombie |
| **shared** | Queue names, job types, CF publish client, job progress store |

Publishing to TikTok/YouTube/Meta **never** blocks an HTTP request.

---

## 1. Architecture (current)

### 1.1 Production publish path (default)

`PUBLISH_DISPATCH=cloudflare` (see `backend/.env.example`).

```
react-frontend
  → POST /api/publish or RPC publish.*
  → server (Fastify)
  → DB (publish_jobs, post_publications)
  → fan-out: one CF queue message per platform
  → cloudflare/publish-worker
  → platform APIs
  → publish_job_events in Postgres → SSE / snapshot for “publish now”
```

- **Publish now:** `202` + `trackingId` + `GET /api/jobs/:id/stream` (SSE).
- **Schedule later:** BullMQ delay or cron `publish-scheduled` → CF **scheduled** queue (no SSE for the wake-up).

Key server files:

| File | Role |
| ---- | ---- |
| `server/src/services/publish-dispatch.ts` | CF vs BullMQ routing |
| `server/src/services/publish-enqueue.ts` | Fan-out + job rows |
| `server/src/publish/execute-publish.ts` | BullMQ fallback publish logic (same as legacy Next action) |
| `shared/src/lib/cf-publish-client.ts` | `cfEnqueuePlatformJob()`, `useCloudflarePublishFromEnv()` |

Set `PUBLISH_DISPATCH=bullmq` to use in-process BullMQ per-platform queues on the API droplet (legacy / local fallback).

### 1.2 Background worker (cron only)

`background-worker` runs **2** BullMQ consumers (not platform publish):

| Worker | Queue | Jobs |
| ------ | ----- | ---- |
| `workers/scheduler.ts` | `scheduler` | `cron.publish-scheduled`, `cron.repost`, `cron.autoplug`, `cron.billing-zombie-cleanup` |
| `workers/token-refresh.ts` | `token` | `token.health-sweep`, `token.refresh` |

Cron HTTP hits `server` → `202` enqueue → **background-worker** executes.

### 1.3 RPC BFF (dashboard data)

The SPA does **not** use Next.js server actions. It calls:

```
POST /api/rpc
{ "fn": "dashboard-data.loadPostsPageData", "args": [...] }
```

Handlers live in `server/src/services/*.ts`, wired in `server/src/routes/api/rpc.ts`.

Client: `react-frontend/src/lib/rpc.ts` → `fetchApi("/api/rpc", …)` with session cookies.

Mutation RPCs are rate-limited (`rpcMutationLimiter`); list in `RPC_MUTATION_HANDLERS` in `rpc.ts`.

---

## 2. Implementation status

| Area | Status |
| ---- | ------ |
| Fastify `/api/*` (auth, connect, billing, media, publish, cron, webhooks) | ✅ |
| `POST /api/rpc` services (posts, publish, dashboard-data, settings, onboarding, resurface) | ✅ |
| CF publish worker (production default) | ✅ |
| BullMQ publish fallback | ✅ (`PUBLISH_DISPATCH=bullmq`) |
| Publish now + SSE + DB fallback | ✅ |
| Schedule later + cron dispatch | ✅ |
| Better Auth (Google + email) | ✅ |
| Platform OAuth (9 platforms) | ✅ |
| Billing (Dodo) + webhook | ✅ |
| Admin `/admin/*`, `GET /metrics` | ✅ |
| Sentry (optional, lazy init) | ✅ `server/src/instrument.ts` |
| **react-frontend** dashboard parity | ✅ (composer, posts, calendar, billing, settings, bulk tools, …) |
| Guest dashboard browse (no session) | ✅ `GuestBanner`, `GuestTestModeDialog` |
| PostHog analytics | ✅ `react-frontend` |
| `/v1/*` REST CRUD | ❌ Stubs |

---

## 3. Backend monorepo

### 3.1 Layout

```
backend/
├── package.json              # workspaces: shared, server, background-worker
├── bun.lock
├── docker-compose.yml        # optional local Redis (Upstash in prod)
├── migrations/
├── server/
│   └── src/
│       ├── index.ts          # await initSentry(); boot app
│       ├── instrument.ts     # lazy @sentry/node when SENTRY_DSN set
│       ├── app.ts            # CORS, plugins, routes, Sentry Fastify handler
│       ├── db/schema.ts      # Drizzle — source of truth
│       ├── connect/          # OAuth start/callback per platform
│       ├── handlers/         # Ported Next route handlers (billing, queue, webhooks, …)
│       ├── routes/api/       # Fastify registrars + rpc.ts
│       ├── routes/admin/
│       ├── routes/v1/        # stubs
│       ├── services/         # RPC + publish-dispatch + enqueue
│       └── publish/          # execute-publish, finalize, load-targets
└── background-worker/
    └── src/
        ├── main.ts           # scheduler + token workers only
        ├── workers/
        └── cron/             # repost, autoplug, publish-scheduled, billing-zombie
```

> **Removed:** old `engine/` / fat `worker/` with 15 BullMQ platform consumers. Platform work moved to **CF publish worker** (prod) or **server publish/** (bullmq fallback).

### 3.2 Commands

```bash
cd backend
cp .env.example .env          # or sync from production secrets
bun install                     # required — hoists deps to backend/node_modules
bun run build                   # shared → background-worker → server

# Dev (two terminals)
bun run dev:server              # :3001
bun run dev:background-worker   # cron consumers
```

**Do not** run `npm run build` inside `server/` without `bun install` at `backend/` — `@sentry/node` and workspace packages resolve from the workspace root.

### 3.3 Environment (high-signal)

| Var | Notes |
| --- | ----- |
| `DATABASE_URL` | Neon — same DB as SPA |
| `UPSTASH_REDIS_REST_URL` / `TOKEN` | Queues, rate limits, job progress pub/sub |
| `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` / `AUTH_API_URL` | Auth API host (`api.social0.app`) |
| `NEXT_PUBLIC_APP_URL` / `APP_URL` | SPA origin for redirects |
| `TRUSTED_APP_ORIGINS` / `CORS_ORIGINS` | Browser CORS |
| `ENCRYPTION_KEY` | 64 hex — must match across envs |
| `PUBLISH_DISPATCH` | `cloudflare` (default) or `bullmq` |
| `CF_PUBLISH_WORKER_URL`, `CF_PUBLISH_HMAC_SECRET` | CF publish worker |
| `CRON_SECRET`, `ADMIN_API_KEY` | Cron + admin routes |
| `SENTRY_DSN` | Optional — server only, lazy-loaded |
| `R2_*`, `DODO_*`, platform `*_CLIENT_*` | Media, billing, connect |

Full list: `backend/.env.example`. SPA vars: `react-frontend/.env.example`.

---

## 4. React frontend (`react-frontend/`)

### 4.1 Stack

| Piece | Choice |
| ----- | ------ |
| Build | Vite 8 + TypeScript |
| UI | React 19, Tailwind 4, shadcn/ui |
| Router | React Router 7 (`src/routes/router.tsx`) |
| Data | TanStack Query + `rpc()` / `fetchApi()` |
| Auth | better-auth client (`src/lib/auth-client.ts`) |
| Analytics | PostHog (`main.tsx`, `lib/posthog-events.ts`) |
| Package manager | Bun |

### 4.2 Dev setup

```bash
cd react-frontend
bun install
cp .env.example .env

# Terminal 1 — API
cd backend && bun run dev:server

# Terminal 2 — SPA (https://localhost:3000 if certs present)
cd react-frontend && bun run dev
```

Vite proxies `/api` and `/v1` to `VITE_API_PROXY_TARGET` (default `http://localhost:3001`). Leave `VITE_API_URL` **empty** in dev so the browser uses same-origin `/api` through the proxy.

HTTPS dev: place certs in `backend/certificates/` or `react-frontend/certificates/` (`localhost-key.pem` + `localhost.pem`).

### 4.3 Source layout

```
react-frontend/src/
├── routes/router.tsx       # Route tree
├── layouts/
│   ├── RootLayout.tsx      # PostHog $pageview
│   ├── DashboardLayout.tsx # dashboard-shell, guest banners, sidebar
│   └── OnboardingLayout.tsx
├── pages/                  # Thin route entry components
├── features/
│   ├── auth/               # AuthPage, verify, reset password
│   ├── dashboard/          # Composer, posts, calendar, billing, settings, …
│   ├── marketing/          # Terms, privacy, PSEO features/alternatives
│   └── onboarding/
├── components/
│   ├── landing/            # Marketing sections (scoped .landing theme)
│   └── dashboard/          # Sidebar, bottom nav, guest UI
├── api/                    # Typed RPC wrappers (dashboard-data, posts, publish, …)
├── lib/
│   ├── rpc.ts              # POST /api/rpc
│   ├── fetch-api.ts        # apiUrl() + credentials
│   ├── env.ts              # VITE_* helpers, getAuthBaseUrl()
│   └── auth-client.ts
└── index.css               # Global + dashboard tokens; .landing scoped overrides
```

### 4.4 Auth & landing funnel

| User state | Landing CTAs | Auth page |
| ---------- | ------------- | --------- |
| Signed out | `/auth` (Hero, header, pricing, final CTA) | Sign in / sign up; link **Explore the dashboard →** → `/dashboard` |
| Signed in | `/dashboard` | Redirect away from auth |

`HomePage` (`/`): signed-in users → `/dashboard`; guests see `LandingPageView`.

**Guest dashboard:** `/dashboard/*` works without session (read-only / test mode). `GuestBanner` + `GuestTestModeDialog` prompt sign-in. `useSessionResolved()` / `useIsGuest()` in `lib/use-is-guest.ts`.

**Better Auth base URL:** `getAuthBaseUrl()` — dev uses SPA origin (proxy); prod uses `VITE_API_URL` or `https://api.social0.app`.

### 4.5 Theming & brand colors

Dashboard uses semantic CSS variables in `react-frontend/src/index.css`:

| Token | Light | Dark |
| ----- | ----- | ---- |
| `--brand-emerald` | `#10B981` | (via `--accent`) |
| `--brand-emerald-dark` | `#059669` | `--accent-hover` |
| `--brand-emerald-light` | `#34D399` | `--accent-light` |
| `--bg` | `#FAFAF8` | `#0A0A0A` |
| `--sidebar-bg` | `#FFFFFF` (nav only) | `#0A0A0A` |
| `--accent` | `#10B981` | `#10B981` (buttons; same primary) |

**Dashboard components** use Tailwind tokens: `bg-accent`, `text-accent`, `hover:bg-accent-hover`, `text-accent-foreground` — not raw `emerald-*` classes.

**Landing** uses scoped `.landing` / `.landing.dark` block at bottom of `index.css` — **do not** change landing emerald when tweaking dashboard tokens.

`DashboardLayout` root: `className="dashboard-shell …"` for dashboard-scoped CSS overrides.

### 4.6 Key routes

| Path | Page |
| ---- | ---- |
| `/` | Landing (guest) or redirect to dashboard |
| `/auth` | Sign in / sign up |
| `/dashboard` | → `/dashboard/composer` |
| `/dashboard/composer` | Composer |
| `/dashboard/posts` | All posts |
| `/dashboard/calendar` | Calendar |
| `/dashboard/connections` | Connect accounts |
| `/dashboard/billing` | Billing |
| `/dashboard/settings` | Settings |
| `/dashboard/bulk-tools/*` | Bulk image/video |
| `/onboarding` | Onboarding wizard |
| `/features`, `/alternatives`, `/home` | Marketing PSEO |

---

## 5. Server HTTP API (summary)

### 5.1 Boot

1. `index.ts` → `await initSentry()` (no-op without `SENTRY_DSN`)
2. `buildApp()` — CORS, cookies, metrics, queues, routes
3. If `SENTRY_DSN`: `setupFastifyErrorHandler(app)`; dev-only `GET /debug-sentry`

Sentry types stub: `server/src/types/sentry-node.d.ts` (build works before `bun install` resolves `@sentry/node`; runtime still needs the package when DSN is set).

### 5.2 Auth

- Better Auth: `GET/POST /api/auth/*`
- Session cookie or `Authorization: Bearer s0_live_*` API key
- Dev: `x-user-id` header
- Platform connect: `GET /api/connect/:platform` (+ callbacks, select pages)

### 5.3 Publish

| Mode | Response | Progress |
| ---- | -------- | -------- |
| Publish now | `202` + `trackingId`, `streamUrl` | SSE `GET /api/jobs/:id/stream` |
| Schedule | `200` `status: "scheduled"` | None at schedule time |

SSE phases: `shared/src/types/job-progress.ts`. Storage: Redis + `publish_jobs` / `publish_job_events` tables.

### 5.4 Other `/api/*` groups

Billing (`/api/billing/*`), media presign/confirm, queue slots, Pinterest, Canny SSO, webhooks (`/api/webhooks/dodo`), cron (`POST /api/cron/*` + `CRON_SECRET`), api-keys, admin (`/admin/*`).

Route manifest: `GET /api/routes` (`shared/src/api-routes.ts`).

---

## 6. Shared package (`@social0/shared`)

| File | Purpose |
| ---- | ------- |
| `queues.ts` | `QUEUES`, `JOB_NAMES`, `platformPublishQueueName()` |
| `lib/cf-publish-client.ts` | CF enqueue + `useCloudflarePublishFromEnv()` |
| `constants/cf-publish-queues.ts` | `publish-now` / `publish-scheduled` queue names |
| `lib/job-progress.ts` | `JobProgressStore` — Redis + pub/sub for SSE |
| `types/jobs.ts` | BullMQ / CF job payloads |
| `constants/platforms.ts` | 9 platforms, DB id `twitter_x` |

---

## 7. Database

Migrations in `backend/migrations/`. Schema: `server/src/db/schema.ts`.

`background-worker` has a **copy** of schema — keep in sync when adding tables.

**AI rule:** Do not generate or run new migrations unless the user explicitly requests a schema change.

---

## 8. Conventions

### Backend

- Imports: `@social0/shared`, `.js` extensions in TS (`moduleResolution` in server tsconfig).
- Heavy work: enqueue or CF dispatch — never await platform APIs in HTTP handlers.
- New RPC: handler in `services/`, register in `routes/api/rpc.ts`, client wrapper in `react-frontend/src/api/`.
- New REST route from legacy Next: `handlers/` + registrar in `routes/api/`.
- Publish now: always create `trackingId` + `jobProgress.initJob()` before enqueue.

### React frontend

- API calls: `rpc()` for BFF, `fetchApi()` for REST (publish SSE, connect OAuth redirects, uploads).
- Styling: dashboard → `accent` tokens; landing → `.landing` scoped vars only.
- New dashboard page: feature UI under `features/dashboard/`, thin `pages/*` route, register in `router.tsx`.
- Do not add Next.js patterns (`"use server"`, `app/` router) — this is a Vite SPA.

---

## 9. Local testing

```bash
# Stack
cd backend && docker compose up -d redis   # optional if using Upstash only
bun run dev:server
bun run dev:background-worker
cd ../react-frontend && bun run dev

# Publish now (dev auth)
curl -s -X POST http://localhost:3001/api/publish \
  -H 'Content-Type: application/json' \
  -H 'x-user-id: <user-uuid>' \
  -d '{"postId":"<post-uuid>"}'

# Health
curl http://localhost:3001/health
```

Use real session cookies when testing Better Auth flows in the browser.

---

## 10. Package relationships

| Legacy `frontend/` | `backend/server` | `react-frontend` |
| ------------------ | ------------------ | ---------------- |
| `app/api/**/route.ts` | `routes/handlers/**` + `routes/api/*` | — (uses RPC + REST) |
| `app/actions/*` | `services/*.ts` + `routes/api/rpc.ts` | `src/api/*` → `rpc()` |
| `app/actions/publish.ts` | `publish/execute-publish.ts` + CF worker | publish overlay / SSE client |
| `db/schema.ts` | `server/src/db/schema.ts` | — |
| — | — | `src/features/**` UI |

---

## 11. Known caveats

- `/v1/*` REST handlers are stubs except publish delegation.
- `server` and `background-worker` schema files are duplicated — update both.
- CF publish: scheduled posts use cron + scheduled queue, not BullMQ `delay` on the API.
- `PUBLISH_DISPATCH=bullmq` revives fat droplet-side platform workers (higher ops cost).
- Sentry: optional; without `bun install` at `backend/`, `tsc` still passes via type stub; runtime needs `@sentry/node` when `SENTRY_DSN` is set.

---

## 12. Future / not built

- Full `/v1` REST CRUD for external API consumers
- `GET /api/jobs` user-facing history list
- Production Dockerfiles referenced in compose prod files
- CLI (Phase 6)
