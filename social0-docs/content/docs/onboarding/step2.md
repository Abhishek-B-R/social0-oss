---
title: Onboarding Step 2 — Goal
description: Select your goal after plan selection.
---

# Onboarding Step 2 — Goal

## Route
`/onboarding/step2` — optional `?paid=1` after checkout

## Purpose
User selects a goal (personal brand, business, clients, exploring). Selection is saved via `setOnboardingGoal(selected)` then redirect to `/onboarding/step3`. If `paid=1`, triggers billing sync and confetti animation.

## Access
- Auth required: yes (setOnboardingGoal redirects to "/" if no userId)
- Plan required: any

## Data Flow
### What it fetches
When paid=1: POST /api/billing/sync (once per mount via ref); on ok refreshes router. No initial server data.

### What it mutates
`setOnboardingGoal(selected)` from `@/app/actions/onboarding` — upserts userSettings.onboardingGoal. Then client redirect to /onboarding/step3.

## Components Used
Goal buttons (GOALS: personal_brand, business, clients, exploring), Next button. Confetti (canvas-confetti) when paid=1.

## State
selected (goal id), saving, syncAttempted (ref to run sync once).

## Key Business Logic
Sync runs only when paid=1 and !syncAttempted.current; then router.refresh(). Confetti runs when paid=1 for 2s (emerald colors).

## URL Params / Search Params
- `paid` — "1" triggers sync and confetti.

## Error States
None explicit. Saving disables Next.

## Related Pages
- `/onboarding` — plan selection
- `/onboarding/step3` — connect accounts

## TODO / Known Issues
Commented-out blockquote (testimonial) in code.
