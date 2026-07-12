# Social0 MCP Server

Official [Model Context Protocol](https://modelcontextprotocol.io) server for [Social0](https://social0.app). Manage social media from AI assistants — Claude, Cursor, VS Code, ChatGPT, Windsurf, and more.

**Repository:** https://github.com/Abhishek-B-R/social0-mcp  
**API keys:** https://social0.app/dashboard/api-keys  
**Docs:** https://docs.social0.app/docs/integrations/mcp  
**REST API:** https://api.social0.app/docs  

```
AI assistant (Claude / Cursor / …)
            │
            ▼
      Social0 MCP Server   ← this repo
            │
     (tool calls → REST)
            │
            ▼
     https://api.social0.app/v1
```

This server is intentionally **thin**. No OAuth, no database, no publish retries. It authenticates with your API key, exposes tools, and calls the public REST API.

> **Agents:** start with [AGENTS.md](./AGENTS.md) — tool inputs, platforms, publish flow, and failure modes in one place.

## Requirements

- Node.js **20+**
- A Social0 account with at least one [connected platform](https://social0.app/dashboard/connections)
- An API key (`sk_live_…`) from [Dashboard → Developer](https://social0.app/dashboard/api-keys)

## Quick start

```bash
git clone https://github.com/Abhishek-B-R/social0-mcp.git
cd social0-mcp
cp .env.example .env
# Set SOCIAL0_API_KEY=sk_live_...

npm install
npm run build
npm start
```

Then wire the built server into your AI host (see below). The process speaks **stdio MCP** — it must be launched by the host, not left as a long-running public HTTP server.

## Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SOCIAL0_API_KEY` | Yes | — | `sk_live_…` (legacy `s0_live_…` accepted) |
| `SOCIAL0_API_URL` | No | `https://api.social0.app/v1` | API base URL |
| `SOCIAL0_MCP_VERBOSE` | No | `false` | Log REST calls to **stderr** |
| `SOCIAL0_REQUEST_TIMEOUT_MS` | No | `30000` | Request timeout |
| `SOCIAL0_MAX_RETRIES` | No | `3` | Retries on HTTP 429 |

## Connect your AI assistant

| Host | Guide |
|------|-------|
| Cursor | [examples/cursor.md](examples/cursor.md) |
| Claude Desktop | [examples/claude-desktop.md](examples/claude-desktop.md) |
| VS Code | [examples/vscode.md](examples/vscode.md) |
| ChatGPT | [examples/chatgpt.md](examples/chatgpt.md) |

### Cursor (minimal)

```json
{
  "mcpServers": {
    "social0": {
      "command": "node",
      "args": ["/absolute/path/to/social0-mcp/dist/index.js"],
      "env": {
        "SOCIAL0_API_KEY": "sk_live_your_key_here"
      }
    }
  }
}
```

Use an **absolute** path to `dist/index.js`. Restart / reload MCP after saving.

## Tools (13)

| Tool | What it does |
|------|----------------|
| `list_accounts` | List connected social accounts |
| `create_post` | Create a draft |
| `update_post` | Update a draft or scheduled post |
| `delete_post` | Delete a post |
| `list_posts` | List posts (status / platform / search filters) |
| `get_post` | Full post details |
| `publish_post` | Publish an existing draft → `tracking_id` |
| `schedule_post` | Schedule an existing post |
| `upload_media` | Upload a local image/video → media UUID |
| `publish_now` | Create + publish in one step |
| `schedule_content` | Create + schedule in one step |
| `get_publish_status` | Poll publish job by `tracking_id` |
| `suggest_best_platforms` | Recommend platforms for a caption |

Full parameter reference: [AGENTS.md](./AGENTS.md).

## Common workflows

**Draft → publish**

1. `list_accounts` (know targets / UUIDs)
2. `create_post` with `content` + `platforms`
3. `publish_post` → save `tracking_id`
4. `get_publish_status` until `completed` / `failed` / `partial`

**One-shot publish with media**

1. `upload_media` with absolute `file_path`
2. `publish_now` with `content`, `platforms`, `media: [id]`
3. Poll `get_publish_status`

**Schedule**

- Existing draft: `schedule_post` with ISO-8601 `scheduled_at` (UTC preferred)
- New content: `schedule_content`

## Platforms

Pass **platform names** or **connected-account UUIDs** in `platforms[]`:

| Name | Aliases |
|------|---------|
| `linkedin` | `li` |
| `twitter_x` | `x`, `twitter` |
| `instagram` | `ig` |
| `facebook` | `fb` |
| `youtube` | `yt` |
| `tiktok` | — |
| `threads` | — |
| `bluesky` | `bsky` |
| `pinterest` | `pin` |

If multiple accounts exist on one platform, pass the **account UUID** from `list_accounts`.

Connect platforms in the [Social0 dashboard](https://social0.app/dashboard/connections) — MCP cannot OAuth for you.

## Example prompts

```
Show my connected Social0 accounts.
```

```
Create a LinkedIn post about AI trends in 2026.
```

```
Schedule tomorrow's product launch at 9 AM UTC on LinkedIn and X.
```

```
Upload /absolute/path/to/logo.png and publish it to Twitter and LinkedIn.
```

```
Here's my post: "Just shipped v2!" — which platforms should I use?
```

```
Check publish status for tracking id <uuid>.
```

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `SOCIAL0_API_KEY is required` | Set the key in the host `env` block (not only `.env` if the host doesn't load it) |
| Key format error | Key must start with `sk_live_` (or legacy `s0_live_`) |
| `401` | Create a new key; old one may be revoked |
| No connected `linkedin` account | Connect it in the dashboard first |
| Multiple `twitter_x` accounts | Pass the account UUID, not `twitter_x` |
| Media upload fails | Use an absolute path the MCP process can read; check type/size limits |
| Host shows no tools | `npm run build`, absolute path to `dist/index.js`, restart host |
| Publish stuck `processing` | Poll `get_publish_status`; video can take minutes |

Debug:

```bash
SOCIAL0_MCP_VERBOSE=true SOCIAL0_API_KEY=sk_live_xxx node dist/index.js
npx @modelcontextprotocol/inspector node dist/index.js
```

Log only to **stderr** — stdout is reserved for MCP.

## API surface

| Capability | Endpoint |
|------------|----------|
| Accounts | `GET /v1/accounts` |
| Posts | `GET/POST/PATCH/DELETE /v1/posts` |
| Publish | `POST /v1/posts/:id/publish`, `POST /v1/posts/publish` |
| Schedule | `POST /v1/posts/:id/schedule`, `POST /v1/posts/schedule` |
| Media | `POST /v1/media/presign` → PUT → `POST /v1/media/confirm` |
| Jobs | `GET /v1/jobs/:trackingId` |

## Development

```bash
npm run dev        # tsx watch
npm run build
npm run typecheck
npm start          # node dist/index.js
```

```
src/
├── index.ts           # stdio entry
├── config.ts
├── api/               # REST client only
├── tools/             # MCP definitions + handlers
├── schemas/           # Zod
├── types/
└── utils/
```

## License

MIT — see [LICENSE](LICENSE).
