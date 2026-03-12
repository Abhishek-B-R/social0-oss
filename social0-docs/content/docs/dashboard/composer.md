---
title: Composer
description: Quick composer that routes to the right create form.
---

# Composer

## Route
`/dashboard/composer` — quick composer that routes to the right create form

## Purpose
Lightweight entry point for creating a post: user types or pastes content and/or adds images/videos (including thread slots). On "Continue", the app chooses the target form (text, image, video, threads, collection) and passes the payload via `composer-bridge` so the create form can prefill. No auth-gating of content; plan/limits are enforced on the target create page.

## Access
- Auth required: yes
- Plan required: any
- Who sees this: all authenticated users (redirect to `/` if no session)

## Data Flow
### What it fetches
- **Session** — `auth.api.getSession({ headers })`; no session → `redirect("/")`. No other server data on this page.

### What it mutates
- **Client-only until submit:** Text, media, and thread slots live in React state. On "Continue", `setComposerPayload()` from `@/lib/composer-bridge` stores the payload in memory; then `router.push(\`/dashboard/create/${targetSlug}?fromComposer=1\`)`. The create form reads the payload with `consumeComposerPayload()` and clears it in effect cleanup.

## Components Used
- **ComposerClient** — Single client component that implements the full composer UI (textarea, media strip, thread slots, buttons). No other major components.

## State
- **text** — string; main caption/content.
- **media** — array of `ComposerMediaItem & { id }` (image or video with file, previewUrl). Reorderable by drag.
- **isThread** — boolean; toggles thread mode (multiple posts).
- **threadSlots** — array of `{ id, text, media[] }`; each slot has up to 4 media (THREAD_MAX_MEDIA_PER_POST = 4).
- **loading** — boolean during submit before navigation.
- **draggedIndex** / **threadDragged** — drag state for reordering media (main or per-slot).
- **scrollArrows** — { left, right } for horizontal media strip scroll.
- **mediaError** — string; e.g. video aspect-ratio validation message from `validateVideoAspectRatio`.

## Key Business Logic
- **Route choice:** If `isThread` → slug "threads". Else: 0 videos + N images → "image"; 1 video + 0 images → "video"; multiple videos or mixed → "collection"; else "text".
- **Paste/drop:** `onPaste` and file input add images/videos; videos are validated with `validateVideoAspectRatio` from `@/lib/video-aspect-ratio`; invalid aspect ratio sets `mediaError` and does not add the video.
- **Thread:** Max 4 media per main post and per thread slot. Turning on thread moves main content into first slot; turning off clears thread slots. Adding thread slot creates new slot with empty text and media.
- **Submit:** Requires at least main text, main media, or any thread slot content. Payload includes `text`, `isThread`, `media`, and optionally `threadPosts` (array of `{ text, media }`). Navigation adds `fromComposer=1`.
- **Scroll arrows:** Shown when media strip overflows; scroll by 100px.

## URL Params / Search Params
- None read on this page. On submit, navigates with `?fromComposer=1`.

## Error States
- **mediaError** — Displayed below the composer (e.g. aspect ratio message). No toast or boundary.
- Submit disabled when loading or when there is no content (main + thread all empty).

## Related Pages
- `/dashboard/create/[type]` — Target after Continue (text, image, video, threads, collection)
- `/dashboard/connections` — Linked from composer copy for connecting accounts

## TODO / Known Issues
None found in ComposerClient or composer page.
