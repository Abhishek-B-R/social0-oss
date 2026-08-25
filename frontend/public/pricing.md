# Social0 pricing

Social0 is a multi-platform social media scheduler for creators, founders, and AI agents. Every plan includes the dashboard, REST API (`https://api.social0.app`), hosted MCP (`https://mcp.social0.app`), and the `social0` CLI. Start free; no credit card required.

Source of truth for humans: https://social0.app/pricing
Checkout: https://social0.app/dashboard/billing

## Plan tiers (USD)

Early-adopter monthly prices. Yearly billing is listed beside each paid plan.

| Plan | Monthly | Yearly | Connected accounts | Highlights |
| --- | ---: | ---: | ---: | --- |
| Free | $0 | $0 | 3 | 10 lifetime posts, REST API, MCP, CLI |
| Starter | $9 | $99 | 5 | Unlimited posts on the plan, extra accounts, extra workspaces |
| Growth | $19 (list $29) | $199 (list $299) | 15 | Bulk image/video tools, auto-repost, auto-plug |
| Pro | $35 (list $49) | $349 (list $499) | 50 | Teams, higher limits |
| Max | $59 (list $99) | $599 (list $999) | effectively unlimited | Highest API quota and account ceiling |

## Feature breakdown

### Included on every plan

- Compose once and publish or schedule to X (Twitter), LinkedIn, Instagram, TikTok, YouTube, Facebook Pages, Threads, Bluesky, and Pinterest
- Content types: text, image, video, threads, collections
- Calendar, drafts, and posting queue
- REST `/v1` API with API keys
- Hosted MCP (OAuth) and local `@social0/mcp`
- `social0` CLI
- Webhooks for post.published, post.failed, post.scheduled, post.deleted
- Free sign-up and self-serve API key generation at https://social0.app/dashboard/api-keys

### Growth and above

- Bulk image tools
- Bulk video tools
- Auto-repost
- Auto-plug (engagement replies)

### Pro and Max

- Invite teammates into a shared workspace
- Higher connected-account and API request limits

## API request quotas (REST `/v1`)

Approximate hourly request caps used for rate-limit headers:

| Plan | Requests / hour |
| --- | ---: |
| Free | 60 |
| Starter | 300 |
| Growth | 1,000 |
| Pro | 5,000 |
| Max | 10,000 |

429 responses include `Retry-After` plus `RateLimit` / `RateLimit-*` headers.

## How to start

1. Sign up: https://social0.app/auth (free tier, no credit card)
2. Connect accounts: https://social0.app/dashboard/connections
3. Create an API key: https://social0.app/dashboard/api-keys
4. Upgrade when you need more accounts, bulk tools, or teams: https://social0.app/dashboard/billing

## MCP and CLI

- Hosted MCP (OAuth, Streamable HTTP): https://mcp.social0.app/mcp
- Server card: https://social0.app/.well-known/mcp/server-card.json
- npm MCP: `npx -y @social0/mcp` with `SOCIAL0_API_KEY`
- CLI: `npm i -g social0` then `social0 login`

MCP tools: list_accounts, create_draft, update_draft, delete_draft, list_posts, get_post, publish_post, schedule_post, upload_media, publish_now, schedule_content, get_publish_status, suggest_best_platforms.

## OAuth scopes (machine-readable)

Declared in OpenAPI and RFC 9728 metadata:

- me:read
- accounts:read / accounts:write
- posts:read / posts:write
- media:write
- jobs:read
- webhooks:read / webhooks:write
- social0:read / social0:write (MCP umbrella)

Metadata: https://api.social0.app/.well-known/oauth-protected-resource

## Agent notes

- Prefer the free tier or a test key for dry runs. Publishing to live networks is real.
- Idempotency-Key is supported on `POST /v1/posts/publish` and `POST /v1/posts/{id}/publish`.
- Long-running publishes return `202 Accepted` with `Location: /v1/jobs/{tracking_id}`.

Questions: support@social0.app
