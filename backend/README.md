# Social0 Backend v2

Queue-based API on DigitalOcean + Neon + Cloudflare R2. The Fastify server is the only backend process: HTTP, crons, and enqueue to Cloudflare for publishing.

## Layout

```
backend/
├── server/              Fastify API — auth, crons, publish fan-out to CF
├── shared/              Queues, job types, DTOs, CF publish client
└── docker-compose.yml   Optional local Redis (SSE progress; Upstash in prod)
```

## Architecture (production)

| Component | Responsibility |
| --------- | -------------- |
| **server** (`dev:server`) | HTTP API, inline crons, presigned media, webhooks |
| **Cloudflare publish worker** | Post to TikTok / X / IG / … (`PUBLISH_DISPATCH=cloudflare`) |

```
Client → server → CF publish worker → platform APIs
              ↘ inline crons (scheduled posts, repost, autoplug, token health)
```

Publishing never blocks the HTTP request.

- **Publish now** → 202 + SSE progress stream (DB poll when using CF)
- **Schedule later** → save `status: scheduled` in DB → `POST /api/cron/publish-scheduled` fans out to CF

## Quick start

```bash
cd backend
cp .env.example .env
bun install
bun run build
bun run dev:server   # :3001
```

## Cron endpoints (Bearer `CRON_SECRET`)

| Route | Purpose |
| ----- | ------- |
| `POST /api/cron/publish-scheduled` | Due scheduled posts → CF scheduled queue |
| `POST /api/cron/repost` | Auto-repost / resurface |
| `POST /api/cron/autoplug` | Auto-plug comments |
| `POST /api/cron/token-health` | Proactive token validation sweep |
| `POST /api/cron/billing-zombie-cleanup` | Stale Dodo subscriptions |

## Publish (CF)

Set in `.env`:

```env
PUBLISH_DISPATCH=cloudflare
CF_PUBLISH_WORKER_URL=https://social0-publish.<account>.workers.dev
CF_PUBLISH_HMAC_SECRET=...
```

Deploy the worker from `cloudflare/publish-worker/` (bundles `server/src/publish/`).
