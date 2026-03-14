# Vercel Pro – cron schedules

This project uses Vercel Cron Jobs (Pro). Schedules are defined in `vercel.json`.

## Crons

| Path | Schedule | Description |
|------|----------|-------------|
| `/api/cron/publish-scheduled` | Every 5 min (`*/5 * * * *`) | Publishes due scheduled posts (manual + queue). Cleans stuck "publishing" posts. |
| `/api/cron/repost` | Every 15 min (`*/15 * * * *`) | Resurface: processes resurface events (repost/plug on X at configured intervals). |
| `/api/cron/autoplug` | Every 5 min (`*/5 * * * *`) | Auto-plug: watches for new replies and posts plug comments. |
| `/api/cron/token-health` | Daily 06:00 UTC (`0 6 * * *`) | Token health check for connected accounts (batch, 24h window). |
| `/api/cron/twitter-premium` | Daily 05:00 UTC (`0 5 * * *`) | Refreshes X Premium status for all connected Twitter accounts. |

## Auth

All cron routes are protected by `CRON_SECRET`. Set it in Vercel (Project → Settings → Environment Variables) and pass it as the `Authorization: Bearer <CRON_SECRET>` header (Vercel does this automatically for cron invocations).

## Notes

- **publish-scheduled**: Running every 5 minutes keeps scheduled and queued posts close to their target time.
- **repost** / **autoplug**: More frequent runs (15 min / 5 min) improve responsiveness; on Hobby these were daily.
- **token-health** / **twitter-premium**: Once per day is enough; times are in UTC.
