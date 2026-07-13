# Social0

Unified social media management platform to create, schedule, and publish content across multiple platforms.

## Features

- **Multi-platform publishing**: LinkedIn, Instagram, YouTube, Pinterest, TikTok, X (Twitter), Threads, Bluesky, Facebook
- **Content types**: Text, Images, Videos, Threads, Collections
- **Smart scheduling**: Schedule posts for optimal engagement
- **Secure token management**: Enterprise-grade encryption for OAuth tokens
- **Media storage**: Cloudflare R2 integration for images and videos

See [`FEATURES.md`](FEATURES.md) for the full product feature list.

## Tech stack (production)

- **UI**: `frontend/` — React 19, Vite, React Router 7
- **API**: `backend/server/` — Fastify, Better Auth, Drizzle ORM
- **Workers**: `backend/background-worker/` (cron), `cloudflare/publish-worker/` (platform publish)
- **Database**: PostgreSQL (Neon)
- **Storage**: Cloudflare R2

## Getting started

From the repo root (Bun recommended):

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

bun install
bun run dev
```

That starts the API (`:3001`), background worker, and SPA (`:3000`) together.

Useful scripts:

| Command | Description |
| --- | --- |
| `bun run dev` | Frontend + API + background worker |
| `bun run dev:frontend` | Vite SPA only |
| `bun run dev:server` | Fastify API only |
| `bun run dev:worker` | Background worker only |
| `bun run build` | Build shared, backend, and frontend |
| `bun run lint` | Frontend ESLint |
| `bun run typecheck` | Typecheck backend + frontend |

Package-specific details: [`backend/README.md`](backend/README.md), [`frontend/README.md`](frontend/README.md), [`backend/claude.md`](backend/claude.md).

## Project structure

```
social0/
├── frontend/                 # Production SPA
├── backend/
│   ├── server/               # Fastify API + publish engine
│   │   └── src/lib/publish-platforms/  # Per-platform publish (add Mastodon here)
│   ├── background-worker/    # Cron / queue consumers
│   └── shared/               # Shared backend packages
├── cloudflare/               # Edge publish / cron / MCP workers
├── social0-cli/              # Public CLI
└── social0-mcp/              # Public MCP server
```

Platform publish lives under `backend/server/src/lib/publish-platforms/` (`twitter`/`x` and LinkedIn use dedicated media helpers; Meta/TikTok/YouTube/etc. are one file each). Prefer that layout when adding a new network.
