---
title: Billing
description: Subscription and usage.
---

# Billing

## Route
`/dashboard/billing` — subscription and usage

## Purpose
Shows current subscription tier, usage (connected accounts, Twitter/X tweets this month), and upgrade/change-plan actions. After a new subscription (success callback), can show a "just subscribed" state and poll for webhook sync before redirecting to composer. Upgrade banner can be shown when arriving with `?upgrade=1` (e.g. from bulk tools or feature gate).

## Access
- Auth required: yes
- Plan required: any (page explains limits and offers upgrade)
- Who sees this: all authenticated users

## Data Flow
### What it fetches
- **Session** — `auth.api.getSession({ headers })`; no session → `redirect("/")`.
- **User settings** — `getUserSettingsSnapshot()` for dateFormat, timezone (used for date display).
- **Subscription** — `getSubscriptionForUser(session.user.id)` from `@/lib/subscription` (tier, status, expiresAt, etc.).
- **Account limit** — `checkAccountLimits(session.user.id, "linkedin")` from `@/lib/plan-limits` (currentTotal, limitTotal).
- **Twitter tweet limit** — `checkTwitterTweetLimit(session.user.id)` (usage vs limit for Twitter/X).

### What it mutates
- None in the page component. BillingClient calls `/api/billing/checkout` (POST with plan) to get redirect URL for upgrade; `/api/billing/sync` (POST) and `/api/auth/subscription-check` when polling after just-subscribed.

## Components Used
- **BillingClient** — Client component: subscription state, account and tweet limits, plan cards (Starter, Growth, Pro), upgrade/change-plan buttons. When justSubscribed and tier still "free", polls sync and subscription-check (~2s interval, max ~45 attempts); on success redirects to /dashboard/composer. Shows upgrade banner when showUpgradeBanner (from ?upgrade=1). Uses formatDate for dates.

## State
- **BillingClient:** loadingPlan, loadingChangePlan (which plan button is loading), error (checkout/sync error message), waitingForWebgrade (polling after just subscribed).

## Key Business Logic
- **showUpgradeBanner:** search param upgrade=1. Banner text: "Upgrade to the Growth plan to use bulk tools, auto-plug, and auto-repost."
- **justSubscribed:** search param success=1. If tier still free, starts polling; on first successful sync or subscription-check that shows hasSubscription, redirects to /dashboard/composer.
- **Plan IDs:** From env (DODO_PAYMENTS_STARTER_PRODUCT_ID, etc.); checkout POST sends plan name (starter/growth/pro).

## URL Params / Search Params
- `upgrade` — "1" shows upgrade banner.
- `success` — "1" indicates just subscribed; triggers polling and success redirect when tier updates.

## Error States
- Checkout failure: BillingClient sets error from API response (data.error or "Failed to start checkout"). Polling timeout: waitingForWebhook set false after max attempts.

## Related Pages
- `/dashboard/composer` — redirect after successful subscription
- `/dashboard/connections` — account limit context
- External: Dodo Payments checkout URL

## TODO / Known Issues
None in page file. BillingClient has POLL_MAX_ATTEMPTS and POLL_INTERVAL_MS for webhook follow-up.
