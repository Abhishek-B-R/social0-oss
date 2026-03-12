---
title: Onboarding Step 4 — Complete
description: Final onboarding step and redirect.
---

# Onboarding Step 4 — Complete

## Route
`/onboarding/step4`

## Purpose
Marks onboarding complete and shows final client UI. Server calls `setOnboardingCompleted()` (upserts userSettings.onboardingCompleted = true), then renders OnboardingStep4Client (likely "You're all set" and link to dashboard).

## Access
- Auth required: yes (setOnboardingCompleted redirects to "/" if no userId)
- Plan required: any

## Data Flow
### What it fetches
None; setOnboardingCompleted runs first.

### What it mutates
`setOnboardingCompleted()` from `@/app/actions/onboarding` — sets userSettings.onboardingCompleted = true for current user.

## Components Used
OnboardingStep4Client — client component for final screen (exact content not read here).

## State
None on server. Client state in OnboardingStep4Client.

## Key Business Logic
Onboarding completion is persisted before rendering so subsequent app loads see onboardingCompleted.

## URL Params / Search Params
None.

## Error States
None documented in page.

## Related Pages
- `/onboarding/step3` — previous
- `/dashboard/composer` or `/dashboard` — typical next destination

## TODO / Known Issues
None.
