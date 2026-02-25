# Social0 Backend API

Backend API skeleton for **Social0** — Social Media Management Platform.  
Source of truth: [PROJECT_STATUS.md](../PROJECT_STATUS.md) at repo root.

## Product

- **Name**: Social0
- **Description**: Unified dashboard to create, schedule, and publish content across multiple social platforms.

## Supported platforms

Aligned with PROJECT_STATUS.md:

| Platform   | Auth        |
|-----------|-------------|
| LinkedIn  | OAuth 2.0   |
| Facebook  | OAuth (Page)|
| Instagram | OAuth (direct or via Facebook Page) |
| YouTube   | OAuth 2.0   |
| Pinterest | OAuth       |
| TikTok    | OAuth 2.0 + PKCE |
| X (Twitter) | OAuth 2.0 + PKCE |
| Threads   | Meta Graph API |
| Bluesky   | BYOK        |
| Medium    | BYOK        |
| Hashnode  | BYOK        |
| Dev.to    | BYOK        |

## Tech

- **Runtime**: Bun
- **HTTP**: Hono
- **Port**: `PORT` env or `3000`

## API (v1 skeleton)

All under `/v1`. Auth: `Authorization: Bearer <token>` (validation TBD).

| Path | Methods | Description |
|------|--------|-------------|
| `/v1/media` | GET (list), GET `/:id`, DELETE `/:id`, POST `/create-upload-url` | Media list/get/delete; create signed upload URL |
| `/v1/posts` | GET (list), POST, GET `/:id`, PATCH `/:id`, DELETE `/:id` | Posts CRUD; list filters: `platform[]`, `status[]` |
| `/v1/post-results` | GET (list), GET `/:id` | Post publication results; list filters: `post_id[]`, `platform[]` |
| `/v1/social-accounts` | GET (list), GET `/:id` | Connected social accounts; list filters: `platform[]`, `username[]` |

List endpoints accept `offset` and `limit` (defaults 0, 10). Responses use `{ data, meta }` with `meta: { total, offset, limit, next }`.

## Post status

As per PROJECT_STATUS.md: `draft` | `scheduled` | `publishing` | `published` | `failed`.

## Run

```bash
bun run index.ts
```

---

**Last updated**: February 2026 — aligned with PROJECT_STATUS.md.
