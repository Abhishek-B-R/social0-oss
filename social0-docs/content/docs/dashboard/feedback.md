---
title: Feedback
description: Canny feedback board embed.
---

# Feedback

## Route
`/dashboard/feedback`

## Purpose
Embeds Canny feedback board (vote on features, report bugs, suggest improvements). Fetches SSO token from `/api/canny/sso`, loads Canny SDK script, then calls `window.Canny("render", { boardToken, basePath, ssoToken, theme: "auto" })` into a mount div. Requires NEXT_PUBLIC_CANNY_BOARD_TOKEN.

## Access
- Auth required: yes (SSO endpoint likely requires session)
- Plan required: any
- Who sees this: authenticated users (no explicit redirect in page; 401 from SSO shows error)

## Data Flow
### What it fetches
- GET /api/canny/sso — returns { token }. 401 → "Unauthorized"; other errors → "Failed to get feedback session". Missing token → "No token received".
- Canny SDK script from https://sdk.canny.io/sdk.js (loaded client-side).

### What it mutates
None. Canny widget may submit feedback to Canny.

## Components Used
Loading bar (fixed top) until sdkLoaded && ssoToken && !error. Then either error UI (message + link to CANNY_FALLBACK_URL https://social0.canny.io) or header + div with ref (data-canny) for Canny mount.

## State
mountRef, error, ssoToken, sdkLoaded. cannyReady = sdkLoaded && ssoToken && !error. isLoading = !cannyReady && !error.

## Key Business Logic
If boardToken env missing → setError("Feedback board not configured"). If window.Canny not a function after script load → "Feedback widget not available". Render only when mountRef.current exists and no error.

## URL Params / Search Params
None.

## Error States
Error state: message "We couldn't load the feedback board" + link to open Canny in new tab. Loading bar shown until ready or error.

## Related Pages
- Dashboard sidebar may link here. More page has "Share feedback" (currently href="#") — could link to /dashboard/feedback.

## TODO / Known Issues
- eslint-disable for setState in effect (sdkLoaded, setError). More page "Share feedback" links to "#" not /dashboard/feedback.
