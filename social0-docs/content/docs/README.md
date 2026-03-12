---
title: Developer Documentation
description: Per-page documentation and architecture for the Social0 frontend.
---

# Social0 Frontend — Developer Documentation

This folder contains per-page documentation for the Next.js app router frontend. Each doc describes route, purpose, access, data flow, components, state, business logic, URL params, error states, and related pages.

---

## Documented pages

| Route | Doc |
|-------|-----|
| `/` | [index.md](index.md) — Landing |
| `/auth` | [auth.md](auth.md) |
| `/auth/forgot-password` | [auth/forgot-password.md](auth/forgot-password.md) |
| `/auth/reset-password` | [auth/reset-password.md](auth/reset-password.md) |
| `/auth/verify-email` | [auth/verify-email.md](auth/verify-email.md) |
| `/onboarding` | [onboarding.md](onboarding.md) |
| `/onboarding/step2` | [onboarding/step2.md](onboarding/step2.md) |
| `/onboarding/step3` | [onboarding/step3.md](onboarding/step3.md) |
| `/onboarding/step4` | [onboarding/step4.md](onboarding/step4.md) |
| `/privacy` | [privacy.md](privacy.md) |
| `/terms` | [terms.md](terms.md) |
| `/dashboard` | [dashboard.md](dashboard.md) |
| `/dashboard/composer` | [dashboard/composer.md](dashboard/composer.md) |
| `/dashboard/create` | [dashboard/create.md](dashboard/create.md) |
| `/dashboard/create/[type]` (text, image, video, threads, collection) | [dashboard/create-type.md](dashboard/create-type.md) |
| `/dashboard/posts` | [dashboard/posts.md](dashboard/posts.md) |
| `/dashboard/posts/[id]` | [dashboard/posts/[id].md](dashboard/posts/[id].md) |
| `/dashboard/posts/[id]/edit` | [dashboard/posts/[id]/edit.md](dashboard/posts/[id]/edit.md) |
| `/dashboard/posts/scheduled` | [dashboard/posts/scheduled.md](dashboard/posts/scheduled.md) |
| `/dashboard/posts/drafts` | [dashboard/posts/drafts.md](dashboard/posts/drafts.md) |
| `/dashboard/posts/posted` | [dashboard/posts/posted.md](dashboard/posts/posted.md) |
| `/dashboard/connections` | [dashboard/connections.md](dashboard/connections.md) |
| `/dashboard/connections/linkedin/select` | [dashboard/connections/linkedin/select.md](dashboard/connections/linkedin/select.md) |
| `/dashboard/connections/instagram/select` | [dashboard/connections/instagram/select.md](dashboard/connections/instagram/select.md) |
| `/dashboard/connections/facebook/select` | [dashboard/connections/facebook/select.md](dashboard/connections/facebook/select.md) |
| `/dashboard/connect/instagram-facebook/select` | [dashboard/connect/instagram-facebook/select.md](dashboard/connect/instagram-facebook/select.md) |
| `/dashboard/settings` | [dashboard/settings.md](dashboard/settings.md) |
| `/dashboard/billing` | [dashboard/billing.md](dashboard/billing.md) |
| `/dashboard/queue` | [dashboard/queue.md](dashboard/queue.md) — *not implemented (stub)* |
| `/dashboard/feedback` | [dashboard/feedback.md](dashboard/feedback.md) |
| `/dashboard/calendar` | [dashboard/calendar.md](dashboard/calendar.md) |
| `/dashboard/more` | [dashboard/more.md](dashboard/more.md) |
| `/dashboard/bulk-tools` | [dashboard/bulk-tools.md](dashboard/bulk-tools.md) |
| `/dashboard/bulk-tools/image` | [dashboard/bulk-tools/image.md](dashboard/bulk-tools/image.md) |
| `/dashboard/bulk-tools/video` | [dashboard/bulk-tools/video.md](dashboard/bulk-tools/video.md) |
| `/dashboard/teams` | [dashboard/teams.md](dashboard/teams.md) — *coming soon* |
| `/dashboard/api-keys` | [dashboard/api-keys.md](dashboard/api-keys.md) — *coming soon* |

---

## High-level architecture

