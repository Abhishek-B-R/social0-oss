---
name: verify
description: Bring up Social0's API + SPA locally and drive a change through the real surface (HTTP endpoints or the dashboard UI). Use when verifying backend/ or frontend/ changes at runtime rather than through tests.
---

# Verifying a Social0 change at runtime

Everything below was exercised end to end; the gotchas are the parts that cost time.

## 1. Postgres

No docker daemon in the web sandbox, but PostgreSQL 16 binaries are installed.

```bash
su postgres -c "/usr/lib/postgresql/16/bin/initdb -D /var/lib/postgresql/verify/pgdata -U postgres --auth=trust"
su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D /var/lib/postgresql/verify/pgdata -o '-p 5433' -l /var/lib/postgresql/verify/pg.log start -w"
psql -h 127.0.0.1 -p 5433 -U postgres -c "CREATE DATABASE social0;"
```

**Put the data directory under `/var/lib/postgresql`, not the scratchpad.** The
scratchpad's parent (`/tmp/claude-0`) is reset to `drwx------` between tool
calls, so the `postgres` user loses traverse rights and the server dies
mid-session.

## 2. Migrations

`drizzle-kit migrate` can hang; applying the SQL directly is faster and shows errors:

```bash
node -e "console.log(require('./backend/migrations/meta/_journal.json').entries.map(e=>e.tag+'.sql').join('\n'))"
```

**Order matters and the journal is not the whole story.** `20260711_api_keys.sql`
is *not* in `meta/_journal.json` but creates `api_keys` and
`user_webhook_subscriptions`. Apply it **before** any journaled migration that
references those tables (0048 does). Run each file with
`psql -v ON_ERROR_STOP=1 -f <file>`.

## 3. Backend env

`backend/.env` needs, at minimum: `DATABASE_URL` (+ `DATABASE_URL_UNPOOLED`),
`BETTER_AUTH_SECRET` (32+ chars), `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL`,
`APP_URL`, `CORS_ORIGINS`, `GOOGLE_CLIENT_*` (any string), `RESEND_*` (any
string), `ENCRYPTION_KEY` (64 hex chars), `UPSTASH_REDIS_REST_URL` + `_TOKEN`.

Redis can be absent — ioredis logs `ECONNREFUSED 127.0.0.1:6379` forever but
the API serves fine and rate limiting fails open in development. BullMQ jobs
will not run, so **anything that enqueues never executes**.

Add for verification:
- `ALLOW_DEV_USER_HEADER=true` → `x-user-id: <id>` works on `/api/*` from 127.0.0.1
- `CRON_SECRET=...` → `/api/cron/*` with `Authorization: Bearer <secret>`
- `ALLOW_TEST_SIGNIN=true` + `TEST_USER_ID/EMAIL/NAME` → real signed session cookie

## 4. Start it

```bash
cd backend/server && setsid nohup npm run start > /tmp/api.log 2>&1 < /dev/null &   # :3001, ~25s to boot
cd frontend      && setsid nohup npm run dev   > /tmp/spa.log 2>&1 < /dev/null &    # :3000 (NOT 5173)
```

`setsid nohup` is required — a plain `&` job is reaped when the tool call ends.
To restart, free the port with `fuser -k 3001/tcp`; a `pkill -f "tsx src/index"`
pattern also matches the calling shell and kills the session (exit 144). If you
must pgrep, bracket it: `pgrep -f "[t]sx src/index"`.

## 5. Reaching the publish/finalize path

`POST /api/publish` only enqueues, so with Redis down nothing runs.
`POST /api/cron/publish-platform` executes **in process** and is the way to
drive `executePublish` → `maybeFinalizePostPublish` (failure email, webhooks):

```bash
curl -X POST http://127.0.0.1:3001/api/cron/publish-platform \
  -H 'authorization: Bearer <CRON_SECRET>' -H 'content-type: application/json' \
  -d '{"postId":"...","userId":"...","publicationId":"...","connectedAccountId":"...","platform":"twitter_x"}'
```

The platform must be in `SERVER_SIDE_PUBLISH_PLATFORMS` (`twitter_x`, `tiktok`).
Seed rows one `psql -c` at a time — a multi-statement `-c` is one transaction, so
one error rolls back the earlier inserts. Required non-null columns are not
obvious: `posts` needs `original_content` + `final_content` (no `content`),
`connected_accounts` needs `encrypted_access_token` (no `access_token`).

## 6. Outbound webhook targets

`isSafeOutboundUrl` rejects `localhost`/`127.0.0.1` **by hostname string**, so a
loopback receiver is unreachable by IP. Add a hosts entry and use that name:

```bash
echo "127.0.0.1 hooks.verify.test" >> /etc/hosts   # then use http://hooks.verify.test:9099/hook
```

## 7. Driving the dashboard

Chromium is at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome` (the
unversioned `chromium/` path does not exist). `npm i playwright --prefix /tmp/pw`.

```bash
curl -s -i http://127.0.0.1:3001/api/auth/test-signin | grep -i '^set-cookie'
```

Inject that cookie with `ctx.addCookies([{name, value, domain:"localhost", path:"/"}])`.
Do **not** follow the redirect — it points at the API host and 404s.

Two gates block the dashboard before your page renders:
1. **Onboarding** — `update user_settings set onboarding_completed=true where user_id=...`
   or you land on `/onboarding`.
2. **Legal consent** — a modal overlay swallows every click. Tick the
   checkboxes, then click `Continue`.

`getByRole("button", {name})` did not match the tab controls; iterate
`page.locator("button")` and compare `innerText()`. Avoid a catch-all
`page.route("**/*")` — it stalled page load. External fonts/analytics fail with
`ERR_TUNNEL_CONNECTION_FAILED`; harmless.
