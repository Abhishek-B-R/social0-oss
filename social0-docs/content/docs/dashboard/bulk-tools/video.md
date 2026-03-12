---
title: Bulk Video Upload
description: Upload and schedule multiple videos at once.
---

# Bulk Video Upload

## Route
`/dashboard/bulk-tools/video`

## Purpose
Upload and schedule multiple videos at once. Plan-gated: checkBulkToolsAllowed false → redirect to /dashboard/billing?upgrade=1. Loads connected accounts for video platforms and passes to BulkToolsVideoClient.

## Access
- Auth required: yes (redirect "/" if no session)
- Plan required: growth or pro
- Who sees this: authenticated users with bulk-tools-allowed plan

## Data Flow
### What it fetches
- Session; redirect if none.
- checkBulkToolsAllowed(session.user.id); redirect to billing?upgrade=1 if false.
- connectedAccounts for userId; filter isActive and platform in VIDEO_PLATFORMS; sort by PLATFORMS; add tokenExpired (same logic as bulk-tools/image).

### What it mutates
None in page; BulkToolsVideoClient handles upload/schedule.

## Components Used
BulkToolsVideoClient — accounts, supportedPlatforms (VIDEO_PLATFORMS).

## State
Server-only. Client state in BulkToolsVideoClient.

## Key Business Logic
Same as bulk-tools/image but VIDEO_PLATFORMS from content-types.

## URL Params / Search Params
None.

## Error States
No session or no bulk allowed → redirect.

## Related Pages
- /dashboard/bulk-tools
- /dashboard/billing?upgrade=1

## TODO / Known Issues
eslint-disable react-hooks/purity for Date.now().
