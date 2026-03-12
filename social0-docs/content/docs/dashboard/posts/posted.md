---
title: Posted
description: Filtered view of published posts.
---

# Posted

## Route
`/dashboard/posts/posted`

## Purpose
Filtered view of posts with status "published". Same layout as All Posts: filters, PostListCards, Pagination. basePath /dashboard/posts/posted; emptyMessage "You haven't published any posts yet.", filterMessage "No posted content matches your filters."

## Access
- Auth required: yes (no session → return null)
- Plan required: any
- Who sees this: all authenticated users

## Data Flow
### What it fetches
- Session; getUserSettingsSnapshot (use24HourTimeFormat, dateFormat).
- getPostsListData with statusFilter: "published", same params as other list pages.

### What it mutates
Same as other list pages (stuck publishing fix). No page-specific mutations.

## Components Used
AllPostsFilters (basePath /dashboard/posts/posted), PostListCards, Pagination.

## State
Server-only.

## Key Business Logic
Published-only. "View all posts" → /dashboard/posts.

## URL Params / Search Params
sort, platform, time, account, page.

## Error States
Empty/filter empty via PostListCards.

## Related Pages
- /dashboard/posts
- /dashboard/posts/[id]

## TODO / Known Issues
None.
