---
title: Edit Post
description: Edit a draft or scheduled post.
---

# Edit Post

## Route
`/dashboard/posts/[id]/edit`

## Purpose
Edit a draft or scheduled post. Loads post via getPostForEdit (must be owner); only draft or scheduled allowed — else notFound(). Loads connected accounts (active, token-expiry display), existing media via getPostMedia, and user date/time settings. Renders EditPostForm with post, accounts, existingMedia, and format options.

## Access
- Auth required: yes (redirect "/" if no session)
- Plan required: any
- Who sees this: post owner; post must be draft or scheduled

## Data Flow
### What it fetches
- Session; redirect if none.
- getPostForEdit(id, userId); null or status not draft/scheduled → notFound().
- connectedAccounts for userId; filtered isActive, sorted by PLATFORMS; tokenExpired computed (NEVER_EXPIRES_PLATFORMS, skipExpiryDisplay youtube/tiktok).
- getPostMedia(userId, post.mediaIds) when post has mediaIds.
- getUserSettingsSnapshot() for use24HourTimeFormat, dateFormat.

### What it mutates
EditPostForm submits updates (save draft, reschedule, publish, etc.) via server actions; page does not mutate directly.

## Components Used
Link "Back to Posts" → /dashboard/posts. EditPostForm — post, accounts (activeAccounts), existingMedia, use24HourTimeFormat, dateFormat (timezone not in read snippet; may be passed).

## State
Server-only. Form state in EditPostForm.

## Key Business Logic
Only draft and scheduled posts are editable here. EditPostForm handles content, accounts, schedule, and publish.

## URL Params / Search Params
- [id] — post id. Invalid or not draft/scheduled → notFound().

## Error States
notFound() for missing post, wrong user, or status other than draft/scheduled.

## Related Pages
- /dashboard/posts — Back to Posts
- /dashboard/posts/[id] — view post

## TODO / Known Issues
None in page file.
