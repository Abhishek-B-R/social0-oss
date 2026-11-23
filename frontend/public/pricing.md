# Social0 pricing

Social0 is a multi-platform social media scheduler for creators, founders, and AI agents. Every plan includes the dashboard, REST API (`https://api.social0.app`), hosted MCP (`https://mcp.social0.app`), and the `social0` CLI. Start free; no credit card required.

Source of truth for humans: https://social0.app/pricing
Checkout: https://social0.app/dashboard/billing

Updated: 2026-11

## Plans (USD)

Two paid plans, priced by connected social accounts. Each connected profile counts once (your Instagram and your client's Instagram are 2 accounts). Yearly billing is 10× monthly: 2 months free.

| Plan | Monthly | Yearly | Connected accounts | API requests / hour |
| --- | ---: | ---: | ---: | ---: |
| Free | $0 | $0 | 3 (10 lifetime posts) | 60 |
| Creator | $29.90 | $299 | 15 | 1,000 |
| Agency | $59.90 + $1 per account above 59 | $599 + $10 per account above 59 | 59 included, no cap | 5,000 |

Agency price = $59.90 + $1 × (accounts above 59) per month, or $599 + $10 × (accounts above 59) per year. Examples: 59 accounts $59.90/mo, 60 accounts $60.90/mo, 100 accounts $100.90/mo, 200 accounts $200.90/mo.

Agency never blocks a connect. Each account over 59 is added to the bill automatically when it connects, charged pro rata for the rest of the billing period. Disconnecting one lowers the next bill (no mid-cycle refunds). Creator holds 15 accounts; connecting a 16th offers a one-click move to Agency. Free holds 3.

Starter, Growth, Pro and Max are no longer offered to new customers. Existing subscribers keep their plan, limits and price.

## Feature breakdown

### Every paid plan (Creator and Agency)

- All 9 networks: X (Twitter), LinkedIn, Instagram, TikTok, YouTube, Facebook Pages, Threads, Bluesky, and Pinterest
- Unlimited posts and scheduling
- Content types: text, image, video, threads, collections
- Calendar, drafts, and posting queue
- REST `/v1` API with API keys, hosted MCP (OAuth), local `@social0/mcp`, and the `social0` CLI
- Webhooks for post.published, post.failed, post.scheduled, post.deleted
- Bulk image and video tools
- Auto-repost and auto-plug (engagement replies)
- Multiple workspaces (multi-brand)

### Agency only

- 59 accounts included, then $1/month ($10/year) per extra account, no cap: extras are billed automatically as you connect them
- Invite teammates into shared workspaces
- Higher API limits: 5,000 requests/hour (Creator: 1,000)

### Free

- 3 connected accounts and 10 lifetime posts, no credit card
- REST API, MCP and CLI (60 requests/hour)
- Self-serve API key generation at https://social0.app/dashboard/api-keys

429 responses include `Retry-After` plus `RateLimit` / `RateLimit-*` headers.

## How to start

1. Sign up: https://social0.app/auth (free tier, no credit card)
2. Connect accounts: https://social0.app/dashboard/connections
3. Create an API key: https://social0.app/dashboard/api-keys
4. Upgrade to Creator or Agency when you need more accounts, bulk tools, or teams: https://social0.app/dashboard/billing

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
