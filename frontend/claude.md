# Social0 React Frontend — AI guidance

**Production UI** for Social0: Vite + React Router 7 SPA in `react-frontend/`.

Full stack guidance (API, workers, RPC, theming, auth funnel, deploy) lives in **[`backend/claude.md`](../backend/claude.md) §4** — read that first before editing dashboard, auth, or marketing pages here.

| Topic | Where |
| ----- | ----- |
| Routes & features | `src/routes/router.tsx`, `src/features/` |
| RPC client | `src/lib/rpc.ts`, `src/api/` |
| Auth client | `src/lib/auth-client.ts` |
| Plans & limits | `src/lib/plans.ts` |
| Dashboard theme | `src/index.css` (`.dashboard-shell` scoped tokens) |
| Legacy Next.js reference | `frontend/claude.md` (archived, not deployed) |

**Do not** add Next.js patterns (`"use server"`, App Router, `middleware.ts`). The API is always `backend/server`.
