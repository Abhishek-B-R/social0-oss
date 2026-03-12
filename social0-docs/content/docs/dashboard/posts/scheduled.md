---
title: Scheduled Posts
description: Filtered view of posts with status scheduled.
---

# Scheduled Posts

## Route
`/dashboard/posts/scheduled`

## Purpose
Filtered view of posts with status "scheduled". Same structure as All Posts but statusFilter = "scheduled", basePath and empty/filter messages tailored to scheduled. Includes QueueSuccessBanner and passes queuedPostIds to PostListCards so queued posts show "Queued" badge.

## Access
- Auth required: yes (no session → return null)
- Plan required: any
- Who sees this: all authenticated users

## Data Flow
### What it fetches
- Session; getUserSettingsSnapshot (use24HourTimeFormat, dateFormat; timezone not passed to PostListCards in code read).
- getPostsListData with statusFilter: "scheduled", same sort/platform/time/account/page/limit as main posts page. Returns queuedPostIds (pending queued_posts for scheduled posts on this page).

### What it mutates
Same as posts list (getPostsListData may fix stuck "publishing" posts). No user actions that write from this page only.

## Components Used
QueueSuccessBanner, AllPostsFilters (basePath /dashboard/posts/scheduled), PostListCards (queuedPostIds, emptyMessage "You have no scheduled posts.", filterMessage for scheduled), Pagination (basePath /dashboard/posts/scheduled).

## State
Server-only; filters and page from search params.

## Key Business Logic
Scheduled-only filter. "View all posts" links to /dashboard/posts. queuedPostIds makes cards show Queued when post is in queue.

## URL Params / Search Params
Same as All Posts: sort, platform, time, account, page.

## Error States
Empty/filtered empty handled by PostListCards. No session → null.

## Related Pages
- /dashboard/posts — View all posts
- /dashboard/composer, /dashboard/create — create/schedule

## TODO / Known Issues
getUserSettingsSnapshot timezone not passed to PostListCards in the read snippet (may be in full file).
