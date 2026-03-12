---
title: Calendar
description: Scheduled and published posts by date.
---

# Calendar

## Route
`/dashboard/calendar`

## Purpose
Shows scheduled and published posts in a calendar view (month/week/day). Fetches user posts with status scheduled or published, joins publications for first-publish date and platform info, builds PostForCalendar list for range [now - 1 month, now + 2 months], and passes to CalendarClient with user date/time preferences.

## Access
- Auth required: yes (no session → return null)
- Plan required: any
- Who sees this: all authenticated users

## Data Flow
### What it fetches
- Session via auth.api.getSession.
- getUserSettingsSnapshot() for use24HourTimeFormat, dateFormat, timezone.
- posts where userId and status in (scheduled, published); columns id, originalContent, status, scheduledAt, createdAt.
- postPublications joined with connectedAccounts for postIds: publishedAt, platform, profileImageUrl, platformUsername, isTwitterPremium. First publication per post (earliest publishedAt) used for display date when status is published.
- displayDate for each post: scheduled → scheduledAt; published → first publication’s publishedAt else createdAt. Filter to rangeStart (subMonths(now,1)) to rangeEnd (addMonths(now,2)).
- calendarPosts: id, snippet (first 40 chars), status, displayDate (ISO), platform, profileImageUrl, platformUsername, isTwitterPremium.

### What it mutates
Nothing.

## Components Used
CalendarClient — receives posts, initialMonth (format(now, "yyyy-MM")), use24HourTimeFormat, dateFormat, timezone.

## State
Server-only. CalendarClient holds view state (month/week/day).

## Key Business Logic
Empty postIds: still render CalendarClient with empty posts. Range filter avoids loading unbounded data.

## URL Params / Search Params
None in page (CalendarClient may use params for view).

## Error States
No session → return null. Empty list → same layout with empty calendar.

## Related Pages
- Posts list and post detail (calendar items link to posts)
- Settings (timezone/date format affect display)

## TODO / Known Issues
None in page file.
