---
title: Queue
description: Queue is not a dedicated page; behavior via Settings and API.
---

# Queue

## Route
`/dashboard/queue`

## Status: NOT IMPLEMENTED

There is no dedicated queue page at `app/dashboard/queue/page.tsx`. Queue behavior is implemented via:

- **API routes:** `/api/queue/slots`, `/api/queue/slots/[id]`, `/api/queue/next-slot`, `/api/queue/add` — manage queue slots and adding posts to the queue.
- **Cron:** `/api/cron/publish-scheduled` — publishes scheduled/queued posts.
- **UI surfaces:** Queue schedule and controls appear in **Settings** (Queue tab) via `QueueScheduleSection`, and in the create flow via `SchedulePostSidebar` (scheduling a post can add it to a queue slot).
- **Posts list:** Scheduled posts with a pending `queued_posts` row show a "Queued" badge and queued slot info on post detail.

For full queue behavior, see: Settings (Queue tab), SchedulePostSidebar, posts-list-data (queuedPostIds, getQueuedSlotForPost), and the queue API routes.
