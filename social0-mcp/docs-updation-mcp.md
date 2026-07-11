# Social0 Docs Update Brief — MCP Server Launch

> **Audience:** `social0-docs` agent (or any docs maintainer)  
> **Purpose:** Implement all user-facing documentation for the new **Social0 MCP Server** — the official Model Context Protocol integration that lets AI assistants manage Social0 via natural language.  
> **Source of truth:** `social0-mcp/` package in the main Social0 monorepo (or standalone `social0-mcp` GitHub repo once published).  
> **Docs site:** `https://docs.social0.app`  
> **Last reviewed:** 2026-07-11 (updated after PR #39 — public REST API live)

> **IMPORTANT — API is live:** As of PR #39 (`cursor/public-rest-api-da54`), the full `/v1` REST API is production-ready. The MCP server now calls **only `/v1/*` endpoints**. Use `sk_live_` API keys (legacy `s0_live_` accepted). Cross-reference the main API docs brief at `docs-updation.md` in the app repo and live OpenAPI at `https://api.social0.app/openapi.json`.

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
| API key | `s0_live_...` bearer token for REST API |
| Tracking ID | UUID returned when publishing; used to poll status |

---

## 3. Information architecture changes

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
└── REST API                    → /docs/integrations/api          ← expand or link existing
    ├── Authentication          → /docs/integrations/api/authentication
    ├── Accounts                → /docs/integrations/api/accounts
    ├── Posts                   → /docs/integrations/api/posts
    ├── Media                   → /docs/integrations/api/media
    ├── Publish                 → /docs/integrations/api/publish
    └── Job status              → /docs/integrations/api/jobs
```

### 3.2 Pages to **create** (priority order)

| Priority | Page | URL | Why |
|----------|------|-----|-----|
| P0 | MCP overview + quick start | `/docs/integrations/mcp` | Main entry point |
| P0 | API keys (full guide) | `/docs/dashboard/api-keys` | **Update existing stub** — required before MCP works |
| P0 | MCP tools reference | `/docs/integrations/mcp/tools` | Every tool documented |
| P1 | Per-host setup (4 pages) | `/docs/integrations/mcp/{host}` | Copy from `social0-mcp/examples/` |
| P1 | MCP troubleshooting | `/docs/integrations/mcp/troubleshooting` | Reduce support load |
| P1 | REST API authentication | `/docs/integrations/api/authentication` | Bearer token docs |
| P2 | REST API endpoint reference | `/docs/integrations/api/*` | For developers not using MCP |
| P2 | Integrations overview | `/docs/integrations` | Hub page linking MCP + API |

### 3.3 Pages to **update** (existing)

| Page | URL (existing in app) | Change |
|------|----------------------|--------|
| API keys | `/docs/dashboard/api-keys` | Replace "coming soon" with full guide; link to MCP |
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
export const DOCS_MCP_URL = `${DOCS_BASE_URL}/docs/integrations/mcp`;
export const DOCS_MCP_QUICKSTART_URL = `${DOCS_BASE_URL}/docs/integrations/mcp/quickstart`;
export const DOCS_REST_API_URL = `${DOCS_BASE_URL}/docs/integrations/api`;
```

Wire `ApiKeysPage.tsx` ("coming soon") → `DOCS_API_KEYS_URL` and `DOCS_MCP_URL`.

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
2. [API key](/docs/dashboard/api-keys) (`s0_live_...`)
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

**Current state in product:** Dashboard page says "API keys management coming soon" but **backend already supports** `POST/GET/DELETE /api/api-keys`.

**This page must be rewritten completely.**

#### Sections

**What are API keys?**  
Programmatic access to Social0 without browser session cookies. Used by MCP server, scripts, and integrations.

**Key format**

```text
s0_live_<secret>
```

Shown **once** at creation. Store securely. Never commit to git.

**Create an API key**

1. Go to [social0.app/dashboard/api-keys](https://social0.app/dashboard/api-keys)
2. Click **Create API key**
3. Name it (e.g. "Claude Desktop", "Cursor MCP")
4. Copy the full key — it won't be shown again

**Use in requests**

```http
Authorization: Bearer s0_live_your_key_here
```

**Use with MCP**

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
| Create / list / edit posts via REST | 🚧 Rolling out (`/v1/posts`) |

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
| `list_accounts` | "Show my connected accounts" | — | `GET /api/accounts` |
| `create_post` | "Draft a LinkedIn post about X" | `content`, `platforms[]`, `media[]?`, `is_draft?` | `POST /v1/posts` |
| `update_post` | "Edit my draft" | `post_id`, optional fields | `PATCH /v1/posts/:id` |
| `delete_post` | "Delete yesterday's draft" | `post_id` | `DELETE /v1/posts/:id` |
| `list_posts` | "Show scheduled posts" | `status?`, `platform?`, `search?`, `limit?` | `GET /v1/posts` |
| `get_post` | "Open post details" | `post_id` | `GET /v1/posts/:id` |
| `publish_post` | "Publish my draft now" | `post_id`, `platforms?` | `POST /api/publish` |
| `schedule_post` | "Schedule existing post" | `post_id`, `scheduled_at`, `platforms?` | `POST /api/publish` |
| `upload_media` | "Upload logo.png" | `file_path` | presign → PUT → confirm |
| `publish_now` | "Post this now" (one step) | `content`, `platforms[]`, `media?` | `POST /v1/posts` + `POST /api/publish` |
| `schedule_content` | "Schedule new post" (one step) | `content`, `platforms[]`, `scheduled_at`, `media?` | `POST /v1/posts` + `POST /api/publish` |
| `get_publish_status` | "Did it publish?" | `tracking_id` | `GET /api/jobs/:id` |
| `suggest_best_platforms` | "Where should I post this?" | `content`, `has_media?`, `media_is_video?` | heuristic (+ optional `GET /api/accounts`) |

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
| `must start with s0_live_` | Wrong key format | Create new key in dashboard |
| `401 Unauthorized` | Revoked/expired key | Create new API key |
| `Unknown tool` | Old MCP build | `npm run build`, restart host |
| Post create fails / NOT_IMPLEMENTED | `/v1/posts` not live | Create post in dashboard; use `publish_post` with `post_id` |
| `No connected linkedin account` | Platform not connected | [Connect accounts](/docs/dashboard/connections) first |
| `Multiple twitter_x accounts` | Ambiguous platform name | Use account UUID from `list_accounts` |
| Media upload fails | File type/size | JPG, PNG, GIF, WebP ≤50MB; MP4/MOV/WebM ≤500MB |
| `429` rate limit | Too many requests | MCP auto-retries; wait and retry |
| MCP host shows no tools | Server not starting | Check stderr; run `node dist/index.js` manually |
| `console.log` broke MCP | stdout pollution | MCP logs only to stderr |

**Debug mode**

```bash
SOCIAL0_MCP_VERBOSE=true SOCIAL0_API_KEY=s0_live_xxx node dist/index.js
```

**MCP Inspector**

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

---

### 5.6 `/docs/integrations/api` — REST API reference (new or expanded)

Even though users may only use MCP, document the REST API the MCP calls. Developers and agents need this.

#### Base URLs

| Environment | URL |
|-------------|-----|
| Production API | `https://api.social0.app` |
| v1 prefix | `https://api.social0.app/v1` |
| Legacy/stable paths | `https://api.social0.app/api` |

#### Authentication page (`/docs/integrations/api/authentication`)

```http
Authorization: Bearer s0_live_<secret>
Content-Type: application/json
```

#### Endpoints to document

**Accounts**

```http
GET /api/accounts
```

Response fields: `id`, `platform`, `platformUsername`, `isActive`, `tokenStatus`, etc.

**Media upload (3-step)**

```http
POST /api/media/presign
Body: { "filename", "contentType", "fileSize" }

PUT <presignedUrl>
Body: raw bytes

POST /api/media/confirm
Body: { "key", "storageFilename", "originalFilename", "contentType", "fileSize" }
```

**Publish**

```http
POST /api/publish
Body: {
  "postId": "uuid",
  "connectedAccountIds": ["uuid"],  // optional
  "scheduledAt": "ISO-8601",        // optional
  "mode": "now" | "schedule"        // optional
}
```

Responses: `202` + `trackingId` (now) or `200` + `status: scheduled`.

**Job status**

```http
GET /api/jobs/:trackingId
```

**Posts (v1 — document schema even if rolling out)**

```http
GET    /v1/posts
POST   /v1/posts
GET    /v1/posts/:id
PATCH  /v1/posts/:id
DELETE /v1/posts/:id
POST   /v1/posts/:id/publish
```

Mark with badge: **Beta** or **Coming soon** until live.

#### Error format

```json
{
  "error": "Human-readable message",
  "code": "UNAUTHORIZED | NOT_IMPLEMENTED | ..."
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
- REST API: https://docs.social0.app/docs/integrations/api
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
A: Post CRUD via `/v1/posts` may still be rolling out. Create in dashboard or check [status callout](#4-critical-honesty-block).

**Q: What is `suggest_best_platforms`?**  
A: Analyzes your caption length and media to recommend platforms. Uses heuristics + your connected accounts.

---

## 9. Agent instructions (for `social0-docs` agent)

When implementing these changes:

1. **Read** `social0-mcp/README.md` and `social0-mcp/examples/*.md` as source material.
2. **Create** pages in priority order: P0 → P1 → P2 (see §3.2).
3. **Update** `/docs/dashboard/api-keys` first — MCP docs are useless without it.
4. **Include** the honesty callout (§4) on every MCP page until `/v1/posts` is live.
5. **Use** copy-pasteable code blocks — users and AI agents rely on exact config JSON.
6. **Add** screenshot placeholders as MDX components or HTML comments for later design pass.
7. **Match** existing docs styling (headings, admonitions/callouts, code theme).
8. **Do not** document internal RPC (`POST /api/rpc`) as the public integration path — document REST + MCP only.
9. **Do not** promise OAuth via MCP.
10. **Add** changelog entry: "Added MCP Server documentation" with date.
11. **Verify** all internal links resolve.
12. **After** `/v1/posts` ships: update status tables, remove rolling-out callouts, add full CRUD examples.

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
        "SOCIAL0_API_KEY": "s0_live_your_key_here",
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
        "SOCIAL0_API_KEY": "s0_live_your_key_here"
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
4. get_publish_status({ tracking_id: "..." })
```

---

## 11. Future doc updates (trigger list)

Update docs when these ship:

| Event | Doc change |
|-------|------------|
| `/v1/posts` CRUD goes live | Remove rolling-out callouts; add full CRUD tutorials; update API keys table |
| API keys UI leaves "coming soon" | Add screenshots of dashboard UI |
| `social0-mcp` standalone repo published | Update clone URLs to new repo |
| npm package `@social0/mcp-server` published | Document `npx @social0/mcp-server` install path |
| Windsurf official MCP docs | Add dedicated page |
| Platform suggestion API endpoint | Update `suggest_best_platforms` to mention backend AI |
| Team / shared API keys | New section under API keys |

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
| `backend/server/src/routes/api/*` | Live REST endpoints |
| `backend/server/src/routes/v1/*` | v1 API (posts rolling out) |

---

## 13. One-paragraph prompt for docs agent

Paste this as the agent's task header:

```text
Implement Social0 MCP documentation on docs.social0.app per social0-mcp/docs-updation-mcp.md.

Priority: (1) rewrite /docs/dashboard/api-keys, (2) create /docs/integrations/mcp hub + quick start, (3) create /docs/integrations/mcp/tools with all 13 tools, (4) create host setup pages from social0-mcp/examples/, (5) create troubleshooting, (6) add REST API reference under /docs/integrations/api.

Be honest: post CRUD via /v1/posts is rolling out — document workarounds. Use copy-pasteable JSON configs. Add sidebar Integrations section. Cross-link from dashboard docs. Match existing docs style.
```

---

*End of docs update brief.*
