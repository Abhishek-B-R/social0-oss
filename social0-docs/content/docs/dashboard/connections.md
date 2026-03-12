---
title: Connections
description: Manage connected social accounts.
---

# Connections

## Route
`/dashboard/connections` — manage connected social accounts

## Purpose
Lists the user's active connected accounts (OAuth-linked platforms), shows token status (ok / expiring_soon / expired), and supports connecting new accounts. Runs a token health check on load. TikTok accounts may show creator username/nickname from TikTok API. Displays account limit when at plan cap (e.g. for LinkedIn) to discourage adding more until upgrade.

## Access
- Auth required: yes
- Plan required: any (account limits enforced by plan)
- Who sees this: all authenticated users

## Data Flow
### What it fetches
- **Session** — `auth.api.getSession({ headers })`; no session → `redirect("/")`.
- **Token health** — `runTokenHealthCheckForUser(session.user.id)` from `@/lib/token-health` (updates DB token status/expiry as needed).
- **Accounts** — `db.query.connectedAccounts.findMany` where userId and isActive = true; columns: id, platform, platformUsername, profileImageUrl, isActive, tokenExpiresAt, tokenStatus, isTwitterPremium.
- **Account limit** — `checkAccountLimits(session.user.id, "linkedin")` from `@/lib/plan-limits` (current total vs limit; used for any platform limit display).
- **TikTok creator info** — For each TikTok account, `getTikTokCreatorInfo(accountId, userId)` from `@/lib/tiktok-creator-info`; used for creator_username and creator_nickname in display.

### What it mutates
- **Token health check** may update connectedAccounts (tokenStatus, tokenExpiresAt). No user-triggered mutations on this page (connect/disconnect handled by OAuth flows and other components).

## Components Used
- **OAuthErrorHandler** — Handles OAuth callback errors (e.g. from URL params).
- **ConnectionsList** — Renders list of accounts with avatar, platform, username (or TikTok creator nickname), token status, expires-in-days when expiring_soon. Shows account limit when at cap (currentTotal >= limitTotal). Connect buttons/links for adding accounts.
- **ConnectionsSkeleton** — Suspense fallback while ConnectionsContent loads.

## State
Server-only in the page. ConnectionsList may have client state for connect flows.

## Key Business Logic
- **Token status:** getTokenStatus(dbTokenStatus, expiresAt, platform): "expired" if DB says expired or expiresAt < now; "expiring_soon" if expires within 7 days; NEVER_EXPIRES_PLATFORMS and SKIP_EXPIRY_DISPLAY (youtube, tiktok) → "ok". expiresInDays only set when status === "expiring_soon".
- **TikTok display:** platformUsername and platformDisplayName prefer creator_username and creator_nickname from getTikTokCreatorInfo when available.
- **Account limit:** Passed to ConnectionsList when currentTotal >= limitTotal so UI can show "at limit" and link to billing/upgrade.

## URL Params / Search Params
- OAuthErrorHandler may read error params from OAuth redirects (exact keys unclear — needs investigation if documenting).

## Error States
- No session: redirect. OAuth errors: handled by OAuthErrorHandler. List empty: ConnectionsList shows empty state and connect CTAs.

## Related Pages
- `/dashboard/billing` — upgrade when at account limit
- OAuth connect routes (e.g. platform-specific connect/select pages)

## TODO / Known Issues
None in page file.
