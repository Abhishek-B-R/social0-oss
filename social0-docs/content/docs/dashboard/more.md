---
title: More
description: Settings and the rest of the dashboard.
---

# More

## Route
`/dashboard/more`

## Purpose
Hub page "Settings and the rest of the dashboard." Two sections: "Manual posting" (link to /dashboard/create) and "Posts & tools" (bulk tools, all posts, scheduled, posted, drafts, teams, settings, billing). One item "Share feedback" is a dead link (href="#").

## Access
- Auth required: not enforced in page (dashboard layout may enforce)
- Plan required: any
- Who sees this: dashboard users

## Data Flow
### What it fetches
None. Static links.

### What it mutates
Nothing.

## Components Used
Static list of Link components and one <a href="#"> for feedback. Icons from @tabler/icons-react.

## State
None.

## Key Business Logic
MANUAL_POSTING_LINKS: Manual setup → /dashboard/create. MORE_LINKS: Bulk tools, All posts, Scheduled, Posted, Drafts, Teams, Settings, Billing. Feedback link does not go to /dashboard/feedback.

## URL Params / Search Params
None.

## Error States
None.

## Related Pages
All links in the page (create, bulk-tools, posts, scheduled, posted, drafts, teams, settings, billing). Feedback should point to /dashboard/feedback.

## TODO / Known Issues
"Share feedback" uses href="#". Should be /dashboard/feedback.
