# Social0 API authentication

Social0 developer authentication is self-serve. There is no contact-sales form for the public REST API, MCP server, or CLI.

## Free tier

Create an account at https://social0.app/auth. The free plan is $0 and does not require a credit card. Pricing: https://social0.app/pricing.md

## Self-serve API keys

1. Sign in at https://social0.app/auth
2. Open https://social0.app/dashboard/api-keys
3. Create a key. Keys start with `sk_live_`.
4. Send it as `Authorization: Bearer sk_live_...` to https://api.social0.app/v1

MCP OAuth (hosted connector) uses https://mcp.social0.app/oauth/authorize instead of an API key.

## Live publish warning

`POST /v1/posts/publish`, `POST /v1/posts/{id}/publish`, and MCP `publish_now` / `publish_post` send content to real social accounts. Prefer unpublished drafts (`POST /v1/posts`) while exploring the API.

## Zero-auth endpoints

These work without an API key:

- https://api.social0.app/openapi.json
- https://api.social0.app/health
- https://mcp.social0.app/mcp `initialize`, `tools/list`, `resources/list`, `resources/read`
- https://social0.app/llms.txt
- https://social0.app/.well-known/ai-catalog.json
- https://social0.app/.well-known/api-catalog

## Errors

Unauthenticated `/v1` calls return HTTP 401 with:

```json
{ "error": { "code": "invalid_api_key", "message": "API key is invalid." } }
```

and `WWW-Authenticate: Bearer realm="Social0 API", resource_metadata="https://api.social0.app/.well-known/oauth-protected-resource"`.

OpenAPI: https://api.social0.app/openapi.json
Docs: https://docs.social0.app/docs/api
Developers: https://social0.app/developers
