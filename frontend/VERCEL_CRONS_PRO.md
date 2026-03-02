# Vercel Pro – cron schedules (when you upgrade)

When on Vercel Pro, you can use more frequent cron runs. In `vercel.json`, replace the daily schedules for resurface and autoplug with:

- **repost (resurface):** `"*/15 * * * *"` (every 15 min)
- **autoplug:** `"*/5 * * * *"` (every 5 min)

Example `vercel.json` crons array:

```json
"crons": [
  { "path": "/api/cron/publish-scheduled", "schedule": "0 0 * * *" },
  { "path": "/api/cron/repost", "schedule": "*/15 * * * *" },
  { "path": "/api/cron/autoplug", "schedule": "*/5 * * * *" }
]
```
