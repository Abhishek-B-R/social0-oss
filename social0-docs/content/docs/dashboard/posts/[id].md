---
title: Post Detail
description: Single post view and actions.
---

# Post Detail

## Route
`/dashboard/posts/[id]` — single post view and actions

## Purpose
Shows one post's full content, media, status, and per-platform publication state. Lets the user edit (draft → create form, scheduled → edit form), publish now, retry failed/partial, delete (draft/scheduled), "Post again" (published/partial), or "Edit and post". Drafts are redirected to the appropriate create form with `?draft=id`.

## Access
- Auth required: yes
- Plan required: any
- Who sees this: post owner only; not found or wrong user → redirect to `/dashboard/posts`

## Data Flow
### What it fetches
- **Session** — `auth.api.getSession({ headers })`; no session → `redirect("/dashboard/posts")`.
- **User settings** — `getUserSettingsSnapshot()` for `use24HourTimeFormat`, `dateFormat`, `timezone`.
- **Post detail** — `getPostDetail(id, session.user.id)` from `../posts-list-data`: loads post row and joined publications (platform, status, URLs, errors, profile info). Returns `null` if not found or not owner → redirect to `/dashboard/posts`.
- **Queued slot** — When post is scheduled, `getQueuedSlotForPost(postId, userId)` returns slot id and scheduled time if there is a pending `queued_posts` row.
- **Draft handling** — If post status is "draft", page loads media via `getPostMedia(session.user.id, post.mediaIds)`, derives display type and slug, then `redirect(\`/dashboard/create/${slug}?draft=${id}\`)`.
- **Media** — For non-draft, `getPostMedia(session.user.id, post.mediaIds)` for thumbnails and video URLs.

### What it mutates
Nothing directly. Child components (`PublishButton`, `PostCardDeleteButton`, `PostAgainButton`) perform publish, delete, or resurface actions via server actions or API.

## Components Used
- **PublishButton** — Triggers publish-now/retry for the post (draft, scheduled, failed, partial).
- **PostAgainButton** — "Post again" for published/partial posts (reuse content).
- **PostCardDeleteButton** — Delete for draft or scheduled.
- **AccountAvatar** — Per-publication avatar (profile image, platform, Twitter Premium).
- **Link** — Back to posts, "Edit post" (scheduled + queued), "Edit and post" (published/partial/failed).

## State
Server-only; no local useState. Display type and thread parts are derived from `post.metadata` and `post.originalContent`.

## Key Business Logic
- **Display type** — From `metadata.contentType` if set (threads, collection, image, video, text); else from thread parts count, media count, and mime types. Maps to slug: text, image, video, threads, collection.
- **Draft** — Always redirect to `/dashboard/create/{slug}?draft={id}` so user edits in the form.
- **Scheduled + queued** — Badge shows "Queued" when `queuedSlot` exists; "Edit post" goes to create form with `?scheduled=id`.
- **Status badges** — draft, scheduled, publishing, published, partial, failed with distinct styles. Publication-level badges: Posted, Partial, Publishing, Scheduled, Failed, Pending.
- **View links** — Instagram → profile URL; TikTok (published, numeric platformPostId) → tiktok.com/@username/video/id; else `platformPostUrl`.
- **Thread display** — If thread, shows parts with optional per-part media from `metadata.twitterThread.parts` or `---`-split content.

## URL Params / Search Params
- **Dynamic:** `[id]` — post id. Invalid or not-owned → redirect to `/dashboard/posts`.

## Error States
- No session or no post / not owner: redirect to `/dashboard/posts`.
- Failed publication: per-platform error text shown; "Retry" uses PublishButton.

## Related Pages
- `/dashboard/posts` — Back to list
- `/dashboard/create/[slug]` — Edit (draft, scheduled, or edit and post) with `?draft=`, `?scheduled=`, or `?edit=`

## TODO / Known Issues
None found in page file.
