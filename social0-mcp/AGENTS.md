# AGENTS.md — Social0 MCP

Guidance for AI agents (and humans) using this MCP server.

## What this is

- **Package:** `@social0/mcp-server` (local stdio process)
- **Auth:** `SOCIAL0_API_KEY` → `Authorization: Bearer …` on `https://api.social0.app/v1`
- **Not included:** OAuth / connecting social accounts (user does that in the dashboard)

## Setup checklist

1. User has Social0 account + connected platforms  
2. API key created at https://social0.app/dashboard/api-keys (`sk_live_…`)  
3. This repo: `npm install && npm run build`  
4. Host config points at **absolute** `dist/index.js` with `SOCIAL0_API_KEY` in `env`  
5. Verify with `list_accounts`

## Tool reference

### `list_accounts`

No inputs. Returns connected accounts (`id`, `platform`, `username`, `is_active`, `token_status`).

**Use first** when the user is ambiguous about accounts or has multiple profiles per network.

---

### `create_post`

| Param | Required | Notes |
|-------|----------|--------|
| `content` | yes | Caption text |
| `platforms` | yes | Platform names and/or account UUIDs |
| `media` | no | Media UUIDs from `upload_media` |
| `platform_options` | no | Advanced per-platform settings (object) |

Creates a **draft**. Does not publish.

---

### `update_post`

| Param | Required | Notes |
|-------|----------|--------|
| `post_id` | yes | UUID |
| `content` | no | |
| `platforms` | no | |
| `media` | no | |
| `platform_options` | no | |

---

### `delete_post`

| Param | Required |
|-------|----------|
| `post_id` | yes |

---

### `list_posts`

| Param | Required | Notes |
|-------|----------|--------|
| `status` | no | `draft` \| `scheduled` \| `publishing` \| `published` \| `partial` \| `failed` |
| `platform` | no | Canonical platform enum |
| `account` / `connected_account_id` | no | Filter by account |
| `search` | no | Caption search |
| `limit` | no | 1–100, default 20 |

---

### `get_post`

| Param | Required |
|-------|----------|
| `post_id` | yes |

Includes per-platform publication rows and URLs when available.

---

### `publish_post`

| Param | Required | Notes |
|-------|----------|--------|
| `post_id` | yes | Draft or scheduled |
| `platforms` | no | Subset / re-target |
| `media` | no | Attach before publish |
| `platform_options` | no | |

Returns `tracking_id`. **Always poll** `get_publish_status` for multi-platform or video posts.

---

### `schedule_post`

| Param | Required | Notes |
|-------|----------|--------|
| `post_id` | yes | |
| `scheduled_at` | yes | ISO-8601, e.g. `2026-07-15T09:00:00.000Z` |
| `platforms` / `media` / `platform_options` | no | |

Convert local times to UTC unless the user specifies otherwise.

---

### `upload_media`

| Param | Required | Notes |
|-------|----------|--------|
| `file_path` | yes | Absolute path preferred; must be readable by this process |

Returns media `id` for `create_post` / `publish_now` / etc.

---

### `publish_now`

| Param | Required |
|-------|----------|
| `content` | yes |
| `platforms` | yes |
| `media` | no |
| `platform_options` | no |

Create + publish. Returns `post_id` + `tracking_id`.

---

### `schedule_content`

| Param | Required |
|-------|----------|
| `content` | yes |
| `platforms` | yes |
| `scheduled_at` | yes |
| `media` | no |
| `platform_options` | no |

---

### `get_publish_status`

| Param | Required |
|-------|----------|
| `tracking_id` | yes |

Response highlights:

| Field | Meaning |
|-------|---------|
| `overall_status` | `queued` \| `processing` \| `completed` \| `failed` \| `partial` |
| `progress` | `{ total, completed, failed }` |
| `platform_statuses` | Per-platform `phase` + messages |
| `errors` | Failed platforms only |
| `failure_reason` | Set when terminal failure / partial |

**Terminal statuses:** `completed`, `failed`, `partial`.  
**`partial`:** some platforms succeeded, some failed — inspect `errors` / `platform_statuses`.

Phases you will see: `platform_queued`, `platform_uploading`, `platform_success`, `platform_failed`.

Poll every 2–5s for video / multi-platform jobs.

---

### `suggest_best_platforms`

| Param | Required | Notes |
|-------|----------|--------|
| `content` | yes | |
| `has_media` | no | |
| `media_is_video` | no | |
| `media_type` | no | `none` \| `image` \| `video` \| `collection` |

Heuristic (+ connected accounts when available). Does not publish.

---

## Platform names

Canonical: `linkedin`, `facebook`, `instagram`, `youtube`, `pinterest`, `tiktok`, `twitter_x`, `threads`, `bluesky`.

Aliases: `x`/`twitter` → `twitter_x`; `ig` → `instagram`; `fb` → `facebook`; `yt` → `youtube`; `li` → `linkedin`; `bsky` → `bluesky`; `pin` → `pinterest`.

**Rule:** one account per platform name → name is fine. Multiple → use UUID from `list_accounts`.

---

## Recommended agent behavior

1. Call `list_accounts` before first publish in a session.  
2. Prefer `publish_now` / `schedule_content` for simple one-shots; use draft tools when the user wants to edit first.  
3. After any publish, return `tracking_id` and poll until terminal (or tell the user how to check).  
4. On `partial`, summarize which platforms failed and why.  
5. Never invent account UUIDs or tracking IDs.  
6. Never claim MCP can connect Instagram/Facebook/etc. — send users to the dashboard.  
7. For media, use absolute paths; relative paths depend on the host cwd.  
8. Schedule times: confirm timezone; default to UTC ISO-8601.

---

## Errors

MCP tools return structured text errors (`isError: true`) — they do not crash the host.

Common:

- Missing / invalid API key  
- No connected account for platform  
- Ambiguous platform (multiple accounts)  
- Validation (media type unsupported on target, empty content, etc.)  
- HTTP 401 / 429 / 4xx from API  

---

## Out of scope

- Connecting or refreshing OAuth in-app  
- Analytics / inbox / social listening  
- Dashboard-only features not exposed on `/v1`

Use https://api.social0.app/docs for full REST schemas.
