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

- **UI**: `react-frontend/` — React 19, Vite, React Router 7
- **API**: `backend/server/` — Fastify, Better Auth, Drizzle ORM
- **Workers**: `backend/background-worker/` (cron), `cloudflare/publish-worker/` (platform publish)
- **Database**: PostgreSQL (Neon)
- **Storage**: Cloudflare R2

## Getting started

```bash
# API
cd backend && cp .env.example .env && bun install && bun run dev:server   # :3001

# SPA (separate terminal)
cd react-frontend && cp .env.example .env && bun install && bun run dev   # :3000
```

Details: [`backend/README.md`](backend/README.md), [`react-frontend/README.md`](react-frontend/README.md), [`backend/claude.md`](backend/claude.md).

## Project structure

```
social0/
├── react-frontend/    # Production SPA (live UI)
├── backend/           # Production API + cron worker
├── cloudflare/        # Publish worker (edge)
├── social0-docs/      # Product documentation site
└── frontend/          # Legacy Next.js (archived, not deployed)
```
