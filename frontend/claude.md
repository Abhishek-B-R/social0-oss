# Social0 frontend: AI guidance

**Production SPA** in this folder (`frontend/`, npm name `react-frontend`): Vite + React 19 + React Router 7 → Cloudflare Pages.

**Whole-system architecture:** read root [`CLAUDE.md`](../CLAUDE.md) first (auth continue gate, publish pipeline, analytics/inbox, teams, CLI/MCP, deploy).

| Topic | Where |
| ----- | ----- |
| Routes | `src/routes/router.tsx` |
| Features | `src/features/` (`auth`, `dashboard`, `marketing`, `onboarding`, `oauth`) |
| RPC client | `src/lib/rpc.ts`, wrappers in `src/api/` |
| Auth client | `src/lib/auth-client.ts` |
| Post-auth gate | `/auth/continue` → `src/features/auth/pages/AuthContinuePage.tsx`, helpers in `src/lib/sign-in-url.ts` |
| Legal consent | `src/components/auth/LegalConsentGate.tsx` → `/api/legal/status` + `/accept` |
| Analytics | `src/features/dashboard/analytics/`, `src/api/analytics.ts` |
| Inbox | `src/features/dashboard/inbox/`, `src/api/inbox.ts` |
| Live platforms | **Backend only**: `analytics.listAccounts` / `inbox.listAccounts`. Do not add a frontend `LIVE_PLATFORMS` map |
| Plans & limits | `src/lib/plans.ts` (`free` \| `creator` \| `agency`; legacy `starter` \| `growth` \| `pro` \| `max` kept for existing subscribers). Prices: `src/lib/plan-pricing.ts` |
| Theme | `src/index.css`: dashboard semantic tokens (`bg-accent`, `text-accent`, …), emerald brand `#10b981`; landing scoped under `.landing` / `.landing-page`. Do not restyle landing when tweaking dashboard tokens |
| Titles | Dashboard page titles: `.dash-page-title` / `PageHeader` (DM Sans 600). Instrument Serif is marketing + wordmark only |
| UI kit | `src/components/app` (see its README): PageHeader, StatusPill, NetworkStack, Tabs, FilterChips, DataTable, Drawer, ⌘K palette, `openComposer`, `useDashboardPath` |
| SEO bots | `functions/_middleware.ts` (OG / canonical / trailing slash) |

## Rules

- **Do not** import from `backend/` or `@social0/shared` (Pages deploys this package alone).
- **Do not** add Next.js patterns (`"use server"`, App Router, `middleware.ts`).
- API is always `backend/server` via `rpc()` / `fetchApi()` (proxy in dev).
- New dashboard UI → `features/dashboard/…` + thin `pages/…` + register in `router.tsx`.
- Auth deep links → `signInUrl(path)` (always through `/auth/continue`).
- Team-scoped pages reuse the same components under `/dashboard/teams/:teamId/*`.

## High-signal routes

| Path | Notes |
| ---- | ----- |
| `/dashboard/home` | Default app home (`/dashboard` redirects here) |
| `/dashboard/new` | Full-page one-screen composer; also opens as a modal anywhere (`openComposer`, shortcut C). Edit links: `new?draft=` / `new?scheduled=` / `new?edit=` |
| `/dashboard/composer`, `/create`, `/create/:type` | Old entry points: render the same composer (keep `?edit/?draft/?scheduled`; `create/threads` starts a thread) |
| `/dashboard/calendar` | Month / week / list, drag to reschedule, day drawer |
| `/dashboard/connections` | Accounts (`?connect=1`, `?account=<id>`); `/dashboard?error=` from OAuth lands here |
| `/dashboard/automations`, `/bulk-tools` | Rules list; bulk import wizard (locked plans see a panel, no redirect) |
| `/dashboard/settings/:section` | Grouped settings, autosave; old `#hash` tabs, `/workspaces`, `/teams` redirect here. Settings takes over the shell: `DashboardLayout` swaps in `SettingsSidebar` / `SettingsMobileBar` (`features/dashboard/settings/SettingsNav.tsx`); sections are borderless `SettingsCard` + `SettingsRow` |
| `/dashboard/posts?tab=` | One list with tabs; old `/posts/drafts|scheduled|posted` redirect |
| `/dashboard/posts/:id` | Detail; analytics panel starts collapsed |
| `/dashboard/analytics`, `/inbox` | Not plan-gated |
| `/dashboard/agents?tab=` | AI agents · API keys · Webhooks (`/api-keys` redirects) |
| `/dashboard/more` | Mobile overflow |
| `/auth/forgot-password`, `/auth/reset-password` | Password reset |

## Local

```bash
cp .env.example .env   # leave VITE_API_URL empty for proxy
npm install
npm run dev            # or from repo root: npm run dev:frontend
```

Vite proxies `/api` and `/v1` to `VITE_API_PROXY_TARGET` (default `http://localhost:3001`).
