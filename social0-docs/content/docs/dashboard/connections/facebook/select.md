---
title: Facebook Account Select
description: Select Facebook Page after OAuth.
---

# Facebook Account Select

## Route
`/dashboard/connections/facebook/select` — expects `?token=...` and optional `?returnTo=...`

## Purpose
After Facebook OAuth, user selects which Facebook Page to connect. Fetches pages from `/api/connect/facebook/select?token=...` (pages: id, name, pictureUrl). AccountPicker for selection; handleSelect POSTs to /api/connect/facebook/select with token, pageId, returnTo, then redirects to returnTo.

## Access
- Auth required: likely
- Plan required: any
- Who sees this: users completing Facebook connect flow

## Data Flow
### What it fetches
- GET /api/connect/facebook/select?token=... — returns pages (id, name, pictureUrl).

### What it mutates
- POST /api/connect/facebook/select with { token, pageId, returnTo }; redirect on success.

## Components Used
AccountPicker — accounts, loading, error, onSelect (handleSelect).

## State
accounts, loading, submitLoading, error. token, returnTo from searchParams.

## Key Business Logic
Missing token → "Missing token". returnTo default "/dashboard/connections".

## URL Params / Search Params
- token — required.
- returnTo — default /dashboard/connections.

## Error States
Missing token; API errors on fetch or submit.

## Related Pages
- /dashboard/connections

## TODO / Known Issues
None.
