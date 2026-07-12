# Social0 Docs Update Brief — MCP Server Launch

> **Audience:** `social0-docs` agent (or any docs maintainer)  
> **Purpose:** Implement all user-facing documentation for the new **Social0 MCP Server** — the official Model Context Protocol integration that lets AI assistants manage Social0 via natural language.  
> **Source of truth:** `social0-mcp/` package in the main Social0 monorepo (or standalone `social0-mcp` GitHub repo once published).  
> **Docs site:** `https://docs.social0.app`  
> **Last reviewed:** 2026-07-12 (updated after multi-platform publish reliability fixes — see §14)

> **IMPORTANT — API is live:** As of PR #39 (`cursor/public-rest-api-da54`), the full `/v1` REST API is production-ready. The MCP server now calls **only `/v1/*` endpoints**. Use `sk_live_` API keys (legacy `s0_live_` accepted). Cross-reference the main API docs brief at `docs-updation.md` in the app repo and live OpenAPI at `https://api.social0.app/openapi.json`.

> **IMPORTANT — Multi-platform publish (2026-07-12):** Reliability fixes for V1/MCP publish are documented in **§14**. Read that section before writing publish, job status, or troubleshooting pages.

---

## 1. Executive summary (what changed)

Social0 now has an **official MCP server** — a thin translation layer between AI assistants (Claude, Cursor, VS Code, ChatGPT, Windsurf) and the Social0 public REST API.

```
AI Assistant (Claude / Cursor / ChatGPT)
              │
              ▼
       Social0 MCP Server        ← NEW
              │
     (translate tool calls)
              │
              ▼
    Social0 Public REST API
              │
              ▼
       Existing Backend
```

**What users can do via MCP (when fully connected):**

- List connected social accounts
- Create, update, delete, and list posts
- Upload images/videos
- Publish immediately or schedule for later
- Track publish progress per platform
- Get AI-native platform recommendations (`suggest_best_platforms`)

**What the MCP server is NOT:**

- Not a replacement for the dashboard
- Not where OAuth / account connection happens (users still connect platforms in the app)
- Not a place for business logic — it only translates MCP tool calls → REST API calls

