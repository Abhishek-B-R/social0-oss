# Platform permissions — Social0 feature matrix

Complete checklist of OAuth scopes, app permissions, and setup steps so **publish**, **analytics**, **inbox comments**, and **inbox DMs** work on each network.

**How Social0 applies scopes:** new permissions are **additive**. Existing connected accounts keep publishing until the user **Reconnects** on `/dashboard/connections`. The inbox shows a reconnect banner naming missing scopes.

**Meta Login for Business:** if `FACEBOOK_LOGIN_CONFIG_ID` is set, scopes must be added **inside that Meta Login configuration** (config overrides query `scope`).

Source of truth in code: `backend/server/src/lib/platforms.ts`, `backend/shared/src/constants/facebook-scopes.ts`, `backend/server/src/lib/inbox/types.ts`.

---

## Quick matrix

| Platform | Publish | Analytics | Inbox comments | Inbox DMs | Comment media | DM media |
| -------- | ------- | --------- | -------------- | --------- | ------------- | -------- |
| Instagram | Yes | Yes | Yes | Yes | — | image, video |
| Facebook Pages | Yes | Yes | Yes | Yes | — | image, video |
| Threads | Yes | Yes | Yes | — | — | — |
| YouTube | Yes | Yes | Yes | — | — | — |
| X (Twitter) | Yes | Yes | Yes* | Yes | image, video | image, video |
| Bluesky | Yes | Yes | Yes | Yes | image | — |
| LinkedIn | Yes | partial | read-only | — | — | — |
| TikTok | Yes | Yes | — | — | — | — |
| Pinterest | Yes | Yes | — | — | — | — |

\* X comment search is limited to ~7 days via Recent Search API.

---

## Instagram (Instagram Login)

### OAuth scopes (requested on connect)

| Scope | Feature |
| ----- | ------- |
| `instagram_business_basic` | Profile, account identity |
| `instagram_business_content_publish` | Publish posts, reels, stories |
| `instagram_business_manage_insights` | Analytics (views, reach, saves) |
| `instagram_business_manage_comments` | **Inbox:** read + reply to comments on your media |
| `instagram_business_manage_messages` | **Inbox:** read + reply to DMs |

### App Review (Meta)

- Instagram product → Advanced Access for each scope above.
- Use case: “Creators manage comments and DMs on posts published through Social0.”

### Inbox behavior

- **Comments:** only on posts **published through Social0** (we have `platform_post_id`).
- **Replies:** always attach to the **top-level comment** (Instagram API — no nested reply-to-reply).
- **DM attachments:** image + video via Graph Messenger API.

### Reconnect when

Banner shows `instagram_business_manage_comments` or `instagram_business_manage_messages` missing.

---

## Facebook Pages

### OAuth scopes

| Scope | Feature |
| ----- | ------- |
| `pages_show_list` | List Pages user manages |
| `pages_read_engagement` | Read engagement metrics |
| `pages_manage_posts` | Publish to Page |
| `read_insights` | Page/post insights (Analytics) |
| `pages_manage_engagement` | **Inbox:** read + reply to Page post comments |
| `pages_messaging` | **Inbox:** Page Messenger conversations + DMs |

Defined in `FACEBOOK_PAGE_SCOPES` (`backend/shared`).

### App Review (Meta)

- Permissions → `read_insights`, `pages_manage_engagement`, `pages_messaging`.
- Use case: “Page admins view analytics and respond to comments and Messenger messages.”

### Inbox behavior

- Comments on Social0-published Page posts only.
- Replies attach to top-level comment (same as Instagram).
- DM attachments: image + video.

---

## Threads

### OAuth scopes

| Scope | Feature |
| ----- | ------- |
| `threads_basic` | Profile, read threads |
| `threads_content_publish` | Publish threads |
| `threads_manage_replies` | **Inbox:** read + reply to thread replies |
| `threads_manage_insights` | Analytics |

### App Review

- Meta Threads API permissions in App Dashboard.

### Inbox behavior

- Comments on Social0-published threads.
- **Nested replies supported** in UI (reply to specific reply).
- **No DMs** — Threads has no public messaging API for third parties.

---

## YouTube

### OAuth scopes

| Scope | Feature |
| ----- | ------- |
| `https://www.googleapis.com/auth/youtube.upload` | Upload / publish |
| `https://www.googleapis.com/auth/youtube.readonly` | Video stats (Analytics MVP) |
| `https://www.googleapis.com/auth/yt-analytics.readonly` | YouTube Analytics Reports (future) |
| `https://www.googleapis.com/auth/youtube.force-ssl` | **Inbox:** post comment replies |
| `https://www.googleapis.com/auth/userinfo.profile` | Channel identity |

### Google Cloud Console

- OAuth consent screen → add scopes.
- Production apps may need verification for sensitive scopes.

### Inbox behavior

- Read comments with `youtube.readonly`; reply needs `youtube.force-ssl`.
- **Nested replies supported** in UI.
- **No DMs** via YouTube Data API for creators.

---

## X (Twitter)

### Auth model

OAuth **1.0a** (not scope strings). Requires app keys: `TWITTER_CONSUMER_KEY`, `TWITTER_CONSUMER_SECRET`.

### Developer portal — enable these

| Setting | Feature |
| ------- | ------- |
| Read and write (user context) | Publish tweets, upload media |
| **Direct Messages — Read and Write** | **Inbox DMs** (no extra OAuth scope string — enable on app, then reconnect) |
| Elevated / Basic API access | Tweet lookup, metrics, DM endpoints |

### Inbox behavior

