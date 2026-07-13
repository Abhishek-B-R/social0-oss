# Contributing

## Setup

Frontend and backend install separately — Cloudflare Pages deploys `frontend/` alone and must not depend on `backend/shared`.

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

npm run install:all
# equivalent:
#   npm install --prefix backend
#   npm install --prefix frontend

npm run dev
```

## Where to change things

- **Add a publish network** → `backend/server/src/lib/publish-platforms/` (one file per platform + `index.ts` dispatcher)
- **Image / video compose forms** → `frontend/src/features/dashboard/create/forms/image/` and `.../video/`
- **API / RPC** → `backend/server/src/routes` and `backend/server/src/services`
- **CLI / MCP** → `social0-cli/`, `social0-mcp/`

## Scripts

| Command | Description |
| --- | --- |
| `npm run install:all` | Install frontend + backend independently |
| `npm run dev` | API + worker + SPA |
| `npm run build:frontend` | Frontend production build (Pages) |
| `npm run typecheck` | Backend + frontend TypeScript |
| `npm run lint` | Frontend ESLint |

Prefer `publishLog` (not `console.log`) in backend publish paths.
