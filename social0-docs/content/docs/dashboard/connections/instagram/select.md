---
title: Instagram Account Select
description: Select Facebook Page (with Instagram) after OAuth.
---

# Instagram Account Select

## Route
`/dashboard/connections/instagram/select` — expects `?token=...` and optional `?returnTo=...`

## Purpose
After Instagram/Facebook OAuth, user picks which Facebook Page (with linked Instagram) to connect. Fetches pages from `/api/connect/instagram-facebook/select?token=...` (pages with pageId, pageName, instagramUsername, instagramProfilePictureUrl). AccountPicker used to select one; handleSelect POSTs to /api/connect/instagram/select (or similar) with token, pageId, returnTo, then redirects to returnTo.

## Access
- Auth required: likely (API requires session)
- Plan required: any
- Who sees this: users completing Instagram connect flow

## Data Flow
### What it fetches
- GET /api/connect/instagram-facebook/select?token=... — returns pages array; mapped to AccountPickerAccount (id: pageId, name: pageName + @username, pictureUrl).

### What it mutates
- handleSelect(pageId): POST /api/connect/instagram/select (or equivalent) with token, pageId, returnTo; on success redirect to returnTo.

## Components Used
AccountPicker from @/components/AccountPicker — receives accounts, loading, error, onSelect. Page provides accounts from API and handleSelect.

## State
accounts, loading, submitLoading, error. Token and returnTo from searchParams.

## Key Business Logic
Missing token → "Missing token". returnTo default "/dashboard/connections". Single selection then submit.

## URL Params / Search Params
- token — required.
- returnTo — default /dashboard/connections.

## Error States
Missing token or fetch error; submit error from API.

## Related Pages
- /dashboard/connect/instagram-facebook/select — redirects here with same params
- /dashboard/connections

## TODO / Known Issues
None.
