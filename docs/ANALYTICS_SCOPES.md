# Analytics scopes — how to apply without breaking publish

Social0 analytics fetches **live** metrics from each platform when you open Analytics or click **Show analytics** on a post. No new database tables.

Adding scopes is **additive**: existing connected accounts keep their old tokens and **publishing continues to work**. Analytics that need new permissions show a reconnect banner until the user reconnects that account.

## Safe rollout order

1. Ship this code (scopes requested on *new* OAuth / reconnect only).
2. Submit App Review / product access for each platform below (can be parallel).
3. After approval, ask users who want insights to **Reconnect** on `/dashboard/connections` (no need to disconnect everyone).
4. Until approval, platforms that already expose public metrics still work (X public_metrics, YouTube video stats via `youtube.readonly`, Bluesky public AppView, Pinterest pin analytics with `pins:read`).

## Per-platform checklist

### Meta — Facebook Pages

| Item | Detail |
| ---- | ------ |
| New permission | `read_insights` (we already had `pages_read_engagement`) |
| Code | `FACEBOOK_PAGE_SCOPES` in `backend/shared` + frontend mirror |
| If using Login config | Set `FACEBOOK_LOGIN_CONFIG_ID` — **add `read_insights` inside that Meta Login for Business configuration** (config_id overrides query `scope`) |
| App Review | Meta App Dashboard → App Review → Permissions → `read_insights` |
| Use case copy | “Show Page post impressions, reach, and engagement in Social0 Analytics so creators can see how published posts perform.” |
| Endpoints | `GET /{post-id}?fields=likes.summary,comments.summary,shares` + `GET /{post-id}/insights` |

### Meta — Instagram (Instagram Login)

| Item | Detail |
| ---- | ------ |
| New permission | `instagram_business_manage_insights` |
| Keep | `instagram_business_basic`, `instagram_business_content_publish` |
| App Review | Instagram product → Advanced Access for manage_insights |
| Use case | “Display media views, reach, and saves for posts published through Social0.” |
| Endpoints | `GET /{media-id}?fields=like_count,comments_count` + `GET /{media-id}/insights` |

### Meta — Threads

| Item | Detail |
| ---- | ------ |
| New permission | `threads_manage_insights` |
| Keep | `threads_basic`, `threads_content_publish`, `threads_manage_replies` |
| App Review | Threads API permissions in Meta dashboard |
| Endpoints | `GET /{threads-media-id}/insights?metric=views,likes,replies,reposts,quotes` |

### Google — YouTube

| Item | Detail |
| ---- | ------ |
| Already enough for MVP | `youtube.readonly` → `videos.list` statistics (views/likes/comments) **works without reconnect** |
| Added for future | `https://www.googleapis.com/auth/yt-analytics.readonly` (YouTube Analytics Reports API) |
| Console | Google Cloud → OAuth consent screen → add scope → if app is in Production, may need verification |
| Tip | New connects get both scopes; old tokens still return video stats via Data API |

### TikTok

| Item | Detail |
| ---- | ------ |
| New scopes | `video.list`, `user.info.stats` |
| Keep | `user.info.basic`, `video.upload`, `video.publish` |
| Do **not** add yet | `user.info.profile` (separate review; not required for video metrics) |
| Portal | TikTok Developer Portal → your app → products (Login Kit + Display API) → apply for scopes |
| Endpoints | `POST /v2/video/query/` with `like_count,comment_count,share_count,view_count` |

### X (Twitter)

| Item | Detail |
| ---- | ------ |
| Extra scopes | None for `public_metrics` (likes, retweets, replies, quotes, impressions when available) |
| Notes | OAuth 1.0a user context; elevated/basic access per your X developer project |

### Pinterest

| Item | Detail |
| ---- | ------ |
| Extra scopes | None for MVP (`pins:read` already requested) |
| Endpoint | `GET /v5/pins/{pin_id}/analytics` |
| Notes | Some metrics need a business account / API product enablement in Pinterest |

### Bluesky

| Item | Detail |
| ---- | ------ |
| Extra scopes | None (public AppView `app.bsky.feed.getPosts`) |
| Notes | Uses AT URI stored as `platform_post_id` |

### LinkedIn

| Item | Detail |
| ---- | ------ |
| Status | Best-effort via `socialActions`; full organic analytics usually need **Marketing Developer Platform / Community Management** products |
| Do not break publish | Keep `w_member_social` (+ org scopes when MDP-approved) |
| UX | UI shows “unsupported / needs LinkedIn product” instead of failing publish |

## Inbox comments (Social Inbox)

`/dashboard/inbox` lists comments on **Social0-published posts** (range: 1 / 7 / 30 / 90 days, default 7) and lets you reply from the dashboard. Same additive-scope rule: publishing keeps working until reconnect.

| Platform | Read | Reply | Extra OAuth |
| -------- | ---- | ----- | ----------- |
| Facebook | Page post comments | Yes | `pages_manage_engagement` |
| Instagram | Media comments | Yes | `instagram_business_manage_comments` |
| Threads | Replies | Yes | already had `threads_manage_replies` |
| YouTube | commentThreads | Yes | `youtube.force-ssl` for replies (list works with readonly) |
| X | conversation search | Yes | existing OAuth 1.0a. Recent Search only covers ~7 days |

| Bluesky | public thread | Yes | app password |
| LinkedIn | best-effort read | No | MDP often required |
| TikTok / Pinterest | — | — | no usable comments API |

If `FACEBOOK_LOGIN_CONFIG_ID` is set, add `pages_manage_engagement` in that Login config too.

## What users see before App Review

- Analytics tab loads; platforms with public/basic metrics populate charts.
- Platforms blocked on missing scopes show **Reconnect for full insights** with the exact scope names.
- Publish / schedule / tokens for old scopes are unchanged.

## Smoke test after reconnect

1. Reconnect one Instagram / Threads / TikTok / Facebook account.
2. Publish a test post (or use an existing published `platform_post_id`).
3. Open `/dashboard/analytics` (Past week) and **Show analytics** on `/dashboard/posts/:id`.
4. Open `/dashboard/inbox` and confirm comments load; reply on one thread.
5. Confirm metrics appear and Connections still lists the account as active.
