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

- **UI**: `frontend/` — React 19, Vite, React Router 7 (Cloudflare Pages)
- **API**: `backend/server/` — Fastify, Better Auth, Drizzle ORM
- **Workers**: `backend/background-worker/` (cron), `cloudflare/publish-worker/` (platform publish)
- **Database**: PostgreSQL (Neon)
- **Storage**: Cloudflare R2

## Getting started

Frontend and backend are **separate packages** (Pages builds `frontend/` only — do not link `backend/shared` into the SPA).

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# One-shot installs both trees
npm run install:all

# Or install independently (same as deploy setups)
cd backend && npm install && cd ../frontend && npm install

# Then from repo root
npm run dev
```

Useful scripts:

| Command | Description |
| --- | --- |
| `npm run install:all` | Install frontend + backend deps separately |
| `npm run dev` | Frontend + API + background worker |
| `npm run dev:frontend` | Vite SPA only (`frontend/`) |
| `npm run dev:server` | Fastify API only |
| `npm run build` | Build backend then frontend |
| `npm run build:frontend` | Frontend only (what Pages needs) |
| `npm run lint` | Frontend ESLint |
| `npm run typecheck` | Typecheck backend + frontend |

Package-specific details: [`backend/README.md`](backend/README.md), [`frontend/README.md`](frontend/README.md), [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Project structure

```
social0/
├── frontend/                 # SPA — Cloudflare Pages root directory
├── backend/
│   ├── server/               # Fastify API + publish engine
│   │   └── src/lib/publish-platforms/  # Per-platform publish (add Mastodon here)
│   ├── background-worker/    # Cron / queue consumers
│   └── shared/               # Backend-only shared package (not used by frontend)
├── cloudflare/               # Edge publish / cron / MCP workers
├── social0-cli/              # Public CLI
└── social0-mcp/              # Public MCP server
```

Platform publish lives under `backend/server/src/lib/publish-platforms/`. Prefer that layout when adding a new network.
