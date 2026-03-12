---
title: Drafts
description: Filtered view of draft posts.
---

# Drafts

## Route
`/dashboard/posts/drafts`

## Purpose
Filtered view of posts with status "draft". Same layout as All Posts: filters, PostListCards, Pagination. basePath /dashboard/posts/drafts; emptyMessage "You have no drafts.", filterMessage "No drafts match your filters." No queuedPostIds (drafts are not queued).

## Access
- Auth required: yes (no session → return null)
- Plan required: any
- Who sees this: all authenticated users

## Data Flow
### What it fetches
- Session; getUserSettingsSnapshot (use24HourTimeFormat, dateFormat).
- getPostsListData with statusFilter: "draft", same params as other post list pages.

### What it mutates
Same potential as other list pages (stuck publishing fix). No page-specific mutations.

## Components Used
AllPostsFilters (basePath /dashboard/posts/drafts), PostListCards, Pagination.

## State
Server-only.

## Key Business Logic
Draft-only. "View all posts" → /dashboard/posts.

## URL Params / Search Params
sort, platform, time, account, page.

## Error States
Empty/filter empty via PostListCards.

## Related Pages
- /dashboard/posts
- /dashboard/composer, /dashboard/create

## TODO / Known Issues
None.
