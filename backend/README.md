# Social0 Backend v2

Queue-based backend for DigitalOcean + Neon + Cloudflare R2. Mirrors the Next.js `app/api` surface but keeps the API thin: validate, enqueue, return `202` in under ~100ms.

## Layout

```
backend/
├── server/     Fastify API — all endpoints, auth, validation
├── worker/     BullMQ consumers + platform publish/email/token logic
├── shared/     Queues, job types, DTOs, route manifest
└── docker-compose.yml   Optional local Redis (unused; Upstash is the default)
```

## Flow

```
Client → server (Fastify) → Redis/BullMQ → worker (BullMQ + platform APIs)
                                              ↓ on failure
                                         email queue
```

Publishing never blocks the HTTP request.

- **Publish now** → 202 + SSE progress stream
- **Schedule later** → BullMQ `delay`, 200 `{ status: "scheduled" }` (no SSE)

## Quick start

```bash
cd backend
cp .env.example .env
# Add UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN from https://console.upstash.com
bun install
bun run build
bun run dev:server   # :3001
bun run dev:worker   # BullMQ workers
```

## Publish flows

### Publish now (live progress via SSE)

```bash
# 1. Start publish
curl -X POST http://localhost:3001/api/publish \
  -H 'Content-Type: application/json' \
  -H 'x-user-id: user_test' \
  -d '{"postId":"post_123","connectedAccountIds":["acc_1"]}'
# → 202 { trackingId, streamUrl, jobId, status: "queued" }

# 2. Stream progress
curl -N -H 'x-user-id: user_test' \
  http://localhost:3001/api/jobs/<trackingId>/stream
```

### Schedule later (no SSE)

```bash
curl -X POST http://localhost:3001/api/publish \
  -H 'Content-Type: application/json' \
  -H 'x-user-id: user_test' \
  -d '{"postId":"post_123","scheduledAt":"2026-06-15T10:00:00.000Z","mode":"schedule"}'
# → 200 { status: "scheduled", scheduledAt, jobId, message }
```

BullMQ wakes the job at `scheduledAt` — no cron DB scan.

## Endpoints

- **v1** — legacy REST (`/v1/posts`, `/v1/media`, …)
- **api** — mirrors `frontend/app/api/**` (see `GET /api/routes`)
- Async routes return `{ jobId, status: "queued", queue }` with HTTP 202

## Wiring production logic

1. Port Drizzle schema + queries from `frontend/db`
2. Port `publish-platform.ts` into `worker/src/publish/platforms/*`
3. Wire Better Auth session validation in `server/src/middleware/auth.ts`
4. Deploy on a DO droplet: nginx → server:3001, worker as systemd/pm2 process

## Scale

- **server**: horizontal behind nginx (stateless)
- **worker**: increase `WORKER_*_CONCURRENCY` or run more worker processes
- **platform-publish** queue: isolated rate limits per platform (TikTok vs X)
