# Social0 Publish Worker (Cloudflare)

Official [C3 queues template](https://developers.cloudflare.com/queues/get-started/) structure — producer + consumer on the edge. The Fastify API enqueues and returns **202 immediately**; this Worker processes posts.

## Quick start (matches `npm create cloudflare@latest`)

```bash
cd cloudflare/publish-worker
npm install
cp .dev.vars.example .dev.vars   # edit secrets for local dev
npm run queues:create            # once per Cloudflare account
npm run check                    # typegen + tests + dry-run bundle
npm run dev                      # http://localhost:8787/health
```

## Deploy (your Cloudflare account)

`wrangler` is not logged in on this machine — run these once in your terminal:

```bash
cd cloudflare/publish-worker
npx wrangler login
npm run deploy:setup    # creates 3 queues + deploys worker
npx wrangler secret put PUBLISH_HMAC_SECRET
npx wrangler secret put API_CALLBACK_URL   # e.g. https://api.social0.app
```

After deploy, note the worker URL (e.g. `https://social0-publish.<subdomain>.workers.dev`).

### Env vars checklist

**Cloudflare Worker** (`wrangler secret put` or Dashboard → Worker → Settings → Variables):

| Variable | Example | Required |
|----------|---------|----------|
| `PUBLISH_HMAC_SECRET` | long random string | Yes — shared with API |
| `API_CALLBACK_URL` | `https://api.social0.app` | Yes — Fastify base URL (no trailing slash) |

**API** (`backend/.env`):

| Variable | Example | Required |
|----------|---------|----------|
| `PUBLISH_DISPATCH` | `cloudflare` | Yes |
| `CF_PUBLISH_WORKER_URL` | `https://social0-publish.<subdomain>.workers.dev` | Yes |
| `CF_PUBLISH_HMAC_SECRET` | same as worker `PUBLISH_HMAC_SECRET` | Yes |

### Smoke test

```bash
# Worker health (no auth)
curl https://social0-publish.<subdomain>.workers.dev/health

# Manual enqueue (or publish a post from the app)
curl -X POST https://social0-publish.<subdomain>.workers.dev/enqueue \
  -H "Authorization: Bearer <PUBLISH_HMAC_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"kind":"orchestrator","job":{"postId":"<uuid>","userId":"<userId>"}}'
```

Wire the API (`backend/.env`):

```env
PUBLISH_DISPATCH=cloudflare
CF_PUBLISH_WORKER_URL=https://social0-publish.<subdomain>.workers.dev
CF_PUBLISH_HMAC_SECRET=<same as worker>
```

## Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | No | Liveness check |
| POST | `/enqueue` | Bearer HMAC | Queue orchestrator or platform job |

## Bugs fixed vs first draft

- **GET `/health`** works without auth (old code required POST everywhere)
- **`wrangler.jsonc`** uses official C3 `queues.producers` / `queues.consumers` shape (not broken TOML tables)
- **Queue routing** uses `batch.queue` + envelope `kind` cross-check
- **JSON validation** on `/enqueue` with clear 400 errors
- **Vitest unit tests** for auth + envelope parsing
- **`npm run check`** runs typegen, tsc, tests, and `wrangler deploy --dry-run`

## Phase 2

Port `execute-publish` into this Worker with Hyperdrive + R2 so platform API calls never hit the DO droplet.
