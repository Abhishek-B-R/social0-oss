# Social0 Publish Worker (Cloudflare)

Per-platform publish at the edge - **no API callbacks**. The Fastify API validates, writes DB records, fans out one queue message per platform, and returns **202**. Workers read Postgres (Hyperdrive) + R2 and publish directly.

## Architecture

```
Frontend → Fastify API → DB (publish_jobs + publications)
                ↓
     one message per platform
                ↓
   ┌────────────┴────────────┐
   ▼                         ▼
publish-now            publish-scheduled
   │                         │
   └────────────┬────────────┘
                ▼
        CF Worker (per platform)
                ↓
         Postgres + R2 → platform APIs
                ↓
         publish_job_events → SSE (DB poll)
```

## Setup

1. Create a [Hyperdrive](https://developers.cloudflare.com/hyperdrive/) config pointing at your Postgres and set its id in `wrangler.jsonc`.
2. Create queues and deploy:

```bash
cd cloudflare/publish-worker
npm install
cp .dev.vars.example .dev.vars   # edit secrets
npm run deploy:setup
```

3. Set Worker secrets (OAuth keys from `backend/.env`):

```bash
npx wrangler secret put PUBLISH_HMAC_SECRET
npx wrangler secret put ENCRYPTION_KEY
npx wrangler secret put APP_URL
# Platform OAuth + R2 secrets as needed
```

4. Wire the API (`backend/.env`):

```env
PUBLISH_DISPATCH=cloudflare
CF_PUBLISH_WORKER_URL=https://social0-publish.<subdomain>.workers.dev
CF_PUBLISH_HMAC_SECRET=<same as worker>
```

## Queues

| Queue                       | Priority | Use                              |
| --------------------------- | -------- | -------------------------------- |
| `social0-publish-now`       | HIGH     | Publish Now - user waiting + SSE |
| `social0-publish-scheduled` | NORMAL   | Cron / scheduled posts           |
| `social0-publish-dlq`       | -        | Exhausted retries                |

## API endpoints (Worker)

| Method | Path       | Auth   | Description                                                       |
| ------ | ---------- | ------ | ----------------------------------------------------------------- |
| GET    | `/health`  | No     | Liveness                                                          |
| POST   | `/enqueue` | Bearer | Body: `{ priority: "now"\|"scheduled", job: PublishPlatformJob }` |

## SSE (Publish Now)

BFF and `POST /api/publish` return `trackingId` + `streamUrl`. When `PUBLISH_DISPATCH=cloudflare`, SSE polls `publish_job_events` in Postgres every 1.5s (no Redis required on the Worker path).

## Migrate from old queues

If you deployed the previous orchestrator/platform queues, create the new ones:

```bash
npm run queues:create
npm run deploy
```

Old queues (`social0-publish-orchestrator`, `social0-publish-platform`) can be deleted from the Cloudflare dashboard when idle.
