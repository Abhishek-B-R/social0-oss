# Social0 React Frontend

Production React + Vite rebuild of the Social0 UI. Talks to the **Fastify backend** (`backend/server`) — not Next.js server actions.

## Stack

- React 19 + Vite 6 + TypeScript
- TanStack Router + TanStack Query
- Better Auth client (cookie sessions)
- Axios API layer with SSE publish progress
- Tailwind CSS v4 + shadcn-style primitives
- Zustand (publish progress UI state)

## Quick start

```bash
cd react-frontend
cp apps/web/.env.example apps/web/.env
npm install
npm run dev
```

- **Web app:** http://localhost:5173
- **API proxy:** `/api` and `/v1` → `VITE_API_URL` (default `http://localhost:3001`)

Start the backend separately:

```bash
cd backend && bun run dev:server && bun run dev:worker
```

## Structure

```
apps/web/src/
  features/     # Domain UI (auth, composer, billing, …)
  services/     # Axios API clients (mirror backend routes)
  routes/       # TanStack Router tree
  hooks/        # React Query hooks
  stores/       # Zustand (publish SSE state)
  db/schema.ts  # Drizzle schema copy (types/reference only — no DB commands)
```

## Backend gaps (implement before full cutover)

| SPA needs | Backend status |
|-----------|----------------|
| `GET/POST /v1/posts` CRUD | Stub — port from `frontend/app/actions/posts.ts` |
| `GET /v1/settings` | Not implemented |
| `POST /v1/automations/*` | Not implemented |
| Dashboard data loaders | Were server actions — need REST BFF routes |

Everything under `/api/*` (auth, connect, publish, billing, media, queue) is wired on the backend.

## Feature build order

See `REACT_REBUILD_PROMPT.md` for the master agent prompt. Build one feature at a time:

1. ✅ Scaffold + auth + dashboard shell
2. Connections (partial — OAuth redirects work)
3. Billing (checkout/portal wired)
4. Composer + publish SSE (needs post CRUD)
5. Posts list/detail/edit
6. Calendar drag-drop
7. Settings + queue schedule
8. Automations (auto-plug, resurface)
9. Onboarding flow
10. Marketing pages (features, alternatives, legal)

## Drizzle / DB

`src/db/schema.ts` is copied from `frontend/db/schema.ts` for type reference. **Do not run migrations from this package.** Copy `frontend/db/migrations` when ready; all runtime data goes through the API.

## Branch

`cursor/backend-v2-server-engine-worker`
