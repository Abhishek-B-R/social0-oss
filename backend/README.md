# Social0 Backend v2

Fastify API + slim background-worker for long-running crons. Platform publish runs on Cloudflare Workers.

## Layout

```
backend/
├── server/              Fastify API — auth, HTTP, RPC services, enqueue
├── background-worker/   BullMQ — scheduled posts, repost, autoplug, token health only
├── shared/              Queues, job types, CF publish client
└── docker-compose.yml   Optional local Redis (Upstash in prod)
```

## Architecture (production)

| Component | Responsibility |
| --------- | -------------- |
| **server** | User HTTP — fast responses; cron routes return `202` immediately |
| **background-worker** | Heavy cron jobs in a separate process (no user traffic) |
| **CF publish worker** | Platform posting (`PUBLISH_DISPATCH=cloudflare`) |

```
Cron HTTP → server (202) → Redis → background-worker runs job
User HTTP → server only
Publish now → server → CF publish worker
Scheduled posts → cron → background-worker → CF scheduled queue
```

**Production:** something must hit `/api/cron/*` on a schedule. Deploy `cloudflare/cron-worker` (every 5 min) or use system crontab — see `cloudflare/cron-worker/README.md`. Without it, scheduled posts never publish.

## Quick start

```bash
cd backend
cp .env.example .env
bun install
bun run build
bun run dev:server              # :3001
bun run dev:background-worker     # scheduler + token-health consumers
```

## Cron endpoints (Bearer `CRON_SECRET`)

Server enqueues `202`; **background-worker** executes:

| Route | Job |
| ----- | --- |
| `POST /api/cron/publish-scheduled` | Due scheduled posts → CF |
| `POST /api/cron/repost` | Auto-repost / resurface |
| `POST /api/cron/autoplug` | Auto-plug |
| `POST /api/cron/token-health` | Token validation sweep |
| `POST /api/cron/billing-zombie-cleanup` | Cancel stale unpaid Dodo subs |
