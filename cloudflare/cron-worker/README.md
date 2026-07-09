# Social0 Cron Worker (Cloudflare)

Triggers scheduled posts and daily maintenance by calling the Fastify API every 5 minutes.

## Required for production scheduling

Without this worker (or an equivalent crontab), `background-worker` never receives `cron.publish-scheduled` jobs and scheduled posts stay stuck.

## Setup

```bash
cd cloudflare/cron-worker
npm install
npx wrangler secret put CRON_SECRET      # same as backend CRON_SECRET
npx wrangler secret put API_BASE_URL       # https://api.social0.app (API host, not SPA)
npm run deploy
```

## Schedules (UTC)

| Cron | Jobs |
|------|------|
| `*/5 * * * *` | `publish-scheduled` |
| `0 6 * * *` | `repost`, `autoplug`, `token-health`, `billing-zombie-cleanup` |

## Manual test

```bash
curl -X POST "https://api.social0.app/api/cron/publish-scheduled" \
  -H "Authorization: Bearer $CRON_SECRET"
```

Expect `202` with queued job id. Ensure `social0-worker` PM2 process is running.
