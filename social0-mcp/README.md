# Social0 MCP Server

Official [Model Context Protocol](https://modelcontextprotocol.io) server for [Social0](https://social0.app). Manage social media posts from AI assistants — Claude, Cursor, VS Code, ChatGPT, Windsurf, and more.

```
Claude / ChatGPT / Cursor
            │
            ▼
      Social0 MCP Server   ← you are here
            │
     (translate tool calls)
            │
            ▼
     Social0 Public REST API
            │
            ▼
     Existing Backend
```

The MCP server is intentionally **thin**. It does not contain business logic, OAuth flows, database access, or publishing retries. It authenticates with your API key, exposes tools, translates MCP calls to REST requests, and returns structured results.

## Features

- **13 MCP tools** — accounts, posts, publish, schedule, media upload, status tracking
- **`suggest_best_platforms`** — AI-native platform recommendations based on your content
- **Structured errors** — never throws raw exceptions to the host
- **Production-ready** — strict TypeScript, Zod validation, retry on 429, request timeouts
- **Zero backend imports** — talks only to the public REST API

## Quick start

```bash
cd social0-mcp
cp .env.example .env
# Edit .env and set SOCIAL0_API_KEY

npm install
npm run build
npm start
```

Create an API key at [social0.app/dashboard/api-keys](https://social0.app/dashboard/api-keys).

## Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SOCIAL0_API_KEY` | Yes | — | API key (`sk_live_...`, legacy `s0_live_...`) |
| `SOCIAL0_API_URL` | No | `https://api.social0.app/v1` | API base URL |
| `SOCIAL0_MCP_VERBOSE` | No | `false` | Log requests to stderr |
| `SOCIAL0_REQUEST_TIMEOUT_MS` | No | `30000` | Request timeout |
| `SOCIAL0_MAX_RETRIES` | No | `3` | Retries on HTTP 429 |

## Connect your AI assistant

| Host | Guide |
|------|-------|
| Claude Desktop | [examples/claude-desktop.md](examples/claude-desktop.md) |
| Cursor | [examples/cursor.md](examples/cursor.md) |
| VS Code | [examples/vscode.md](examples/vscode.md) |
| ChatGPT | [examples/chatgpt.md](examples/chatgpt.md) |

### Cursor example

```json
{
  "mcpServers": {
    "social0": {
      "command": "node",
      "args": ["/path/to/social0-mcp/dist/index.js"],
      "env": {
        "SOCIAL0_API_KEY": "s0_live_your_key_here"
      }
    }
  }
}
```

## Tools

| Tool | Description |
|------|-------------|
| `list_accounts` | Show connected social accounts |
| `create_post` | Create a draft post |
| `update_post` | Update a draft or scheduled post |
| `delete_post` | Delete a post |
| `list_posts` | List posts with filters |
| `get_post` | Get full post details |
| `publish_post` | Publish an existing draft immediately |
| `schedule_post` | Schedule an existing post |
| `upload_media` | Upload a local image/video |
| `publish_now` | Create + publish in one step |
| `schedule_content` | Create + schedule in one step |
| `get_publish_status` | Check publish progress by tracking ID |
| `suggest_best_platforms` | Recommend platforms for your content |

## Example prompts

Try these in your AI assistant after connecting:

```
Create a LinkedIn post about AI trends in 2026.
```

```
Schedule tomorrow's product launch announcement at 9 AM on LinkedIn and X.
```

```
Publish my latest draft.
```

```
Show all scheduled posts.
```

```
Delete yesterday's draft.
```

```
Upload logo.png and create a post with it for Twitter and LinkedIn.
```

```
Here's my post: "Just shipped v2!" — which platforms should I publish it to?
```

## Architecture

```
social0-mcp/
├── src/
│   ├── index.ts          # Entry point (stdio)
│   ├── server.ts         # Server factory
│   ├── config.ts         # Environment config
│   ├── api/              # REST API client (no business logic)
│   │   ├── client.ts     # HTTP client with auth, retry, timeout
│   │   ├── accounts.ts
│   │   ├── posts.ts
│   │   ├── media.ts
│   │   └── publish.ts
│   ├── tools/            # MCP tool handlers (thin wrappers)
│   ├── schemas/          # Zod input validation
│   ├── types/            # TypeScript types
│   └── utils/            # Helpers
├── examples/             # Per-host setup guides
└── .env.example
```

**Rule:** API logic never lives in tools. Tools validate input, call the API layer, and format output.

## API endpoints used

| Capability | Endpoint | Status |
|------------|----------|--------|
| List accounts | `GET /v1/accounts` | ✅ Live |
| Post CRUD | `GET/POST/PATCH/DELETE /v1/posts` | ✅ Live |
| Upload media | `POST /v1/media/presign` → PUT → `POST /v1/media/confirm` | ✅ Live |
| Publish / schedule | `POST /v1/posts/:id/publish`, `/schedule`, `/posts/publish`, `/posts/schedule` | ✅ Live |
| Publish status | `GET /v1/jobs/:trackingId` | ✅ Live |

API keys use the `sk_live_` prefix (legacy `s0_live_` still accepted). Interactive API docs: https://api.social0.app/docs

## Development

```bash
npm run dev      # Hot reload with tsx
npm run build    # Compile TypeScript
npm run typecheck
npm start        # Run compiled server
```

### Debug with MCP Inspector

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

Set `SOCIAL0_MCP_VERBOSE=true` to log every REST call, status code, and latency to stderr.

## Copy to standalone repo

This folder is designed to become its own GitHub repository (`social0-mcp`):

```bash
cp -r social0-mcp/ ../social0-mcp/
cd ../social0-mcp
git init
git add .
git commit -m "Initial Social0 MCP server"
```

## License

MIT — see [LICENSE](LICENSE).
