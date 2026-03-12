---
title: Bulk Tools
description: Upload and schedule multiple videos or images.
---

# Bulk Tools

## Route
`/dashboard/bulk-tools`

## Purpose
Landing for bulk upload: two cards — Bulk Video Upload (/dashboard/bulk-tools/video) and Bulk Image Upload (/dashboard/bulk-tools/image). Describes "Upload and schedule multiple videos or images at once." No auth check in this page (layout may enforce).

## Access
- Auth required: not checked in page
- Plan required: growth or pro for actual bulk tools (enforced on image/video sub-pages)
- Who sees this: dashboard users

## Data Flow
### What it fetches
None. CONTENT_TYPES and getPlatformIcon used for platform badges on cards.

### What it mutates
Nothing.

## Components Used
Two Link cards with platform icons (PlatformIcons from VIDEO_PLATFORMS / IMAGE_PLATFORMS from content-types).

## State
None.

## Key Business Logic
VIDEO_PLATFORMS and IMAGE_PLATFORMS from CONTENT_TYPES (video/image). PLATFORM_DISPLAY for names and colors.

## URL Params / Search Params
None.

## Error States
None.

## Related Pages
- /dashboard/bulk-tools/video
- /dashboard/bulk-tools/image
- /dashboard/billing?upgrade=1 — when plan doesn’t allow bulk tools

## TODO / Known Issues
None.
