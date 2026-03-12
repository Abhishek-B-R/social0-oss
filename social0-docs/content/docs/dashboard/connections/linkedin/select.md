---
title: LinkedIn Account Select
description: Select LinkedIn personal profile and company pages after OAuth.
---

# LinkedIn Account Select

## Route
`/dashboard/connections/linkedin/select` — expects `?token=...` and optional `?returnTo=...`

## Purpose
After LinkedIn OAuth, user selects which LinkedIn entities to connect: personal profile and/or company pages. Token from query is used to fetch personal profile and company pages from `/api/connect/linkedin/select?token=...`. User toggles selection and submits; POST to same API (or similar) to persist selections, then redirect to returnTo (default /dashboard/connections).

## Access
- Auth required: likely (API may require session)
- Plan required: any
- Who sees this: users completing LinkedIn connect flow

## Data Flow
### What it fetches
- GET /api/connect/linkedin/select?token=... — returns personalProfile (id, name, pictureUrl), companyPages (id, urn, name). Missing token → "Missing token", API error → setError.

### What it mutates
- POST (or similar) to persist selected personal + company pages; then redirect to returnTo.

## Components Used
Client page: state for personalProfile, companyPages, loading, submitLoading, error; selectedPersonal (boolean), selectedCompanyIds (Set). Form/UI to select and submit.

## State
personalProfile, companyPages, loading, submitLoading, error, selectedPersonal, selectedCompanyIds.

## Key Business Logic
Token required. returnTo default "/dashboard/connections". Submit sends selected entities to API.

## URL Params / Search Params
- token — required (OAuth callback token).
- returnTo — redirect after success (default /dashboard/connections).

## Error States
Missing token or API error → error state. Loading/submit loading states.

## Related Pages
- /dashboard/connections — returnTo default
- LinkedIn OAuth start (unclear path)

## TODO / Known Issues
Exact POST endpoint and body not fully read; handleSelect and submit flow in remaining file.
