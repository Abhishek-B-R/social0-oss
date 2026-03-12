---
title: Create Post by Type
description: Dynamic form for text, image, video, threads, or collection.
---

# Create Post by Type (text / image / video / threads / collection)

## Route
`/dashboard/create/[type]` — dynamic: `text`, `image`, `video`, `threads`, `collection`

## Purpose
Renders the correct post-creation form (TextPostForm, ImagePostForm, VideoPostForm, ThreadsPostForm, CollectionPostForm) for the given type. Loads the user's connected accounts (filtered by content-type platforms and active/token health), user settings (date/time format, timezone), and plan limits (resurface, auto-plug). Supports draft prefill (`?draft=id`), scheduled edit (`?scheduled=id`), and edit-and-repost (`?edit=id`).

## Access
- Auth required: yes
- Plan required: any (limits like resurface/auto-plug are feature-flagged by plan)
- Who sees this: authenticated users; invalid `type` → 404 notFound()

## Data Flow
### What it fetches
- **Session** — `auth.api.getSession({ headers })`; no session → `redirect("/")`.
- **Content type** — `getContentTypeBySlug(typeSlug)` from `@/lib/content-types`; undefined → `notFound()`.
- **Accounts** — `db.query.connectedAccounts.findMany` for `session.user.id`, columns: id, platform, platformUsername, profileImageUrl, isActive, tokenExpiresAt, tokenStatus, platformMetadata, isTwitterPremium. Filtered to `isActive !== false` and platform in contentType.platforms. Sorted by `PLATFORMS` order. Each account gets `tokenExpired` from token health (NEVER_EXPIRES_PLATFORMS and skipExpiryDisplay for youtube/tiktok).
- **User settings** — `db.query.userSettings.findFirst` for userId: use24HourTimeFormat, dateFormat, timezone, subscriptionTier, subscriptionExpiresAt. DateFormat validated (dd/MM/yyyy, MM/dd/yyyy, yyyy-MM-dd); timezone default "UTC". Effective tier: if subscriptionExpiresAt past → "free"; else starter/growth/pro or "free".
- **Plan limits** — `getPlanLimits(effectiveTier)` for allowResurface, allowAutoPlug; passed to form as allowAutoRepost, allowAutoPlug.

### What it mutates
Nothing in the page component. Forms submit via server actions (save draft, schedule, publish, etc.).

## Components Used
- **TextPostForm** — type === "text"
- **ImagePostForm** — type === "image"
- **VideoPostForm** — type === "video"
- **ThreadsPostForm** — type === "threads"
- **CollectionPostForm** — type === "collection"

Each form receives: accounts (filtered), use24HourTimeFormat, dateFormat, timezone, draftId, scheduledId, editId, allowAutoRepost, allowAutoPlug, supportedPlatforms.

## State
Server-only in the page. Form state lives inside each form component.

## Key Business Logic
- **Slug → form:** FORM_MAP[contentType.slug] (text, image, video, threads, collection). Slug comes from URL param `type`.
- **Search params:** draft, scheduled, edit — each can be string or single-element array; normalized to a single id string or undefined.
- **Token expiry:** YouTube and TikTok skip expiry display; other platforms use tokenStatus and tokenExpiresAt. NEVER_EXPIRES_PLATFORMS never show expired.

## URL Params / Search Params
- **Dynamic:** `[type]` — one of text, image, video, threads, collection. Else 404.
- `draft` — post id to load as draft (prefill form).
- `scheduled` — post id to edit as scheduled (reschedule/edit).
- `edit` — post id to edit and repost (published/partial/failed).
- `fromComposer` — set by composer; forms use it to consume composer payload.

## Error States
- Invalid type: notFound().
- No session: redirect("/").

## Related Pages
- `/dashboard/composer` — often the entry with fromComposer=1
- `/dashboard/create` — type selector
- `/dashboard/posts`, `/dashboard/posts/[id]` — after save or cancel

## TODO / Known Issues
- eslint-disable-next-line react-hooks/purity for `const now = Date.now()` in the page (used for token expiry display).
