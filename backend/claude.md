# Social0 backend — AI guidance

API + workers for Social0. **Whole-system map:** root [`CLAUDE.md`](../CLAUDE.md). SPA lives in [`../frontend/`](../frontend/) (not a `react-frontend/` directory).

**Audience:** edits under `backend/` or `cloudflare/publish-worker/` that share server publish modules.

**Branch:** keep `main` deployable — `backend/**` changes auto-deploy via `.github/workflows/deploy-backend.yml`.

---

## 0. Layout

```
backend/
├── server/              # @social0/server — Fastify HTTP + RPC BFF + publish engine
├── background-worker/   # @social0/background-worker — cron BullMQ only
├── shared/              # @social0/shared — queues, CF client, types
├── migrations/
├── claude.md            # this file
└── README.md

cloudflare/
├── publish-worker/      # default prod platform publish
├── cron-worker/         # CF cron → POST /api/cron/*
└── mcp-worker/          # hosted MCP
```

| Layer | Responsibility |
| ----- | -------------- |
| **frontend/** | UI — calls `/api/*` and `POST /api/rpc` |
| **server** | Auth, validation, RPC, enqueue, fast `202`/`200` |
| **CF publish worker** | Per-platform publish (1–2.5 min) — Hyperdrive + R2 → platforms |
| **background-worker** | Cron: scheduled dispatch, repost, autoplug, token health, billing zombie |
| **shared** | Queue names, job types, CF publish client, job progress |

Publishing to TikTok/YouTube/Meta **never** blocks an HTTP request.

---

## 1. Publish path (default)

`PUBLISH_DISPATCH=cloudflare` (see `backend/.env.example`).

```
frontend → POST /api/publish or RPC publish.*
  → server
  → DB (publish_jobs, post_publications)
  → fan-out: one CF queue message per platform
  → cloudflare/publish-worker
  → platform APIs
  → finalize-post (status + failure email + webhooks)
  → publish_job_events → SSE / snapshot for “publish now”
```

| File | Role |
| ---- | ---- |
| `server/src/services/publish-dispatch.ts` | CF vs BullMQ |
| `server/src/services/publish-enqueue.ts` | Fan-out + job rows |
| `server/src/publish/execute-publish.ts` | Core / BullMQ path |
| `server/src/publish/finalize-post.ts` | Aggregate + email + webhooks |
| `server/src/lib/post-failure-email.ts` | Resend failure mail (await only) |
| `server/src/lib/publish-platforms/*` | Prefer new networks here |
| `shared/src/lib/cf-publish-client.ts` | HMAC enqueue |

`PUBLISH_DISPATCH=bullmq` = droplet-side platform queues (legacy / local fallback).

**Failure emails:** only from awaited `maybeFinalizePostPublish`. Never `void` sendEmail on the CF path (isolate kills in-flight work).

---

## 2. Background worker (cron only)

| Worker | Queue | Jobs |
| ------ | ----- | ---- |
| `workers/scheduler.ts` | `scheduler` | `cron.publish-scheduled`, `cron.repost`, `cron.autoplug`, `cron.billing-zombie-cleanup` |
| `workers/token-refresh.ts` | `token` | `token.health-sweep`, `token.refresh` |

Triggered by `cloudflare/cron-worker` → `POST /api/cron/*` + `CRON_SECRET`.

---

## 3. RPC BFF

```
POST /api/rpc
{ "fn": "dashboard-data.loadPostsPageData", "args": [...] }
```

Handlers: `server/src/services/*.ts`, wired in `server/src/routes/api/rpc.ts`.  
Client: `frontend/src/lib/rpc.ts`. Mutations listed in `RPC_MUTATION_HANDLERS`.

Also: Better Auth `/api/auth/*`, billing `/api/billing/*`, connect, media, team, admin, **`/v1/*` (implemented)** for CLI/MCP API keys.

---

## 4. Status

| Area | Status |
| ---- | ------ |
| Fastify `/api/*` | ✅ |
| `POST /api/rpc` | ✅ |
| CF publish worker | ✅ (prod default) |
| BullMQ publish fallback | ✅ |
| Publish now + SSE | ✅ |
| Schedule + cron dispatch | ✅ |
| Better Auth + 9 platforms | ✅ |
| Billing (Dodo) + webhook | ✅ |
| Teams / workspaces | ✅ |
| `/v1/*` REST for API keys | ✅ |
| CLI + MCP packages | ✅ (`social0-cli/`, `social0-mcp/`) |
| Admin `/admin/*`, metrics | ✅ |
| Sentry (optional) | ✅ lazy `instrument.ts` |

---

## 5. Commands

```bash
cd backend
cp .env.example .env
bun install          # or npm install — hoist to backend/node_modules
bun run build        # shared → background-worker → server

bun run dev:server              # :3001
bun run dev:background-worker   # cron consumers
```

Do not run `npm run build` inside `server/` without installing at `backend/` first.

---

## 6. Environment (high-signal)

| Var | Notes |
| --- | ----- |
| `DATABASE_URL` | Neon |
| `UPSTASH_REDIS_REST_URL` / `TOKEN` | Queues, rate limits, job progress |
| `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` / `AUTH_API_URL` | Auth API host |
| `NEXT_PUBLIC_APP_URL` / `APP_URL` | SPA origin |
| `TRUSTED_APP_ORIGINS` / `CORS_ORIGINS` | CORS |
| `ENCRYPTION_KEY` | 64 hex — match API + publish-worker |
| `PUBLISH_DISPATCH` | `cloudflare` (default) or `bullmq` |
| `CF_PUBLISH_WORKER_URL`, `CF_PUBLISH_HMAC_SECRET` | CF publish |
| `CRON_SECRET`, `ADMIN_API_KEY` | Cron + admin |
| `RESEND_*` | Auth OTP + post-failure email |
| `R2_*`, `DODO_*`, platform `*_CLIENT_*` | Media, billing, connect |

Full list: `.env.example`. SPA: `frontend/.env.example`.

---

## 7. Database

Migrations: `backend/migrations/`. Schema: `server/src/db/schema.ts`.  
`background-worker` has a **copy** — keep in sync when schema changes.

**AI rule:** Do not generate or run migrations unless the user explicitly requests a schema change.

---

## 8. Conventions

- Imports: `@social0/shared`, `.js` extensions where server tsconfig requires.
- Heavy work: enqueue or CF — never await platform APIs in HTTP handlers.
- New RPC: `services/` + `rpc.ts` + `frontend/src/api/` wrapper.
- New REST from old patterns: `handlers/` + `routes/api/`.
- Publish-now: `trackingId` + `jobProgress.initJob()` before enqueue.
- Prefer `publishLog` on publish paths.

---

## 9. Caveats

- LinkedIn + X still partly inline in `execute-publish.ts` (not fully in `publish-platforms/`).
- Schema duplication server ↔ background-worker.
- CF scheduled posts: cron + scheduled queue (not BullMQ `delay` on the API for the wake-up).
- `PUBLISH_DISPATCH=bullmq` is higher ops cost on the droplet.
