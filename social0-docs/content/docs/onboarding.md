---
title: Onboarding — Choose Plan
description: First onboarding step (plan selection).
---

# Onboarding — Choose Plan

## Route
`/onboarding` — first onboarding step (plan selection)

## Purpose
New users (e.g. after verify-email) choose a paid plan: Starter, Growth, or Pro. Each button calls `/api/billing/checkout` with plan and successUrl `/onboarding/step2?paid=1`; on success redirects to Dodo checkout. "I'll decide later" links to `/onboarding/step2` without paid param.

## Access
- Auth required: unclear — page does not check session; typically reached after verify-email redirect (needs investigation).
- Plan required: none (this is where user picks plan)

## Data Flow
### What it fetches
None. Client-only.

### What it mutates
POST /api/billing/checkout with { plan, successUrl: "/onboarding/step2?paid=1" }. Redirects to data.url (checkout).

## Components Used
Static plan cards (Starter $6, Growth $19, Pro $33 early adopter), feature lists, buttons.

## State
loadingPlan ("starter" | "growth" | "pro" | null), error.

## Key Business Logic
Early adopter pricing displayed. Growth marked "Most popular". Error from API shown above cards.

## URL Params / Search Params
None.

## Error States
API error shown in red banner (data.error or "Failed to start checkout").

## Related Pages
- `/onboarding/step2` — next (with or without ?paid=1)
- External: Dodo Payments checkout

## TODO / Known Issues
None.
