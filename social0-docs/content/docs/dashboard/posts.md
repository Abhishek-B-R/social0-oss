---
title: Posts List (All Posts)
description: Paginated, filterable list of user posts.
---

# Posts List (All Posts)

## Route
`/dashboard/posts` — list of all user posts

## Purpose
Shows a paginated, filterable list of the current user's posts (drafts, scheduled, and published). Users can filter by platform, time range, and account; sort by newest or oldest; and open a post to view detail, edit, or publish. Also surfaces a payment-failed banner when the user has failed posts due to trial end and no active subscription, and a TikTok success message when arriving from TikTok publish.

## Access
- Auth required: yes
- Plan required: any
- Who sees this: all authenticated users

## Data Flow
### What it fetches
- **Session** — `auth.api.getSession({ headers })`; unauthenticated returns `null` (no redirect in code; caller may redirect).
- **Posts list data** — `getPostsListData()` from `./posts-list-data` with `userId`, `sort` (from search params, default "newest"), `platform`, `time`, `account`, `page`, `limit: POSTS_PAGE_SIZE` (18). No status filter (all statuses). Returns: `userPosts`, `publicationsByPostId`, `firstMediaByPost`, `platformOptions`, `accountOptions`, `resurfaceByPostId`, `autoPlugByPostId`, `totalCount`. Logic also fixes posts stuck in "publishing" when all publications are finished (sets post status to "published" or "partial" in DB).
- **User settings** — `getUserSettingsSnapshot()` from `@/app/actions/settings` for `use24HourTimeFormat`, `dateFormat`, `timezone` (used for timestamps).
- **Payment-failed check** — `hasPaymentFailedPosts(session.user.id)` from posts-list-data: true if user has no active tier and has at least one post with `status = 'failed'` and `failureReason` containing "Payment required".

### What it mutates
- **Indirect:** `getPostsListData` may update `posts` table for stuck "publishing" posts (set to "published" or "partial"). No direct form/button mutations on this page.

## Components Used
- **AllPostsFilters** — Client component: sort (newest/oldest), platform, time (all/week/month), account. Updates URL search params and resets `page` to 1 on change. Uses `platformOptions` and `accountOptions` from server.
- **PostListCards** — Grid of post cards. Each card: type badge, status badge, caption preview (120 chars), failure reason if failed, platform icons (max 3 + "N more"), timestamp. Links to `/dashboard/posts/[id]`. Empty state links to "Create your first post" → composer. Receives `queuedPostIds` only on scheduled tab (this page does not pass it).
- **Pagination** — `currentPage`, `totalPages`, `basePath="/dashboard/posts"`, preserves `sort`, `platform`, `time`, `account` in links.

## State
Server-only; no useState on the page. Filters and pagination are URL-driven (search params).

## Key Business Logic
- **Banners:** If `showPaymentFailedBanner` → amber banner with "Some posts failed to publish because your trial ended" and "Upgrade now" → `/dashboard/billing`. If `showTikTokMessage` (search param `tiktok_published=true`) → blue success message about TikTok processing delay.
- **Filters:** Applied in `getPostsListData`: platform and account filter by publication rows; time filter "week" / "month" uses `startOfWeek` / `startOfMonth` (week starts Monday) on `createdAt`.
- **Pagination:** `page` from search params, 1-based; offset = (page - 1) * POSTS_PAGE_SIZE. `totalCount` is post count after filters (before pagination slice).
- **Stuck publishing:** Posts with status "publishing" whose publications are all "published" are updated to "published"; if some published and some failed, updated to "partial".

## URL Params / Search Params
- `page` — 1-based page number (default 1).
- `sort` — "newest" (default) or "oldest".
- `platform` — platform id to filter (e.g. twitter_x, linkedin); empty = all.
- `time` — "all", "week", "month".
- `account` — connected account id; empty = all.
- `tiktok_published` — "true" shows TikTok success banner.

## Error States
- No session: component returns `null` (layout or parent may redirect).
- Empty list: PostListCards shows empty message and "Create your first post" CTA; with active filters, shows "No posts match your filters."

## Related Pages
- `/dashboard/composer` — Create post (header CTA)
- `/dashboard/posts/[id]` — Post detail (each card)
- `/dashboard/billing` — Upgrade (payment-failed banner)

## TODO / Known Issues
None found in page file.
