---
title: Create Post (Type Selector)
description: Choose content type before opening the form.
---

# Create Post (Type Selector)

## Route
`/dashboard/create` — choose content type before opening the form

## Purpose
"Do it manually" flow: user picks a content type (Text, Image, Video, Threads, Collection) and is sent to the corresponding create form at `/dashboard/create/[slug]`. Used when the user prefers to pick the type explicitly instead of using the composer.

## Access
- Auth required: yes
- Plan required: any
- Who sees this: all authenticated users

## Data Flow
### What it fetches
- **Session** — `auth.api.getSession({ headers })`; no session → `redirect("/")`. No DB or API calls.

### What it mutates
Nothing. Navigation only.

## Components Used
- **NewPostTypeSelector** — Client component: grid of cards from `CONTENT_TYPES` (text, image, video, threads, collection). Each card links to `/dashboard/create/{slug}` and shows platform icons from `PLATFORMS` / `PLATFORM_DISPLAY`. Uses `@/lib/content-types` and react-icons for platform/content-type icons.

## State
None on the page. NewPostTypeSelector is presentational (links only).

## Key Business Logic
- Content types and slugs come from `CONTENT_TYPES` in `@/lib/content-types`: text, image, video, threads, collection. Each has a name and list of supported platform ids.

## URL Params / Search Params
None.

## Error States
None.

## Related Pages
- `/dashboard/posts` — "Back to Posts" link
- `/dashboard/create/text` — Text post form
- `/dashboard/create/image` — Image post form
- `/dashboard/create/video` — Video post form
- `/dashboard/create/threads` — Threads form
- `/dashboard/create/collection` — Collection form

## TODO / Known Issues
None.
