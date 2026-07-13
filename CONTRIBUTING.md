# Contributing

## Setup

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
bun install
bun run dev
```

## Where to change things

- **Add a publish network** → `backend/server/src/lib/publish-platforms/` (one file per platform + `index.ts` dispatcher)
- **Image / video compose forms** → `frontend/src/features/dashboard/create/forms/image/` and `.../video/`
- **API / RPC** → `backend/server/src/routes` and `backend/server/src/services`
- **CLI / MCP** → `social0-cli/`, `social0-mcp/`

## Scripts

| Command | Description |
| --- | --- |
| `bun run dev` | API + worker + SPA |
| `bun run typecheck` | Backend + frontend TypeScript |
| `bun run lint` | Frontend ESLint |
| `bun run build` | Production builds |

Prefer `publishLog` (not `console.log`) in backend publish paths.
