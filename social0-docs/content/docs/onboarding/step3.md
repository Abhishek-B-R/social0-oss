---
title: Onboarding Step 3 — Connect Accounts
description: Connect social accounts during onboarding.
---

# Onboarding Step 3 — Connect Accounts

## Route
`/onboarding/step3`

## Purpose
User connects social accounts. Server loads current connected accounts and account limit (plan); ConnectStepClient shows account list and connect CTAs. When user finishes, they proceed to step 4.

## Access
- Auth required: yes (redirect to "/" if no session)
- Plan required: any (limit shown from checkAccountLimits)

## Data Flow
### What it fetches
- Session via auth.api.getSession.
- connectedAccounts for userId, isActive = true (id, platform, platformUsername, profileImageUrl, isActive, isTwitterPremium).
- checkAccountLimits(userId, "linkedin") for limitTotal.

### What it mutates
Connect/disconnect performed inside ConnectStepClient (OAuth and API); page itself does not mutate.

## Components Used
ConnectStepClient — receives initialAccounts and limitTotal, renders list and connect flows.

## State
Server passes initialAccounts and limitTotal; client state inside ConnectStepClient.

## Key Business Logic
accounts normalized to array. limitTotal used to show "at limit" when applicable.

## URL Params / Search Params
None.

## Error States
Handled inside ConnectStepClient.

## Related Pages
- `/onboarding/step2` — previous
- `/onboarding/step4` — next

## TODO / Known Issues
None in page file.
