---
title: Main Dashboard
description: Dashboard root — redirects to composer.
---

# Main Dashboard

## Route
`/dashboard` — dashboard root

## Purpose
Entry point for authenticated users. Does not render dashboard UI; immediately redirects to the composer so users land on the main creation flow.

## Access
- Auth required: yes
- Plan required: any (no plan check)
- Who sees this: logged-in users only; unauthenticated users are redirected to `/`

## Data Flow
### What it fetches
- Session via `auth.api.getSession({ headers })`. No DB or other API calls.

### What it mutates
Nothing.

## Components Used
None (redirect only).

## State
None.

## Key Business Logic
- If no session → `redirect("/")`.
- If session exists → `redirect("/dashboard/composer")`.

## URL Params / Search Params
None (redirect happens before any params are used).

## Error States
None; redirect is unconditional after auth check.

## Related Pages
- `/` — landing (when not authenticated)
- `/dashboard/composer` — target after redirect

## TODO / Known Issues
None.
