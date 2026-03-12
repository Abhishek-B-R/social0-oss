---
title: Bulk Image Upload
description: Upload and schedule multiple images at once.
---

# Bulk Image Upload

## Route
`/dashboard/bulk-tools/image`

## Purpose
Upload and schedule multiple images at once to image-capable platforms. Plan-gated: if checkBulkToolsAllowed(userId) is false, redirects to /dashboard/billing?upgrade=1. Loads connected accounts for image platforms and passes to BulkToolsImageClient.

## Access
- Auth required: yes (redirect "/" if no session)
- Plan required: growth or pro (otherwise redirect to billing with upgrade=1)
- Who sees this: authenticated users with bulk-tools-allowed plan

## Data Flow
### What it fetches
- Session; redirect if none.
- checkBulkToolsAllowed(session.user.id) from @/lib/plan-limits; redirect to billing?upgrade=1 if false.
- connectedAccounts for userId; filter isActive !== false and platform in IMAGE_PLATFORMS (from content-types). Sort by PLATFORMS order. Add tokenExpired (NEVER_EXPIRES_PLATFORMS and skipExpiryDisplay for youtube/tiktok).

### What it mutates
None in page; BulkToolsImageClient handles upload/schedule.

## Components Used
BulkToolsImageClient — receives accounts and supportedPlatforms (IMAGE_PLATFORMS).

## State
Server-only. Client state in BulkToolsImageClient.

## Key Business Logic
Same token-expiry and platform filtering as create/[type] (skipExpiryDisplay youtube/tiktok, NEVER_EXPIRES_PLATFORMS).

## URL Params / Search Params
None.

## Error States
No session → redirect. No bulk allowed → redirect to billing.

## Related Pages
- /dashboard/bulk-tools
- /dashboard/billing?upgrade=1

## TODO / Known Issues
eslint-disable react-hooks/purity for Date.now().
