# Social0 React Frontend

Plain React + Vite SPA that mirrors `frontend/` (Next.js). All server logic lives in `backend/server`.

## Setup

```bash
cd react-frontend
npm install
cp .env.example .env
```

Run the API (`backend/server`) on port **3001** in a separate terminal, then:

```bash
# Terminal 1 — API (loads env from backend/.env)
cd backend/server && npm run dev

# Terminal 2 — SPA
cd react-frontend && npm run dev
```

The Vite dev server proxies `/api` and `/v1` to `VITE_API_PROXY_TARGET` (default `http://localhost:3001`). Leave `VITE_API_URL` empty in dev so the browser uses same-origin `/api` through the proxy.

## Architecture

- **`src/components/`**, **`src/lib/`** — shared UI and client utilities (ported from Next.js)
- **`src/features/`** — feature UI (auth, dashboard, onboarding, marketing)
- **`src/actions/`** — thin RPC clients calling `POST /api/rpc` on the backend BFF
- **`src/pages/`** + **`src/routes/router.tsx`** — React Router DOM route tree
- **Backend** — `backend/server/src/bff/actions/*` holds the former Next.js server actions

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Vite dev server (port 5173) |
| `npm run build` | Production build |
| `npm run typecheck` | TypeScript check |
