---
name: social0
description: >
  Create, schedule, and publish social media posts across Instagram, TikTok, YouTube, X, LinkedIn,
  Facebook, Pinterest, Threads, and Bluesky via Social0 MCP. Covers account listing, media upload,
  drafts, instant publish, scheduling, and per-platform publish status tracking.
last-updated: 2026-07-13
metadata:
  openclaw:
    primaryEnv: SOCIAL0_API_KEY
    envVars:
      - name: SOCIAL0_API_KEY
        required: false
        description: >
          sk_live_ API key for local npx MCP or REST calls. Not required when using hosted
          MCP at https://mcp.social0.app/mcp with OAuth.
      - name: SOCIAL0_MCP_VERBOSE
        required: false
        description: Set to true for verbose local MCP logging.
    requires:
      anyBins:
        - npx
        - node
    homepage: https://social0.app/mcp
---

# Social0 Social Media Skill

Autonomously manage social posting via [Social0](https://social0.app) — draft, publish, and schedule to **9 platforms** from chat.

Prefer the **MCP server** (hosted OAuth or local `npx`). Use the REST API only if MCP is unavailable.

> **Freshness check**: If more than 30 days have passed since the `last-updated` date above, tell the user this skill may be outdated and point them to [docs.social0.app/docs/integrations/mcp](https://docs.social0.app/docs/integrations/mcp) or [github.com/Abhishek-B-R/social0-mcp](https://github.com/Abhishek-B-R/social0-mcp).

## Keeping This Skill Updated

**Source**: [github.com/Abhishek-B-R/social0-mcp](https://github.com/Abhishek-B-R/social0-mcp)  
**Docs**: [docs.social0.app/docs/integrations/mcp](https://docs.social0.app/docs/integrations/mcp)  
**Marketing / setup**: [social0.app/mcp](https://social0.app/mcp)  
**npm**: [`@social0/mcp`](https://www.npmjs.com/package/@social0/mcp) (`social0-mcp` is a deprecated alias)

| Installation | How to update |
|--------------|---------------|
| MoltHub / ClawHub | Re-publish or pull latest skill version |
| Cursor / Claude | Re-copy `skills/social0/` or sync from the GitHub repo |
| Manual | Pull latest from the repo |

## Setup

1. Create a Social0 account at [social0.app](https://social0.app)
2. Connect social accounts in [Dashboard → Connections](https://social0.app/dashboard/connections)
3. Connect MCP (pick one):

### A — Remote URL (recommended)

Works with Claude.ai, ChatGPT, and any host that accepts a remote MCP connector.

```text
https://mcp.social0.app/mcp
```

User clicks **Connect** and authorizes on social0.app (OAuth PKCE). No Node.js, no API key in config.

**Cursor (HTTP MCP):**

```json
{
  "mcpServers": {
    "social0": {
      "url": "https://mcp.social0.app/mcp"
    }
  }
}
```

### B — Local npx

Needs [Node.js 20+](https://nodejs.org/) and a key from [Dashboard → API keys](https://social0.app/dashboard/api-keys) (`sk_live_…`):

```json
{
  "mcpServers": {
    "social0": {
      "command": "npx",
      "args": ["-y", "@social0/mcp"],
      "env": {
        "SOCIAL0_API_KEY": "sk_live_your_key_here"
      }
    }
  }
}
```

| Host | Where to paste |
|------|----------------|
| Cursor | Settings → MCP / `.cursor/mcp.json` |
| Claude Desktop | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| VS Code | Copilot / MCP settings (stdio) |

### Handling missing auth

1. **Hosted**: tell the user to reconnect the connector at `https://mcp.social0.app/mcp` and complete OAuth
2. **Local**: tell them to create a key at https://social0.app/dashboard/api-keys and put it in the MCP `env` block, then reload MCP
3. **Stop** — do not invent keys or search keychains for secrets
4. OAuth creates a connector API key (UI may show “Claude MCP Connector”); revoke anytime in Dashboard → API keys

## Auth (REST fallback)

If calling the API directly:

```
Authorization: Bearer <SOCIAL0_API_KEY>
```

Base URL: `https://api.social0.app/v1`  
Interactive docs: [api.social0.app/docs](https://api.social0.app/docs)

## MCP Tools

| Tool | Description |
|------|-------------|
| `list_accounts` | Connected accounts (`id`, `platform`, `username`, status). **Call first** when accounts are ambiguous |
| `create_post` | Create a **draft** (caption, platforms, media IDs, optional `platform_options`) |
| `update_post` | Update a draft / scheduled post |
| `delete_post` | Delete a post by ID |
| `list_posts` | List posts (`status`, `platform`, search, limit) |
| `get_post` | Full post + per-platform publication rows |
| `upload_media` | Upload via `url`, base64 `data`, or local `file_path` → media ID |
| `publish_post` | Publish an existing draft/scheduled post → `tracking_id` |
| `schedule_post` | Schedule an existing post (`scheduled_at` ISO-8601 UTC) |
| `publish_now` | Create + publish in one step → `post_id` + `tracking_id` |
| `schedule_content` | Create + schedule in one step |
| `get_publish_status` | Poll by `tracking_id` until terminal |
| `suggest_best_platforms` | Heuristic platform suggestions (does not publish) |

### Media (`upload_media`)

Provide **exactly one** of:

| Param | When to use |
|-------|-------------|
| `url` | Public **direct** http(s) file URL (best for remote hosts) |
| `data` | Base64 or `data:image/png;base64,...` (+ `filename` with extension) |
| `file_path` | Path on the **machine running MCP** only |

**Remote hosts (Claude.ai / ChatGPT / hosted MCP):** never pass sandbox paths like `/home/claude/...`. Use `url` or `data`.

### Publish status (`get_publish_status`)

After `publish_now` / `publish_post`, **always poll** with the returned `tracking_id` (every 2–5s for video / multi-platform).

| `overall_status` | Meaning |
|------------------|---------|
| `queued` / `processing` | Still running |
| `completed` | All targets succeeded |
| `failed` | All failed |
| `partial` | Some succeeded, some failed — read `errors` / `platform_statuses` |

## Recommended agent workflow

1. `list_accounts` before the first publish in a session
2. Simple one-shot → `publish_now` or `schedule_content`
3. User wants to edit first → `create_post` → `update_post` → `publish_post` / `schedule_post`
4. With media → `upload_media` first, then pass media IDs
5. After publish → return `tracking_id` and poll `get_publish_status` to terminal
6. On `partial` → summarize which platforms failed and why
7. Never invent account UUIDs or tracking IDs
8. Never claim MCP can connect Instagram/Facebook/etc. — send users to the dashboard
9. Schedules: confirm timezone; store/send UTC ISO-8601
10. **Publishing confirmation**: unless the user clearly says “post now” / “publish immediately”, confirm before live publish. Drafts are safe; live posts are not.

## Platform names

Canonical enums:

- `instagram`, `tiktok`, `youtube`, `twitter_x`, `linkedin`, `facebook`, `pinterest`, `threads`, `bluesky`

Aliases: `x` / `twitter` → `twitter_x`; `ig` → `instagram`; `fb` → `facebook`; `yt` → `youtube`; `li` → `linkedin`; `bsky` → `bluesky`; `pin` → `pinterest`.

**Rule:** one connected account per platform → platform name is fine. Multiple accounts on the same platform → use the UUID from `list_accounts`.

## Platform gotchas

- **Each platform posts independently.** One failure does not roll back others. Always check `get_publish_status`.
- **Ambiguous accounts** return an error listing UUIDs — call `list_accounts` and retry with IDs.
- **Media must be Social0 media IDs** on posts — upload first; do not paste Drive/Dropbox share links as `media`.
- **Non-direct URLs fail quietly** for `upload_media` `url` — need a direct file URL the server can download.
- **X/Twitter captions are short** — keep within ~280 characters when targeting `twitter_x`.
- **Connecting accounts is dashboard-only** — MCP cannot complete platform OAuth.

## Out of scope

- Connecting / refreshing platform OAuth in-app
- Analytics, inbox, social listening
- Dashboard-only features not on `/v1`

## REST API (optional)

Use when MCP is not available. Same publish pipeline as the dashboard.

```bash
curl -s https://api.social0.app/v1/accounts \
  -H "Authorization: Bearer $SOCIAL0_API_KEY"
```

Full schemas: [api.social0.app/docs](https://api.social0.app/docs)

## Tips

- Prefer hosted `https://mcp.social0.app/mcp` when the AI host supports remote MCP
- Prefer `publish_now` for simple “post this to LinkedIn and X” requests
- Always poll `get_publish_status` after multi-platform or video publishes
- Use drafts when testing to avoid accidental live posts
- Keep hashtags modest (about 4–5) unless the user asks otherwise
- Convert local times to UTC before `scheduled_at`
- Package name is **`@social0/mcp`** — always include `-y` with `npx` (`social0-mcp` still works as a deprecated alias)