**Authentication:** Users need a Social0 **API key** (`sk_live_...`) created at [social0.app/dashboard/api-keys](https://social0.app/dashboard/api-keys).

**Repository:** `https://github.com/Abhishek-B-R/social0` → `social0-mcp/` (will become standalone `social0-mcp` repo).

---

## 2. Documentation goals

After this update, a user or AI agent reading `docs.social0.app` should be able to:

1. Understand what MCP is and why they'd use it with Social0
2. Create an API key and connect their AI assistant in under 5 minutes
3. Run example prompts successfully (or understand current API limitations)
4. Troubleshoot auth, connection, and publish errors without support tickets
5. Find the REST API reference that the MCP server calls under the hood

**Tone:** Clear, practical, developer-friendly. Short sentences. Copy-pasteable config blocks. No marketing fluff on technical pages.

**Terminology (use consistently):**

| Term | Meaning |
|------|---------|
| MCP | Model Context Protocol — standard for AI tools |
| MCP server | The `social0-mcp` Node process |
| MCP host / client | Claude Desktop, Cursor, VS Code, etc. |
| Tool | One MCP capability (e.g. `create_post`) |
| API key | `sk_live_...` bearer token for REST API (legacy `s0_live_...` accepted) |
| Tracking ID | UUID returned when publishing; used to poll status |

---

> **REST API docs URL:** Shipped docs use **`/docs/api`** (not `/docs/integrations/api`). See `frontend/src/lib/docs-url.ts` — e.g. `DOCS_API_URL`, `DOCS_API_QUICKSTART_URL`, `DOCS_API_WEBHOOKS_URL`. MCP stays under **`/docs/integrations/mcp`**.

### 3.1 New top-level section: **Integrations**

Add a new docs section (sidebar group) called **Integrations** (or **Developers → Integrations** if you already have a Developers section).

Suggested structure:

```
Integrations
├── Overview                    → /docs/integrations
├── MCP Server (AI assistants)  → /docs/integrations/mcp          ← PRIMARY NEW PAGE
│   ├── Quick start             → /docs/integrations/mcp/quickstart
│   ├── Tools reference         → /docs/integrations/mcp/tools
│   ├── Claude Desktop          → /docs/integrations/mcp/claude-desktop
│   ├── Cursor                  → /docs/integrations/mcp/cursor
│   ├── VS Code                 → /docs/integrations/mcp/vscode
│   ├── ChatGPT                 → /docs/integrations/mcp/chatgpt
│   └── Troubleshooting         → /docs/integrations/mcp/troubleshooting
└── REST API                    → /docs/api          ← live (see DOCS_API_* in app)
    ├── Quickstart              → /docs/api/quickstart
    ├── Authentication          → /docs/api/authentication
    ├── Webhooks                → /docs/api/webhooks
    ├── OpenAPI                 → /docs/api/openapi
    └── Reference               → /docs/api/reference/*
```

### 3.2 Pages to **create** (priority order)

| Priority | Page | URL | Why |
|----------|------|-----|-----|
| P0 | MCP overview + quick start | `/docs/integrations/mcp` | Main entry point |
| P0 | API keys (full guide) | `/docs/dashboard/api-keys` | **Update existing stub** — required before MCP works |
| P0 | MCP tools reference | `/docs/integrations/mcp/tools` | Every tool documented |
| P1 | Per-host setup (4 pages) | `/docs/integrations/mcp/{host}` | Copy from `social0-mcp/examples/` |
| P1 | MCP troubleshooting | `/docs/integrations/mcp/troubleshooting` | Reduce support load |
| P1 | REST API authentication | `/docs/api/authentication` | Bearer token docs |
| P2 | REST API endpoint reference | `/docs/api/reference/*` | For developers not using MCP |
| P2 | Integrations overview | `/docs/integrations` | Hub page linking MCP + API |

### 3.3 Pages to **update** (existing)

| Page | URL (existing in app) | Change |
|------|----------------------|--------|
| API keys | `/docs/dashboard/api-keys` | Ensure full guide + MCP link (dashboard UI is live at `/dashboard/api-keys`) |
| Dashboard overview | `/docs/dashboard` | Add "Manage with AI" callout → MCP docs |
| Connections | `/docs/dashboard/connections` | Note: connect accounts here before using MCP |
| Composer / Posts | `/docs/dashboard/composer`, `/docs/dashboard/posts` | Cross-link: "Prefer natural language? Try MCP" |
| Onboarding | `/docs/onboarding` | Optional step: "Connect an AI assistant" |
| Homepage / docs index | `/docs` or `/` | Feature card: "AI assistants via MCP" |
| llms.txt / AI crawlers | if exists | Add MCP + API summary |

### 3.4 Navigation / sidebar

Add to main docs sidebar:

```text
Integrations
  MCP Server (AI assistants)
  REST API
```

Under **Dashboard**, ensure **API keys** is visible (not buried).

### 3.5 In-app links to update (separate repo — note for product team)

These constants exist in `frontend/src/lib/docs-url.ts` — add after docs ship:

```typescript
export const DOCS_API_URL = `${DOCS_BASE_URL}/docs/api`;
export const DOCS_MCP_URL = `${DOCS_BASE_URL}/docs/integrations/mcp`;
```

`DOCS_MCP_URL`, `DOCS_API_*`, and related constants are wired in `frontend/src/lib/docs-url.ts`. `ApiKeysPage` links to REST API, quickstart, and webhooks docs.

---

## 4. API status (all live as of PR #39)

> **Update:** The "rolling out" caveat below is **obsolete**. All `/v1` endpoints are live. Remove rolling-out callouts from docs when implementing.

| Capability | REST endpoint | MCP tool(s) | Status |
|------------|---------------|-------------|--------|
| List connected accounts | `GET /v1/accounts` | `list_accounts` | ✅ Live |
| Upload media | `POST /v1/media/presign` → PUT → `POST /v1/media/confirm` | `upload_media` | ✅ Live |
| Publish now | `POST /v1/posts/:id/publish` or `POST /v1/posts/publish` | `publish_post`, `publish_now` | ✅ Live |
| Schedule post | `POST /v1/posts/:id/schedule` or `POST /v1/posts/schedule` | `schedule_post`, `schedule_content` | ✅ Live |
| Publish status | `GET /v1/jobs/:trackingId` | `get_publish_status` | ✅ Live |
| Post CRUD | `GET/POST/PATCH/DELETE /v1/posts` | `create_post`, `update_post`, `delete_post`, `list_posts`, `get_post` | ✅ Live |
| Platform suggestions | Client-side heuristic in MCP | `suggest_best_platforms` | ✅ Works offline |

**API key format:** `sk_live_...` (legacy `s0_live_...` still accepted)

**Interactive API reference:** https://api.social0.app/docs

---

## 4b. Legacy honesty block (REMOVE from docs — kept for agent context only)

---

## 5. Page-by-page content spec

Below is **copy-ready content** for the docs agent. Adapt to your docs framework (MDX, Docusaurus, Mintlify, etc.) but preserve structure, code blocks, and tables.

---

### 5.1 `/docs/integrations/mcp` — MCP Server overview

**Title:** Manage Social0 from AI assistants (MCP)  
**Description meta:** Connect Claude, Cursor, or ChatGPT to Social0 with the official MCP server. Create posts, publish, and schedule using natural language.

#### Sections to include

**What is the Social0 MCP server?**  
One paragraph: official MCP server; thin layer; no business logic in MCP; uses your API key; works with any MCP-compatible host.

**Architecture diagram** (mermaid):

```mermaid
flowchart TB
  A[AI Assistant] --> B[Social0 MCP Server]
  B --> C[Social0 REST API]
  C --> D[Social0 Backend]
```

**What you can do**

- Bullet list of 8–10 user-facing outcomes (draft posts, publish, schedule, upload media, check status, list accounts, platform suggestions)

**What you need before starting**

1. Social0 account with at least one [connected platform](/docs/dashboard/connections)
2. [API key](/docs/dashboard/api-keys) (`sk_live_...`)
3. Node.js 20+ installed
4. An MCP host (Claude Desktop, Cursor, etc.)

**Quick start (condensed)**

```bash
git clone https://github.com/Abhishek-B-R/social0-mcp.git   # or copy social0-mcp/ folder
cd social0-mcp
cp .env.example .env
# Set SOCIAL0_API_KEY in .env
npm install && npm run build
```

Then link to host-specific pages.

**Supported AI hosts**

| Host | Guide |
|------|-------|
| Claude Desktop | [Setup](/docs/integrations/mcp/claude-desktop) |
| Cursor | [Setup](/docs/integrations/mcp/cursor) |
| VS Code | [Setup](/docs/integrations/mcp/vscode) |
| ChatGPT | [Setup](/docs/integrations/mcp/chatgpt) |
| Windsurf | Same as Cursor (stdio MCP config) |

**Environment variables**

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SOCIAL0_API_KEY` | Yes | — | API key from dashboard |
| `SOCIAL0_API_URL` | No | `https://api.social0.app/v1` | API base URL |
| `SOCIAL0_MCP_VERBOSE` | No | `false` | Log REST calls to stderr |
| `SOCIAL0_REQUEST_TIMEOUT_MS` | No | `30000` | Request timeout (ms) |
| `SOCIAL0_MAX_RETRIES` | No | `3` | Retries on HTTP 429 |

**Example prompts** (copy-paste for users)

```text
Show my connected Social0 accounts.
Create a LinkedIn post about AI trends in 2026.
Schedule tomorrow's product launch at 9 AM on LinkedIn and X.
Publish my latest draft.
Show all scheduled posts.
Upload ./assets/logo.png and post it to Twitter and LinkedIn.
Which platforms should I publish this to: "Just shipped v2!"
```

**Links**

- [Tools reference](/docs/integrations/mcp/tools)
- [API keys](/docs/dashboard/api-keys)
- [Troubleshooting](/docs/integrations/mcp/troubleshooting)
- GitHub: `social0-mcp` repository

**Screenshot placeholders**

- `[SCREENSHOT: Cursor MCP settings with social0 configured]`
- `[SCREENSHOT: Claude Desktop using list_accounts tool]`
- `[SCREENSHOT: Example publish flow with tracking ID]`

---

### 5.2 `/docs/dashboard/api-keys` — API keys (UPDATE EXISTING)

**Current state in product:** Dashboard **Developer** page at `/dashboard/api-keys` supports create/list/revoke API keys and webhooks. Backend: `POST/GET/DELETE` on dashboard API-key routes (session auth) and Bearer auth on `/v1/*`.

**This page must be rewritten completely.**

#### Sections

**What are API keys?**  
Programmatic access to Social0 without browser session cookies. Used by MCP server, scripts, and integrations.

**Key format**

```text
sk_live_<secret>
```

(Legacy keys may use `s0_live_<secret>`.)

Shown **once** at creation. Store securely. Never commit to git.

**Create an API key**

1. Go to [social0.app/dashboard/api-keys](https://social0.app/dashboard/api-keys)
2. Click **Create API key**
3. Name it (e.g. "Claude Desktop", "Cursor MCP")
4. Copy the full key — it won't be shown again

**Use in requests**

```http
Authorization: Bearer sk_live_your_key_here
```

**Use with MCP**

```json
{
  "mcpServers": {
    "social0": {
      "command": "node",
      "args": ["/path/to/social0-mcp/dist/index.js"],
      "env": {
        "SOCIAL0_API_KEY": "sk_live_your_key_here"
      }
    }
  }
}
```

**Revoke a key**  
Dashboard → API keys → Delete. Revoked keys fail immediately with `401 Unauthorized`.

**Security best practices**

- One key per integration (Claude vs Cursor vs CI)
- Rotate if leaked
- Don't share keys in chat logs
- MCP runs locally — key stays in your machine's env

**What API keys can access today**

| Action | Supported |
|--------|-----------|
| List connected accounts | ✅ |
| Upload media | ✅ |
| Publish / schedule existing post | ✅ |
| Check publish job status | ✅ |
| Create / list / edit posts via REST | ✅ |

**Link:** [Set up MCP](/docs/integrations/mcp)

---

### 5.3 `/docs/integrations/mcp/tools` — Tools reference

Document all **13 tools**. For each tool use this template:

```markdown
### `tool_name`

**Description:** (one sentence, natural language — mirrors MCP tool description)

**When to use:** (user intent examples)

**Parameters**

| Name | Type | Required | Description |
|------|------|----------|-------------|

**Returns:** (shape summary)

**Example user prompt:** "..."

**Example flow:** (numbered steps if multi-step)

**REST API called:** `METHOD /path`

**Errors:** (common failures + fixes)
```

#### Full tool table (agent: expand each row into a section)

| Tool | User intent | Key inputs | REST backing |
|------|-------------|------------|--------------|
| `list_accounts` | "Show my connected accounts" | — | `GET /v1/accounts` |
| `create_post` | "Draft a LinkedIn post about X" | `content`, `platforms[]`, `media[]?` | `POST /v1/posts` |
| `update_post` | "Edit my draft" | `post_id`, optional fields | `PATCH /v1/posts/:id` |
| `delete_post` | "Delete yesterday's draft" | `post_id` | `DELETE /v1/posts/:id` |
| `list_posts` | "Show scheduled posts" | `status?`, `platform?`, `account?`, `connected_account_id?`, `search?`, `limit?` | `GET /v1/posts` |
| `get_post` | "Open post details" | `post_id` | `GET /v1/posts/:id` |
| `publish_post` | "Publish my draft now" | `post_id`, `platforms?` | `POST /v1/posts/:id/publish` |
| `schedule_post` | "Schedule existing post" | `post_id`, `scheduled_at`, `platforms?` | `POST /v1/posts/:id/schedule` |
| `upload_media` | "Upload logo.png" | `file_path` | presign → PUT → confirm |
| `publish_now` | "Post this now" (one step) | `content`, `platforms[]`, `media?` | `POST /v1/posts/publish` |
| `schedule_content` | "Schedule new post" (one step) | `content`, `platforms[]`, `scheduled_at`, `media?` | `POST /v1/posts/schedule` |
| `get_publish_status` | "Did it publish?" | `tracking_id` | `GET /v1/jobs/:trackingId` |
| `suggest_best_platforms` | "Where should I post this?" | `content`, `has_media?`, `media_is_video?`, `media_type?` | client heuristic (+ optional `GET /v1/accounts`) |

#### Platform names (document for users and agents)

Users can pass **platform names** or **account UUIDs** in `platforms[]`:

| User says | Pass as |
|-----------|---------|
| LinkedIn | `linkedin` |
| X / Twitter | `twitter_x` |
| Instagram | `instagram` |
| Facebook | `facebook` |
| Threads | `threads` |
| TikTok | `tiktok` |
| YouTube | `youtube` |
| Pinterest | `pinterest` |
| Bluesky | `bluesky` |

Aliases accepted by MCP: `x`, `twitter` → `twitter_x`; `ig` → `instagram`; `fb` → `facebook`; `yt` → `youtube`.

If multiple accounts exist on one platform, user must pass the **account UUID** (from `list_accounts`).

#### Post status filter values (`list_posts`)

`draft` | `scheduled` | `publishing` | `published` | `partial` | `failed`

#### Datetime format

All schedule fields: **ISO 8601 UTC** — e.g. `2026-07-12T09:00:00.000Z`

Document: "9 AM in your timezone" → user/agent must convert to UTC or use user's timezone explicitly.

---

### 5.4 Host setup pages

Create four pages by adapting `social0-mcp/examples/*.md`. Each page needs:

1. Prerequisites (Node 20+, API key, built MCP server)
2. Config file location for that host
3. Full JSON config (copy-paste)
4. How to restart / reload MCP
5. Verify it works (`list_accounts` test prompt)
6. Dev mode option (`tsx` + `SOCIAL0_MCP_VERBOSE=true`)

#### Claude Desktop

- Config path: `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS)
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- Use `node` + absolute path to `dist/index.js`

#### Cursor

- Config: `.cursor/mcp.json` (project) or Cursor Settings → MCP
- Dev: `npx tsx /path/to/social0-mcp/src/index.ts`

#### VS Code

- Note: depends on MCP extension; use `stdio` type if supported
- Build before run: `npm run build`

#### ChatGPT

- Note: MCP availability varies by plan/region
- Link to Claude/Cursor as primary recommendation

---

### 5.5 `/docs/integrations/mcp/troubleshooting`

| Symptom | Cause | Fix |
|---------|-------|-----|
| `SOCIAL0_API_KEY is required` | Missing env var | Set in MCP host config `env` block |
| `must start with sk_live_` (or legacy `s0_live_`) | Wrong key format | Create new key in dashboard |
| `401 Unauthorized` | Revoked/expired key | Create new API key |
| `Unknown tool` | Old MCP build | `npm run build`, restart host |
| Post create fails / validation_error | Invalid body or no connected account | Check platform name, connect account, media rules — see troubleshooting |
| `No connected linkedin account` | Platform not connected | [Connect accounts](/docs/dashboard/connections) first |
| `Multiple twitter_x accounts` | Ambiguous platform name | Use account UUID from `list_accounts` |
| Media upload fails | File type/size | JPG, PNG, GIF, WebP ≤50MB; MP4/MOV/WebM ≤500MB |
| `429` rate limit | Too many requests | MCP auto-retries; wait and retry |
| MCP host shows no tools | Server not starting | Check stderr; run `node dist/index.js` manually |
| `console.log` broke MCP | stdout pollution | MCP logs only to stderr |
| `overall_status: processing` forever | One platform still running or stuck from pre-fix deploy | Poll again; if one platform stays `platform_queued` >2 min, retry publish for that post (see §14.6) |
| `failure_reason` while still `processing` | Stale post row from a prior failed attempt (pre-2026-07-12) | Retry publish; on current API `failure_reason` is only set when the job is terminal |
| Twitter/X shows `platform_failed` with "Publishing is temporarily unavailable" | Old Social0 internal throttle on CF worker (removed) | Redeploy API + worker; retry — real X errors will be different messages |
| `failed: 0` but `platform_statuses` shows `platform_failed` | Job counter desync (fixed 2026-07-12) | Upgrade API; counters now reconcile from DB publications + events |
| Dashboard shows Pending, API shows failed | `post_publications` row not synced (fixed 2026-07-12) | Upgrade API + worker; retry stuck publication from dashboard |
| Multi-platform: one succeeds, one fails | Expected when a platform rejects the post | Job status becomes `partial`; check `errors[]` per platform; reconnect account if auth error |

**Debug mode**

```bash
SOCIAL0_MCP_VERBOSE=true SOCIAL0_API_KEY=sk_live_xxx node dist/index.js
```

**MCP Inspector**

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

---

### 5.6 `/docs/api` — REST API reference (expand existing)

Even though users may only use MCP, document the REST API the MCP calls. Developers and agents need this.

#### Base URL

All MCP tools use the **v1** prefix:

| Environment | URL |
|-------------|-----|
| Production API host | `https://api.social0.app` |
| v1 REST base (MCP default) | `https://api.social0.app/v1` |
| OpenAPI spec | `https://api.social0.app/openapi.json` |
| Interactive reference | `https://api.social0.app/docs` |

#### Authentication page (`/docs/api/authentication`)

```http
Authorization: Bearer sk_live_<secret>
Content-Type: application/json
```

Legacy keys: `s0_live_<secret>` still accepted.

#### Endpoints to document (all under `/v1`)

**Accounts**

```http
GET /v1/accounts
```

Response: `{ "data": [ { "id", "platform", "username", "profile_image_url", "is_active", "token_status", "token_expires_at", "created_at" } ] }`

**Media upload (3-step)**

```http
POST /v1/media/presign
Body: { "filename", "content_type", "size_bytes" }

PUT <upload_url from presign>
Body: raw bytes

POST /v1/media/confirm
Body: { "key", "storage_filename", "original_filename", "content_type", "size_bytes" }
```

**Posts CRUD**

```http
GET    /v1/posts
POST   /v1/posts
GET    /v1/posts/:id
PATCH  /v1/posts/:id
DELETE /v1/posts/:id
```

Create body: `{ "content", "platforms": ["<connected-account-uuid>", ...], "media"?: ["<media-uuid>", ...], "platform_options"?: {} }`

**Publish & schedule**

```http
POST /v1/posts/:id/publish
# 202 → { "tracking_id", "status", "stream_url" }

POST /v1/posts/:id/schedule
Body: { "scheduledAt": "ISO-8601", "timezone"?: "IANA" }

POST /v1/posts/publish
Body: same as create — create + publish in one step

POST /v1/posts/schedule
Body: create fields + scheduledAt (+ optional timezone)
```

**Job status**

```http
GET /v1/jobs/:trackingId
GET /v1/jobs/:trackingId/stream   # SSE live progress
```

Response shape (document fully — MCP `get_publish_status` mirrors this):

```json
{
  "tracking_id": "uuid",
  "post_id": "uuid",
  "status": "queued | processing | completed | failed | partial",
  "total": 2,
  "completed": 1,
  "failed": 1,
  "platform_statuses": [
    {
      "platform": "youtube",
      "connected_account_id": "uuid",
      "phase": "platform_success",
      "message": "Published to youtube",
      "error": null
    },
    {
      "platform": "twitter_x",
      "connected_account_id": "uuid",
      "phase": "platform_failed",
      "message": "Actual platform error message here",
      "error": "Actual platform error message here"
    }
  ],
  "errors": [
    {
      "platform": "twitter_x",
      "connected_account_id": "uuid",
      "message": "Actual platform error message here"
    }
  ],
  "failure_reason": "First failure message (only when status is failed or partial)",
  "created_at": "ISO-8601",
  "completed_at": "ISO-8601 | null"
}
```

**Status semantics (must document clearly):**

| `status` | Meaning |
|----------|---------|
| `queued` | Job accepted, not yet fanning out to platforms |
| `processing` | At least one platform still publishing |
| `completed` | All platforms succeeded |
| `failed` | All platforms failed |
| `partial` | Mixed outcome — some succeeded, some failed (all platforms terminal) |

**Platform `phase` values users/agents will see:**

| `phase` | Meaning |
|---------|---------|
| `platform_queued` | Platform job accepted |
| `platform_uploading` | Upload/publish in progress |
| `platform_success` | Published on that platform |
| `platform_failed` | Failed on that platform — read `error` / `message` |

**Important:** Multi-platform publishes run **in parallel** (one job per platform). Poll `get_publish_status` until `status` is terminal (`completed`, `failed`, or `partial`). MCP maps API `status` → `overall_status` in its tool response.

**Posts (v1 — live)**

```http
GET    /v1/posts
POST   /v1/posts
GET    /v1/posts/:id
PATCH  /v1/posts/:id
DELETE /v1/posts/:id
POST   /v1/posts/:id/publish
POST   /v1/posts/:id/schedule
POST   /v1/posts/publish
POST   /v1/posts/schedule
```

#### Error format

```json
{
  "error": "Human-readable message",
  "code": "UNAUTHORIZED | validation_error | not_found | ..."
}
```

#### Rate limits (document if known)

- Publish: ~60/hour per user
- Media upload: ~400/hour per user

---

## 6. Cross-linking matrix

Every new page should link appropriately. Use this matrix:

| From | Link to |
|------|---------|
| MCP overview | API keys, Connections, Tools ref, Troubleshooting |
| API keys | MCP overview, REST auth |
| Connections | MCP overview ("then use MCP to post") |
| Composer docs | MCP ("manage via AI") |
| Posts docs | MCP `list_posts`, `publish_post` |
| Troubleshooting | API keys, Connections |
| REST API | MCP ("higher-level: use MCP server") |

---

## 7. SEO & discoverability

### Meta titles / descriptions

| Page | Title | Description |
|------|-------|-------------|
| MCP overview | Social0 MCP Server — Manage social posts from AI \| Social0 Docs | Official Model Context Protocol server for Social0. Connect Claude, Cursor, or ChatGPT to create, publish, and schedule posts. |
| API keys | API Keys \| Social0 Docs | Create and manage Social0 API keys for MCP, scripts, and integrations. |
| Tools ref | MCP Tools Reference \| Social0 Docs | Complete reference for all Social0 MCP tools. |

### Keywords to include naturally

- Social0 MCP server
- Model Context Protocol social media
- Claude Social0 integration
- Cursor MCP Social0
- Social0 API key
- AI social media scheduling

### llms.txt addition (if you maintain one)

Add section:

```text
## Integrations
- MCP Server: https://docs.social0.app/docs/integrations/mcp
- API Keys: https://docs.social0.app/docs/dashboard/api-keys
- REST API: https://docs.social0.app/docs/api
```

---

## 8. FAQ section (add to MCP overview or separate)

**Q: Do I need to pay for MCP?**  
A: MCP uses your existing Social0 plan. API access follows the same limits as your account.

**Q: Can MCP connect my Instagram/Facebook account?**  
A: No. Connect platforms in the [dashboard](/docs/dashboard/connections). MCP only posts to already-connected accounts.

**Q: Is my API key sent to Social0's servers?**  
A: Yes — the MCP server calls `api.social0.app` with your key, same as any API client. The key is stored locally in your MCP host config.

**Q: Can I use MCP on mobile?**  
A: MCP hosts are desktop apps (Claude Desktop, Cursor). Mobile not supported today.

**Q: What's the difference between MCP and the REST API?**  
A: MCP is a translation layer for AI assistants. REST API is the underlying interface. MCP calls REST.

**Q: Why does create post fail?**  
A: Ensure `/v1/posts` is reachable with a valid `sk_live_` key. Common causes: invalid platform name, no connected account for that platform, or media validation errors. See troubleshooting.

**Q: What does `partial` mean for publish status?**  
A: Multi-platform publish finished with mixed results — some platforms succeeded, some failed. Check `errors` in `get_publish_status`. See §14.2.

**Q: What is `suggest_best_platforms`?**  
A: Analyzes your caption length and media to recommend platforms. Uses heuristics + your connected accounts.

---

## 9. Agent instructions (for `social0-docs` agent)

When implementing these changes:

1. **Read** `social0-mcp/README.md` and `social0-mcp/examples/*.md` as source material.
2. **Create** pages in priority order: P0 → P1 → P2 (see §3.2).
3. **Update** `/docs/dashboard/api-keys` first — MCP docs are useless without it.
4. **Do not** add "rolling out" or "coming soon" callouts for `/v1/posts` — all `/v1` endpoints are live.
5. **Use** copy-pasteable code blocks — users and AI agents rely on exact config JSON.
6. **Add** screenshot placeholders as MDX components or HTML comments for later design pass.
7. **Match** existing docs styling (headings, admonitions/callouts, code theme).
8. **Do not** document internal RPC (`POST /api/rpc`) or legacy `/api/publish` as the public integration path — document `/v1` REST + MCP only.
9. **Do not** promise OAuth via MCP.
10. **Add** changelog entry: "Added MCP Server documentation" with date.
11. **Verify** all internal links resolve.
12. **Read §14** before documenting publish, job status, or troubleshooting — multi-platform behavior changed July 2026.
13. **Document** `partial` job status, `platform_statuses` phases, and polling pattern for `get_publish_status`.
14. **Do not** document the removed error string "Publishing is temporarily unavailable" as a current failure — note it as historical (§14.6).

### Suggested docs PR checklist

- [ ] `/docs/integrations/mcp` created
- [ ] `/docs/integrations/mcp/tools` — all 13 tools documented
- [ ] `/docs/dashboard/api-keys` — fully rewritten
- [ ] 4 host setup pages created
- [ ] Troubleshooting page created
- [ ] REST API auth + endpoints documented
- [ ] Sidebar/navigation updated
- [ ] Cross-links from dashboard docs added
- [ ] SEO meta set
- [ ] Changelog updated
- [ ] llms.txt updated (if applicable)

---

## 10. Content to copy verbatim (blocks)

### Architecture (ASCII — for docs that don't support mermaid)

```text
Claude / ChatGPT / Cursor
            │
            ▼
      Social0 MCP Server
            │
     (translate tool calls)
            │
            ▼
     Social0 Public REST API
            │
            ▼
     Existing Backend
```

### Minimal Cursor config

```json
{
  "mcpServers": {
    "social0": {
      "command": "node",
      "args": ["/absolute/path/to/social0-mcp/dist/index.js"],
      "env": {
        "SOCIAL0_API_KEY": "sk_live_your_key_here",
        "SOCIAL0_API_URL": "https://api.social0.app/v1"
      }
    }
  }
}
```

### Minimal Claude Desktop config

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

### Verify installation prompt

```text
Use the Social0 MCP list_accounts tool to show my connected accounts.
```

Expected: list of platforms with IDs and token status.

### Media upload flow (for docs)

```text
1. upload_media({ file_path: "./logo.png" })  → mediaId
2. create_post({ content: "...", platforms: ["linkedin", "twitter_x"], media: [mediaId] })
3. publish_post({ post_id: "..." })  → tracking_id
4. get_publish_status({ tracking_id: "..." })  → poll until completed | failed | partial
5. get_post({ post_id: "..." })  → final per-platform URLs and errors
```

Multi-platform publishes fan out in parallel. Video uploads (YouTube, X, Instagram) may take minutes — document polling interval (2–5s) and terminal statuses. See §14.

---

## 11. Future doc updates (trigger list)

Update docs when these ship:

| Event | Doc change |
|-------|------------|
| ~~`/v1/posts` CRUD goes live~~ | ✅ Done — no rolling-out callouts |
| ~~API keys UI leaves "coming soon"~~ | ✅ Done — add screenshots when available |
| `social0-mcp` standalone repo published | Update clone URLs to new repo |
| npm package `@social0/mcp-server` published | Document `npx @social0/mcp-server` install path |
| Windsurf official MCP docs | Add dedicated page |
| Platform suggestion API endpoint | Update `suggest_best_platforms` to mention backend AI |
| Team / shared API keys | New section under API keys |
| New platform added to SERVER_SIDE_PUBLISH_PLATFORMS | Update §14.5 platform routing table |
| MCP tool for job SSE stream | Document `GET /v1/jobs/:id/stream` or add MCP wrapper |

---

## 12. Related files in monorepo (for agent context)

| File | Purpose |
|------|---------|
| `social0-mcp/README.md` | Package readme — source for overview |
| `social0-mcp/examples/*.md` | Host setup guides |
| `social0-mcp/src/tools/definitions.ts` | Tool names + descriptions |
| `social0-mcp/src/schemas/tools.ts` | Input validation schemas |
| `social0-mcp/.env.example` | Env var reference |
| `frontend/src/lib/docs-url.ts` | In-app doc URL constants to extend |
| `FEATURES.md` § Developer & API | Product feature status |
| `backend/server/src/routes/v1/*` | **Public REST API** — all MCP calls (accounts, posts, media, jobs) |
| `backend/server/src/routes/api/*` | Dashboard/session routes — not the MCP integration surface |
| `backend/server/src/services/publish-enqueue.ts` | V1/MCP fan-out: one queue job per platform |
| `backend/server/src/publish/process-platform-server.ts` | Twitter/X runs on API server (Node) |
| `backend/server/src/lib/resolve-job-snapshot.ts` | Job status enrichment from DB publications |
| `backend/server/src/lib/v1-job-format.ts` | V1 job response + `partial` status |
| `backend/server/src/lib/posts-list/posts-list-data.ts` | Dashboard post detail normalization |
| `cloudflare/publish-worker/src/` | CF worker for YouTube, Instagram, etc. |
| `social0-mcp/src/tools/handlers.ts` | MCP `get_publish_status` response mapping |

---

## 14. Multi-platform publishing — architecture & docs context (2026-07-12)

> **Audience:** Docs agent implementing publish/status/troubleshooting pages.  
> **Background:** Extensive debugging session (dashboard vs V1/MCP parity, Twitter/X video, job status desync). This section is the authoritative context for documenting publish behavior accurately.

### 14.1 Two publish paths (critical for docs)

Social0 has **two ways** to publish. They intentionally diverge at the worker layer but share the same core publish logic (`executePublish`).

```
┌─────────────────────────────────────────────────────────────────────────┐
│ DASHBOARD (Composer → Publish)                                          │
├─────────────────────────────────────────────────────────────────────────┤
│  UI → RPC publish.publishPost → executePublish() inline on API server   │
│       (Node.js, twitter-api-v2, full OAuth/media upload support)        │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ V1 REST API / MCP (publish_post, publish_now)                           │
├─────────────────────────────────────────────────────────────────────────┤
│  POST /v1/posts/:id/publish                                             │
│    → prepareAndEnqueuePublish()                                         │
│    → one async job PER connected platform (parallel, not sequential)  │
│                                                                         │
│  Per platform routing (when CF dispatch enabled):                       │
│    • twitter_x  → API server (runPlatformJobOnServer) — same Node path│
│    • youtube, instagram, linkedin, … → Cloudflare publish worker      │
└─────────────────────────────────────────────────────────────────────────┘
```

**Docs must say:** MCP and REST publish are **not** slower “sequential” publishes — they fan out to all target platforms at once. Status is tracked via a single `tracking_id` with per-platform rows in `platform_statuses`.

**Docs must NOT say:** “MCP uses the same code path as the dashboard button” verbatim — that's only true for **Twitter/X** (and dashboard always runs on server). Other platforms go through the CF worker queue in V1/MCP.

### 14.2 End-to-end MCP publish flow (document as tutorial)

```text
1. list_accounts                          → confirm platforms connected
2. upload_media (optional)                → media_id
3. create_post OR publish_now             → post_id (+ tracking_id if publish_now)
4. publish_post (if draft)                → tracking_id (HTTP 202)
5. get_publish_status({ tracking_id })    → poll until terminal status
6. get_post({ post_id })                  → final per-platform publication rows
```

**Polling guidance for docs:**

- Poll every 2–5 seconds while `overall_status` is `processing`
- Stop when `overall_status` is `completed`, `failed`, or `partial`
- For video posts (YouTube, Instagram, X), uploads can take 30s–several minutes — document patience
- `completed_at` is non-null only when the job is terminal

**Example terminal responses:**

| Outcome | `overall_status` | `progress` | User message |
|---------|------------------|------------|--------------|
| All ok | `completed` | `{ completed: N, failed: 0, total: N }` | "Published to all platforms" |
| All failed | `failed` | `{ completed: 0, failed: N, total: N }` | Check `errors[]`, reconnect accounts |
| Mixed | `partial` | `{ completed: 1, failed: 1, total: 2 }` | "Published to 1/2 platforms" — list which failed |

### 14.3 `get_publish_status` MCP tool — full spec for docs agent

MCP tool calls `GET /v1/jobs/:trackingId` and reshapes the response:

| API field | MCP field | Notes |
|-----------|-----------|-------|
| `status` | `overall_status` | Includes `partial` |
| `total`, `completed`, `failed` | `progress.total`, etc. | Nested under `progress` |
| `platform_statuses` | `platform_statuses` | Same |
| `errors` | `errors` | Same |
| `failure_reason` | `failure_reason` | Only when job terminal with failures |
| `created_at`, `completed_at` | same | same |

**Expand `get_publish_status` in §5.3 with:**

- **When to use:** After any `publish_post`, `publish_now`, or `POST /v1/posts/:id/publish`
- **Parameters:** `tracking_id` (UUID from publish response)
- **Returns:** See §5.6 job status JSON (with `overall_status` wrapper)
- **Example user prompt:** "Did my post publish? Check tracking ID …"
- **Example flow:**
  1. User publishes to LinkedIn + X
  2. First poll: `processing`, one `platform_uploading`, one `platform_queued`
  3. Final poll: `partial` if X fails, `completed` if both succeed
- **REST API called:** `GET /v1/jobs/:trackingId`
- **Optional:** Mention SSE stream `GET /v1/jobs/:trackingId/stream` for integrators (not exposed as MCP tool today)

### 14.4 Post status vs job status (avoid confusing users)

| Concept | Values | Where seen |
|---------|--------|------------|
| **Publish job** (`tracking_id`) | `queued`, `processing`, `completed`, `failed`, `partial` | `get_publish_status`, `GET /v1/jobs/:id` |
| **Post** (`post_id`) | `draft`, `scheduled`, `publishing`, `published`, `partial`, `failed` | `get_post`, `list_posts`, dashboard |

During publish, post is usually `publishing`. When all platforms finish:

- All success → post `published`
- All failure → post `failed`
- Mixed → post `partial`

`get_post` returns per-platform `platforms[]` with `status`, `error`, `platform_post_url` — use this for final truth after job completes.

### 14.5 Platform-specific notes (document in publish troubleshooting)

| Platform | V1/MCP path | Notes for docs |
|----------|-------------|----------------|
| **twitter_x** | API server (Node) | Video upload needs `twitter-api-v2` + Node `https`; not run on CF worker. Same reliability as dashboard. |
| **youtube** | Cloudflare worker | Large video uploads; may take minutes. Auth errors → reconnect YouTube in dashboard. |
| **instagram** | Cloudflare worker | Reels/video have platform constraints. |
| **linkedin, facebook, threads, tiktok, pinterest, bluesky** | Cloudflare worker (or BullMQ if configured) | Standard queue path. |

**Multiple accounts on one platform:** User must pass account UUID in `platforms[]`, not just `twitter_x`. Document this prominently.

### 14.6 Bugs fixed 2026-07-12 (historical — informs troubleshooting copy)

These were **Social0 infrastructure bugs**, not user error. Document as resolved; include retry guidance for posts stuck before the fix.

| Symptom | Root cause | Fix (commits) | User action if stuck |
|---------|------------|---------------|----------------------|
| `"Publishing is temporarily unavailable. Try again later."` on X | Internal `checkTwitterPublishRateLimit` failed when Redis unavailable on CF worker | `45e7d3f` — removed gate; `e840112` — route X to API server | Redeploy; retry publish. This exact string should **not** appear on current API. |
| X `platform_queued` forever, never uploads | CF worker dropped jobs / stale `failureReason` blocked retry UX | `45e7d3f`, `e840112` — worker records failures, clears `failureReason` on new publish | Retry publication from dashboard or re-call `publish_post` |
| `failed: 0` but `platform_failed` in `platform_statuses` | Job counters ignored failed events | `45e7d3f` — reconcile from publications + events | Upgrade API |
| `failure_reason` set while `processing` | Stale post row from prior attempt | `45e7d3f` + `226ad9d` — only expose when job terminal | Retry publish |
| Dashboard: post Failed, platforms all Pending | `post_publications` not updated on worker failure | `45e7d3f`, `e840112` — worker + `getPostDetail` normalization | Upgrade; retry |
| Twitter job progress desync in Redis vs DB | Server-side X jobs wrote Postgres only | `226ad9d` — emit to Redis + DB | Upgrade API |

**Stuck posts from before deploy:** Old queue messages may not resume. Users should **retry** the publication (dashboard retry or new `publish_post`). Do not promise automatic recovery.

### 14.7 What can still fail (honesty block for publish docs)

Social0 fixes covered **false failures** and **stuck state**. Real platform failures still happen:

- Expired OAuth / disconnected account → reconnect in [Connections](/docs/dashboard/connections)
- Platform API rejection (content policy, rate limits, media format)
- X/Twitter media size or duration limits
- YouTube quota or auth errors

**Docs tone:** "If `platform_failed` shows an error from the platform (not the old 'temporarily unavailable' message), fix the underlying account or content issue and retry."

### 14.8 Deploy / ops note (internal — optional callout for advanced docs)

Publish reliability fixes require **both**:

1. **API server** redeploy — Twitter routing, job snapshot enrichment, Redis sync for server-side jobs
2. **Cloudflare publish worker** redeploy — YouTube/Instagram queue processing, failure recording

MCP users only hit the public API; they don't deploy workers. If status looks wrong on production, it's an ops/deploy issue — not MCP config.

### 14.9 Pages to add or expand from this context

| Page | Add |
|------|-----|
| `/docs/integrations/mcp/tools` | Full `get_publish_status` section + `partial` status |
| `/docs/api/reference/jobs` (or publish guide) | Job status schema, phases, SSE stream, polling guide |
| `/docs/api` publish section | Multi-platform fan-out diagram, `tracking_id`, 202 response |
| `/docs/integrations/mcp/troubleshooting` | Rows from §5.5 publish table + §14.6 |
| `/docs/dashboard/posts` | How post status relates to publish job; retry failed platforms |
| FAQ | "Why is my job `partial`?" "How long should I poll?" |

### 14.10 Mermaid diagram for publish docs

```mermaid
sequenceDiagram
  participant Agent as AI Agent / MCP
  participant API as Social0 API
  participant Q as CF Publish Worker
  participant Node as API Server (Node)
  participant X as X / Twitter API
  participant YT as YouTube API

  Agent->>API: POST /v1/posts/:id/publish
  API-->>Agent: 202 { tracking_id }

  par Platform fan-out
    API->>Node: twitter_x job (inline)
    Node->>X: upload + tweet
    Node-->>API: platform_success / platform_failed
  and
    API->>Q: enqueue youtube job
    Q->>YT: upload video
    Q-->>API: platform_success / platform_failed
  end

  loop Poll until terminal
    Agent->>API: GET /v1/jobs/:trackingId
    API-->>Agent: processing → partial / completed
  end
```

### 14.11 Copy-ready FAQ additions

**Q: Why does `get_publish_status` show `partial`?**  
A: Your post targeted multiple platforms and at least one succeeded and at least one failed. Check `errors` for the failed platform(s). The post itself will be `partial` in `get_post`.

**Q: How long should I poll?**  
A: Text posts usually finish in seconds. Video to YouTube or X can take 1–5+ minutes. Poll every few seconds until `overall_status` is `completed`, `failed`, or `partial`.

**Q: One platform says `platform_queued` for a long time — is it broken?**  
A: On current API, platforms should move to `platform_uploading` quickly. If stuck >2 minutes, retry the publish. Posts started before July 2026 reliability fixes may need a manual retry.

**Q: Does MCP publish work the same as the dashboard Publish button?**  
A: Same outcome, slightly different plumbing. Dashboard runs everything on the server. API/MCP fans out per platform; X always runs on the server; other platforms use a background worker. Reliability should match after the 2026-07-12 fixes.

**Q: Can MCP retry a failed platform?**  
A: Use dashboard retry for a specific publication, or `publish_post` again on a `failed`/`partial` post (API allows republish of failed platforms). Document exact API rules from `execute-publish.ts` retry logic if needed.

---

## 13. One-paragraph prompt for docs agent

Paste this as the agent's task header:

```text
Implement Social0 MCP documentation on docs.social0.app per social0-mcp/docs-updation-mcp.md.

Priority: (1) rewrite /docs/dashboard/api-keys, (2) create /docs/integrations/mcp hub + quick start, (3) create /docs/integrations/mcp/tools with all 13 tools — especially get_publish_status + partial status, (4) create host setup pages from social0-mcp/examples/, (5) create troubleshooting including multi-platform publish issues (§14.6), (6) expand REST API reference under /docs/api with full job status schema (§5.6, §14).

Read §14 in full before writing publish/status pages. Document multi-platform parallel fan-out, tracking_id polling, partial vs completed vs failed, and per-platform phases. Use sk_live_ API keys. Post CRUD via /v1/posts is live — no rolling-out callouts.

Use copy-pasteable JSON configs. Add sidebar Integrations section. Cross-link from dashboard docs. Match existing docs style.
```

---

*End of docs update brief.*
