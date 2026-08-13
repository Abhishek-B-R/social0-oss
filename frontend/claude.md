# Social0 frontend — AI guidance

**Production SPA** in this folder (`frontend/`, npm name `react-frontend`): Vite + React 19 + React Router 7 → Cloudflare Pages.

**Whole-system architecture:** read root [`CLAUDE.md`](../CLAUDE.md) first (auth continue gate, publish pipeline, teams, CLI/MCP, deploy).

| Topic | Where |
| ----- | ----- |
| Routes | `src/routes/router.tsx` |
| Features | `src/features/` (`auth`, `dashboard`, `marketing`, `onboarding`, `oauth`) |
| RPC client | `src/lib/rpc.ts`, wrappers in `src/api/` |
| Auth client | `src/lib/auth-client.ts` |
| Post-auth gate | `/auth/continue` → `src/features/auth/pages/AuthContinuePage.tsx`, helpers in `src/lib/sign-in-url.ts` |
| Plans & limits | `src/lib/plans.ts` (`free` \| `starter` \| `growth` \| `pro` \| `max`) |
| Theme | `src/index.css` — dashboard tokens; landing scoped under `.landing` / `.landing-page` |
| Titles | Dashboard page titles use `font-logo` (Instrument Serif) |
| SEO bots | `functions/_middleware.ts` (OG / canonical / trailing slash) |

## Rules

- **Do not** import from `backend/` or `@social0/shared` (Pages deploys this package alone).
- **Do not** add Next.js patterns (`"use server"`, App Router, `middleware.ts`).
- API is always `backend/server` via `rpc()` / `fetchApi()` (proxy in dev).
- New dashboard UI → `features/dashboard/…` + thin `pages/…` + register in `router.tsx`.
- Auth deep links → `signInUrl(path)` (always through `/auth/continue`).

## Local

```bash
cp .env.example .env   # leave VITE_API_URL empty for proxy
npm install
npm run dev            # or from repo root: npm run dev:frontend
```

Vite proxies `/api` and `/v1` to `VITE_API_PROXY_TARGET` (default `http://localhost:3001`).
