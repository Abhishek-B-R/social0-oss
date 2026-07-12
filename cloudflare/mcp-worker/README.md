# Social0 Hosted MCP Worker

Remote **Streamable HTTP** MCP endpoint for Claude Connectors / one-click install, with **OAuth 2.0 + PKCE**.

Local stdio install via `npx @social0/mcp-server` is unchanged.

## Endpoint

| URL | Purpose |
|-----|---------|
| `https://mcp.social0.app/mcp` | MCP Streamable HTTP transport |
| `https://mcp.social0.app/oauth/authorize` | OAuth authorization (proxied to API) |
| `https://mcp.social0.app/oauth/token` | Token exchange |
| `https://mcp.social0.app/oauth/register` | Dynamic client registration |
| `https://mcp.social0.app/.well-known/oauth-authorization-server` | OAuth metadata |
| `https://mcp.social0.app/.well-known/oauth-protected-resource/mcp` | Protected resource metadata |
| `https://mcp.social0.app/health` | Liveness probe |

## Architecture

```
Claude / remote MCP client
        │ HTTPS + OAuth Bearer
        ▼
mcp.social0.app (this Worker)
        │ introspect token
        ▼
api.social0.app/oauth/mcp/*
        │ Social0 API key
        ▼
api.social0.app/v1/*
```

The Worker reuses the same tool handlers as `@social0/mcp-server` (stdio package). OAuth approval creates a dedicated **Claude MCP Connector** API key the user can revoke in Dashboard → API Keys.

## Prerequisites

- Cloudflare account with Workers
- Custom domain `mcp.social0.app` (or adjust `MCP_BASE_URL`)
- Backend API deployed with MCP OAuth routes enabled
- Shared secret `MCP_OAUTH_INTROSPECT_SECRET` on **both** API and Worker

## Setup

```bash
cd cloudflare/mcp-worker
npm install
cp .dev.vars.example .dev.vars
# Edit .dev.vars

# Build stdio MCP package (shared tool logic)
npm run prebuild:mcp

# Local dev
npm run dev

# Deploy
npx wrangler secret put MCP_OAUTH_INTROSPECT_SECRET
npx wrangler secret put API_BASE_URL   # https://api.social0.app
npx wrangler secret put MCP_BASE_URL   # https://mcp.social0.app
npm run deploy
```

### Cloudflare dashboard

1. Workers → **social0-mcp** → Settings → Domains → add `mcp.social0.app`
2. Ensure DNS `mcp.social0.app` proxied through Cloudflare

### Backend (`api.social0.app`)

Add to production env:

```env
MCP_BASE_URL=https://mcp.social0.app
MCP_OAUTH_INTROSPECT_SECRET=<same secret as worker>
```

Redeploy the API after setting secrets.

## OAuth flow

1. MCP client opens `GET /oauth/authorize` with PKCE (`S256`)
2. User signs in on `social0.app` and approves on `/oauth/mcp/connect`
3. Client exchanges `code` at `POST /oauth/token`
4. Client calls `POST /mcp` with `Authorization: Bearer <access_token>`

Direct API key auth also works for testing: `Authorization: Bearer sk_live_...`

## Claude Connectors Directory checklist

- [x] Remote HTTPS MCP (`/mcp`)
- [x] OAuth 2.0 + PKCE
- [x] Privacy policy link (`https://social0.app/privacy`)
- [x] Terms of service link (`https://social0.app/terms`)
- [x] Connector branding on `https://social0.app/mcp`
- [ ] Production deploy on `mcp.social0.app`
- [ ] Submit via Anthropic connector review (when open)

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Local Worker + built MCP package |
| `npm run deploy` | Deploy to Cloudflare |
| `npm run check` | Typecheck + dry-run deploy |

## Notes

- `upload_media` on hosted MCP accepts `file_base64` (+ optional `filename`, `content_type`) instead of `file_path`.
- Keep the stdio package for Cursor, Claude Desktop, VS Code, and local workflows.