- **Comments:** conversation search on tweet ID (~7 day window for Recent Search).
- **Replies:** nested threading supported; media in replies (image + video).
- **DMs:** read thread + send with attachments (image + video).

### Reconnect when

DM endpoints return 403 — enable “Direct Messages Read and Write” on the X developer app, then reconnect account.

---

## Bluesky

### Auth model

**App password** (BYOK) — not OAuth scopes. User creates an app password in Bluesky settings with:

| Capability | Feature |
| ---------- | ------- |
| Posting | Publish |
| **Chat** (app password permission) | **Inbox DMs** via `api.bsky.chat` |

Stored as encrypted access + “secret” (app password) on the connected account.

### Inbox behavior

- **Comments:** public AppView thread read + reply via AT Protocol.
- **Nested replies** supported.
- Comment **images** supported; no video in comments.
- **DMs:** text only (no attachments in our integration).

---

## LinkedIn

### OAuth scopes (current)

| Scope | Feature |
| ----- | ------- |
| `openid`, `profile`, `email` | Sign-in identity |
| `w_member_social` | Publish personal posts |

### When Marketing Developer Platform (MDP) approved — add

| Scope | Feature |
| ----- | ------- |
| `r_organization_social` | Read org post engagement |
| `w_organization_social` | Publish as organization |
| `r_organization_admin` | Manage org assets |

### Inbox behavior

- **Comments:** best-effort read via Community Management APIs — often blocked without MDP.
- **Replies:** not shipped (partner API required).
- **DMs:** not available on public API.

---

## TikTok

### OAuth scopes

| Scope | Feature |
| ----- | ------- |
| `user.info.basic` | Profile |
| `video.upload`, `video.publish` | Publish videos |
| `video.list` | List videos (Analytics) |
| `user.info.stats` | Follower / aggregate stats |

### TikTok Developer Portal

- Apply for Display API / Login Kit scope approval.

### Inbox behavior

- **No comments API** exposed for third-party inbox products.
- **No DMs API** for creators.

---

## Pinterest

### OAuth scopes

| Scope | Feature |
| ----- | ------- |
| `boards:read`, `boards:write` | Boards |
| `pins:read`, `pins:write` | Pins + publish |
| `user_accounts:read` | Account info |

### Inbox behavior

- **No comments inbox** on public API.
- **No DMs**.

---

## Feature → permission lookup

### Publishing (all platforms)

Use each platform’s publish scopes in `PLATFORM_OAUTH_CONFIG` — no inbox scopes required.

### Analytics (`/dashboard/analytics`)

| Platform | Required |
| -------- | -------- |
| Instagram | `instagram_business_manage_insights` |
| Facebook | `read_insights` |
| Threads | `threads_manage_insights` |
| YouTube | `youtube.readonly` (MVP); `yt-analytics.readonly` optional |
| TikTok | `video.list`, `user.info.stats` |
| X | OAuth 1.0a user context (public_metrics) |
| Pinterest | `pins:read` |
| Bluesky | App password (public AppView) |
| LinkedIn | MDP for full organic analytics |

See also [`docs/ANALYTICS_SCOPES.md`](./ANALYTICS_SCOPES.md).

### Inbox comments (`/dashboard/inbox` → Comments)

| Platform | OAuth / setup |
| -------- | ------------- |
| Instagram | `instagram_business_manage_comments` |
| Facebook | `pages_manage_engagement` |
| Threads | `threads_manage_replies` (already on connect) |
| YouTube | `youtube.force-ssl` for replies; readonly for list |
| X | OAuth 1.0a read/write |
| Bluesky | App password |
| LinkedIn | MDP (read often fails without it) |

### Inbox DMs (`/dashboard/inbox` → DMs)

| Platform | OAuth / setup |
| -------- | ------------- |
| Instagram | `instagram_business_manage_messages` |
| Facebook | `pages_messaging` |
| X | App permission **Direct Messages Read and Write** + reconnect |
| Bluesky | App password with **chat** enabled |

---

## Reconnect checklist (users)

1. Open `/dashboard/connections`.
2. Click **Reconnect** on the account showing the amber banner in Inbox or Analytics.
3. Approve **all** requested permissions on the platform consent screen.
4. For Meta with Login Config: ensure admin added new scopes to the Login configuration first.
5. For X DMs: enable DM read/write in [developer.twitter.com](https://developer.twitter.com) → App → User authentication settings → reconnect.
6. For Bluesky DMs: create a new app password with chat enabled; reconnect with that password.

---

## Smoke test after full permissions

1. Publish a test post through Social0 to Instagram + Facebook + Threads + X + YouTube.
2. Have someone comment on each (or use a second account).
3. Open `/dashboard/inbox` → **Comments** → confirm threads appear with post thumbnail + your original post card.
4. Reply from Social0; confirm on-platform.
5. Send yourself a DM on IG, FB Page, X, Bluesky → **DMs** tab → reply with text + image (where supported).
6. Open `/dashboard/analytics` → confirm metrics load without reconnect banner.

---

## What we intentionally do not request

| Item | Reason |
| ---- | ------ |
| TikTok `user.info.profile` | Separate TikTok review; not needed for metrics |
| LinkedIn org scopes before MDP approval | Would break/connect reject for most users |
| Instagram/Facebook comment media | Platforms don’t support media in comment replies via API |
| Bluesky DM attachments | Chat API media not integrated yet |

---

## Related docs

- [`docs/ANALYTICS_SCOPES.md`](./ANALYTICS_SCOPES.md) — analytics rollout + App Review copy
- [`FEATURES.md`](../FEATURES.md) — product feature gates
- [`CLAUDE.md`](../CLAUDE.md) — inbox architecture (live-fetch, no DB)