### Auth flow
- **Session:** Server uses `auth.api.getSession({ headers })` (from `@/lib/auth`). Client uses `useSession()` from `@/lib/auth-client` where needed (e.g. landing header).
- **Sign-in:** `/auth` — email+password via `signIn.email()`, Google via `signIn.social({ provider: "google" })`. Callback URL is `/dashboard/composer`.
- **Sign-up:** POST to `/api/auth/sign-up` or sign-up-with-turnstile; optional Turnstile when `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is set. Success often redirects to `/auth/verify-email?email=...`.
- **Verify email:** 6-digit OTP via `authClient.emailOtp.verifyEmail`; success → `/onboarding`.
- **Password reset:** Forgot password requests OTP; reset-password page submits OTP + new password; success → `/auth?reset=success`.
- **Protected routes:** Dashboard pages typically redirect to `/` or `/auth` when there is no session. Some (e.g. billing, bulk-tools) redirect to `/dashboard/billing?upgrade=1` when plan does not allow the feature.

### Data layer
- **Database:** Drizzle ORM (`@/db`, `@/db/schema`). Main entities: user, userSettings, account, connectedAccounts, posts, postPublications, mediaUploads, resurfaceSchedules, autoPlugs, queuedPosts, etc.
- **Server actions:** `@/app/actions/` — settings (getUserSettingsSnapshot, updateDisplayName, updateUserImage, updateAutomationEmails, updatePlatformPreferences, updateTimezone, signOutAllDevices, updateConnectionAvatar), onboarding (getOnboardingStatus, setOnboardingGoal, setOnboardingCompleted), posts, publish, resurface.
- **List data:** Post list and filters live in `app/dashboard/posts/posts-list-data.ts` — getPostsListData, getPostDetail, getPostForEdit, getPostMedia, getQueuedSlotForPost, hasPaymentFailedPosts. Used by posts, scheduled, drafts, posted, and post detail/edit.
- **Subscription / limits:** `@/lib/subscription` (getSubscriptionForUser), `@/lib/plan-limits` (checkAccountLimits, checkTwitterTweetLimit, checkBulkToolsAllowed), `@/lib/plans` (getPlanLimits, SubscriptionTier, isActiveTier).

### Key patterns
- **Composer → Create:** User drafts in Composer (client state); on "Continue", payload is stored via `setComposerPayload()` and user is sent to `/dashboard/create/[slug]?fromComposer=1`. Create forms call `consumeComposerPayload()` to prefill and clear in effect cleanup.
- **Post status derivation:** List and detail pages may correct posts stuck in "publishing" when all publications have finished (set to "published" or "partial" in DB). Effective status can differ from raw `posts.status` for display.
- **Queue:** No dedicated `/dashboard/queue` page. Queue is managed via Settings (Queue tab), SchedulePostSidebar in create flow, and queue API routes (`/api/queue/*`). Scheduled posts with a pending `queued_posts` row show "Queued" on list/detail.
- **Token health:** `runTokenHealthCheckForUser` and token status/expiry drive connection list and create-form account display. Some platforms (e.g. YouTube, TikTok) skip expiry display; others show expiring_soon / expired.
- **Content types:** `@/lib/content-types` defines slugs (text, image, video, threads, collection) and supported platform ids per type. Create forms are chosen by slug in `/dashboard/create/[type]`.

---

## Glossary

### Post statuses (posts table)
| Value | Meaning |
|-------|--------|
| `draft` | Not scheduled; user can edit or publish. |
| `scheduled` | Has scheduledAt; may have a queued_posts row (then shown as "Queued" in UI). |
| `publishing` | Publish in progress; may be auto-corrected to published/partial when all publications finish. |
| `published` | All target platforms published successfully. |
| `partial` | At least one platform published, at least one failed. |
| `failed` | Publish attempted and failed (e.g. payment required, API error). |

### Publication status (post_publications)
- `published`, `failed`, `pending`, etc. — per-platform outcome. Used for badges and "Retry" on post detail.

### Subscription tiers (plans)
| Tier | Notes |
|------|--------|
| `free` | No paid features; limited accounts (0), no bulk tools, no resurface/auto-plug. |
| `starter` | Early adopter ~$6/mo; 5 accounts, 300 tweets/month, no bulk/resurface/auto-plug. |
| `growth` | Early adopter ~$19/mo; 15 accounts, 1500 tweets/month, bulk tools, resurface, auto-plug. |
| `pro` | Early adopter ~$33/mo; effectively unlimited accounts, same as growth + priority support. |

Plan IDs come from env: `DODO_PAYMENTS_STARTER_PRODUCT_ID`, etc. Limits in `@/lib/plans` and `@/lib/plan-limits`.

### Platform identifiers (lib/platforms / content-types)
- `linkedin`, `facebook`, `bluesky`, `youtube`, `pinterest`, `instagram`, `tiktok`, `twitter_x`, `threads`. Used in OAuth, connections, and content-type platform allowlists.

### Content type slugs (create flow)
- `text` — Text post (plain text).
- `image` — Image post (with optional caption).
- `video` — Video post.
- `threads` — Multi-post thread (Twitter/Threads/Bluesky).
- `collection` — Collection of images/videos in one post (e.g. carousel).

### Date/time
- User preferences: `use24HourTimeFormat`, `dateFormat` (dd/MM/yyyy | MM/dd/yyyy | yyyy-MM-dd), `timezone` (e.g. UTC). Stored in userSettings, read via getUserSettingsSnapshot().

### Other
- **Resurface:** Re-post or boost a post (e.g. Twitter) on a schedule; gated by plan (allowResurface).
- **Auto-plug:** Automatically add a plug/comment to high-performing posts; gated by plan (allowAutoPlug).
- **Queued post:** A scheduled post that has a row in queued_posts with status "pending" and is assigned to a queue slot.
