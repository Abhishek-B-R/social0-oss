---
title: Instagram/Facebook Select (Redirect)
description: Redirects to canonical Instagram select page.
---

# Instagram/Facebook Select (Redirect)

## Route
`/dashboard/connect/instagram-facebook/select`

## Purpose
Redirect to the canonical Instagram select page preserving token and returnTo. Client-side: useEffect builds URL `/dashboard/connections/instagram/select?token=...&returnTo=...` and window.location.replace. Shows "Redirecting…" while effect runs.

## Access
- Auth required: not checked (redirect target may require auth)
- Plan required: any
- Who sees this: users hitting legacy/alternate Instagram-Facebook select URL

## Data Flow
### What it fetches
None. Reads searchParams for token and returnTo.

### What it mutates
None (browser navigation only).

## Components Used
Paragraph "Redirecting…". No AccountPicker or form.

## State
searchParams (token, returnTo). Effect runs once (or when searchParams change) and replaces location.

## Key Business Logic
Canonical path is /dashboard/connections/instagram/select. Query params preserved.

## URL Params / Search Params
- token — passed through to target.
- returnTo — passed through to target.

## Error States
None. Always redirects (with or without params).

## Related Pages
- /dashboard/connections/instagram/select — target

## TODO / Known Issues
None.
