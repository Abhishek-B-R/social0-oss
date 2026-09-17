# Social0: Product features

Complete list of what Social0 offers today, based on the live app (`react-frontend/`) and API (`backend/server/`).  
Plan gates reflect `react-frontend/src/lib/plans.ts` and the pricing page.

---

## Core value

- **Multi-platform scheduler**: compose once, publish or schedule to many networks from one dashboard
- **Parallel publishing**: all selected accounts receive a post at the same time; one platform failing does not block the others
- **Live publish progress**: “Publish now” shows per-platform status (SSE) until complete
- **One calendar**: scheduled, queued, draft, and published posts across all connected accounts
- **Official OAuth**: connect platforms via each network’s supported auth flow (encrypted tokens at rest)

---

## Supported platforms (9)

| Platform | Connect method | Notes |
| -------- | -------------- | ----- |
| **X (Twitter)** | OAuth 1.0a | Premium-aware character limits; threads |
| **LinkedIn** | OAuth 2 | Personal profiles and company pages (per OAuth scopes) |
| **Instagram** | Meta OAuth | Direct Instagram or via linked Facebook Page |
| **Facebook** | Meta OAuth | **Pages only** (not personal profiles) |
| **Threads** | Meta OAuth | Text, images, video |
| **TikTok** | TikTok Login Kit (PKCE) | Video and photo posts; privacy/title/branded-content settings |
| **YouTube** | Google OAuth | Videos and Shorts |
| **Pinterest** | Pinterest OAuth | Board picker per pin |
| **Bluesky** | BYOK (handle + app password) | AT Protocol |

---

## Content types

| Type | Description | Platforms |
| ---- | ----------- | --------- |
| **Text** | Plain text post | Facebook, Bluesky, X, LinkedIn, Threads |
| **Image** | Image + optional caption | Facebook, Bluesky, X, LinkedIn, Threads, Pinterest, TikTok, Instagram |
| **Video** | Video + optional caption | Facebook, Bluesky, X, LinkedIn, Threads, YouTube, Pinterest, TikTok, Instagram |
| **Threads** | Multi-post thread | X, Threads, Bluesky |
| **Collection** | Mixed images & videos in one post | X, Threads, Instagram |

### Composer & create flows

- **Composer**: quick text-first flow with optional media; supports thread-style multi-post drafts
- **Manual create**: per-type forms (`/dashboard/create/:type`) with full platform-specific options
- **Per-platform captions**: one base caption, customize per account/platform where needed
- **Carousel / multi-image**: image collections and Instagram-style carousels (Starter+)
- **Aspect-ratio guidance**: video dimension hints before upload
- **Drag-and-drop media**: images and videos in composer and create forms
- **Drafts**: save work in progress; edit later from Posts → Drafts
- **Edit scheduled posts**: update content, accounts, or schedule before publish time
- **Post again**: republish or retry from post detail
- **Publish now or schedule**: immediate publish with live progress, or pick date/time

---

## Scheduling & organization

- **Schedule for later**: date/time in user’s timezone
- **Content calendar**: month/week view of scheduled and published posts (`/dashboard/calendar`)
- **Analytics**: live metrics for posts you published through Social0 (`/dashboard/analytics`). Flask in the sidebar = early access, not a separate product. See [Analytics](#analytics)
- **Inbox**: comments on Social0-published posts, plus DMs where the platform allows it (`/dashboard/inbox`). Same flask. See [Inbox](#inbox)
- **Posts list**: all posts with filters (platform, account, time, sort); views for drafts, scheduled, posted
- **Posting queue**: recurring weekly time slots (Settings → Queue); assign posts to “next queue slot”
- **Timezone**: user timezone drives schedule display and queue slots (Settings)
- **Bulk scheduling**: upload many images or videos and schedule across days (Growth+; `/dashboard/bulk-tools`)

---

## Analytics

Route: `/dashboard/analytics` (also under `/dashboard/teams/:teamId/analytics`). Not plan-gated. Flask icon in the sidebar (no “Experimental” label there). The page title shows a flask + **Experimental**: early access, not a separate product.

Live metrics come from **connected, active accounts** that are rolled out. Metrics are for **posts you published through Social0**, not the rest of the account.

| Control | Behavior |
| ------- | -------- |
| Date range | X-style: `7D` / `2W` / `4W` / `3M` / `1Y` + custom calendar |
| Account chips | Active, usable connections on **live** platforms only. **All** = every live account |
| Reconnect nag | Only for live platforms that still need analytics permission. Open **Connections** |
| Refresh | Reloads the current range |

What you see: Views, Likes, Comments, Engagement; Views & engagement trend; **By platform** (all accounts) or **Engagement mix** (one account); Top posts (opens `/dashboard/posts/:id`).

### Live vs not yet (today)

Rolling out as App Review lands. `LIVE_PLATFORMS.analytics`: keep frontend and backend maps in sync. **False = hide chip, skip live fetch, skip reconnect nag.**

| Platform | Analytics today |
| -------- | --------------- |
| Instagram, Facebook, Threads, YouTube, X, Bluesky, LinkedIn, TikTok, Pinterest | Live (`LIVE_PLATFORMS.analytics`) |

Team roles: **Analyst**, **Member**, and **Admin** can open Analytics. **Community** cannot.

Also available outside the dashboard: `social0 analytics` (CLI), `get_analytics` / `get_post_analytics` (MCP), and `GET /v1/analytics/*`.

---

## Inbox

Route: `/dashboard/inbox` (also `/dashboard/teams/:teamId/inbox`). Not plan-gated. Same flask as Analytics.

- **Comments** (default): comments on posts **published through Social0**
- **DMs**: conversations on platforms that allow it

Same date ranges as Analytics (`7D` / `2W` / `4W` / `3M` / `1Y` + custom). Account chips: active connections on **live** platforms for that tab. Inline images/videos in threads; reply in-app. Scroll the comments or DMs list to load older threads.

| URL | Meaning |
| --- | ------- |
| (none) | Comments tab |
| `?tab=dms` | DMs tab |
| `?account=` | Filter to one connected account |
| `?thread=` | Open a comment thread |
| `?convo=` | Open a DM conversation |

- Inbox nav entry (experimental). Unread badge is not shipped yet.

### Live vs not yet (today)

Same gate as Analytics: `LIVE_PLATFORMS.inboxComments` / `inboxDms`.

| Platform | Comments | DMs |
| -------- | -------- | --- |
| Instagram | Live | Live |
| **X (Twitter)** | Live | Live |
| **Bluesky** | Live | Live |
| Facebook | Live | Not supported |
| Threads, YouTube, LinkedIn | Live | Not in the DMs map |
| TikTok | Hidden (Login Kit has no comments inbox) | Live (Business Messaging; Login Kit token will fail until a BM app is connected) |
| Pinterest | Hidden | Not in the DMs map |

Inbox chips use `inbox.listAccounts` with the matching live flag (not the analytics list).

Team roles: **Community**, **Member**, and **Admin** can open Inbox and reply. **Analyst** cannot. **Community** cannot publish.

Also available outside the dashboard: `social0 inbox` (CLI), `list_inbox_comments` / `reply_to_comment` / `moderate_comment` / `list_inbox_dms` / `get_inbox_dm_thread` / `reply_to_dm` (MCP), and `/v1/inbox/*`.

---

## Post details

Route: `/dashboard/posts/:id`. Two columns.

**Left**

1. **Post content**
2. **Media** (if any)
3. Under Media:
   - If **X is not** on the post: full-width **Post analytics** card (published / partial only)
   - If **X is** on the post: that row splits: **Post analytics** \| **Auto-Plug & Auto-Repost** (Growth+; X-only). Scheduled X posts can show Auto-Plug / Auto-Repost without the analytics card

**Post analytics** starts **collapsed**. Clicking **Show analytics** is what fetches metrics. They do not load on page open. **Hide analytics** / **Refresh** after open. Live-platform filter still applies: platforms with `LIVE_PLATFORMS.analytics` false are skipped.

FIXME: the analytics card still renders for any published/partial post; non-live platforms on that post are skipped when metrics load.

**Right**

1. **Status card**: type badge (Text / Image / Video / Thread / Collection), Posted / Scheduled / Queued / Publishing / Partial / Failed / Draft, then **Post again** / **Edit and post** (and publish/retry/delete when relevant), then Created / Scheduled or Queued / Posted timestamps
2. **Publish status**: per-platform publish log
3. **Platforms**: account rows + **View** on the network when published (Retry if that account failed)

---

## Growth automation (Growth & Pro)

- **Auto-repost / resurface**: automatically repost evergreen content on an interval with optional max resurfaces and plug comment
- **Auto-plug**: add a call-to-action reply when a post hits a performance threshold (e.g. retweets/likes on X)
- Configurable per post at schedule time or on post detail for eligible posts
- **X-only** today. On post detail they share a row with Post analytics when X is on the post (see [Post details](#post-details))

---

## Connections & accounts

- **Connections hub**: connect, disconnect, and refresh tokens (`/dashboard/connections`)
- **Multiple accounts per platform**: when plan limits allow
- **Account pickers**: Facebook Page select, Instagram select, LinkedIn company/page select, Instagram-via-Facebook flow
- **Token health**: background validation and refresh; reconnect prompts when auth expires
- **X Premium detection**: extended character limit when Premium is active on the connected account
- **Pinterest default board**: set a default; override per post in composer

---

## Dashboard & app experience

- **Marketing site**: landing, pricing, FAQ, features/alternatives SEO pages (`/`, `/features`, `/alternatives`)
- **Auth**: email sign-up/sign-in, Google OAuth, email verification, forgot/reset password
- **Guest dashboard**: browse dashboard UI without signing in (test mode; cannot post)
- **Onboarding**: guided setup after sign-up (goal → connect → optional plan → first post)
- **Billing**: Stripe/Dodo checkout, plan change, cancel, portal
- **Settings**: display name, avatar, timezone, platform preferences, automation emails, post-failure emails, sign out all devices
- **Feedback**: embedded Canny board (`/dashboard/feedback`)
- **Documentation links**: in-app links to [docs.social0.app](https://docs.social0.app)
- **Dark / light theme**: toggle on marketing and auth pages
- **Mobile-friendly dashboard**: bottom nav on small screens; responsive layouts

---

## Reliability & notifications

- **Per-platform publish status**: success/failure per account on each post
- **Failure reasons**: stored and shown when a platform publish fails
- **Email on post failure**: optional notification (Settings)
- **Payment-failed banner**: prompt to update payment when billing fails and publish is blocked
- **Free-tier post allowance**: limited lifetime posts on Free before upgrade required

---

## Billing & plans

| Feature | Free | Starter ($9/mo) | Growth ($19/mo early) | Pro ($35/mo early) |
| ------- | ---- | ----------------- | ----------------------- | ------------------ |
| Connected accounts | 3 | 5 | 15 | Unlimited |
| Lifetime free posts | 5 | — | — | — |
| Unlimited posts | After free cap | ✓ | ✓ | ✓ |
| All 9 platforms | ✓ | ✓ | ✓ | ✓ |
| Schedule & calendar | ✓ | ✓ | ✓ | ✓ |
| Carousels / collections / threads | ✓ | ✓ | ✓ | ✓ |
| Multiple accounts per platform | — | ✓ | ✓ | ✓ |
| Bulk tools (image/video) | — | — | ✓ | ✓ |
| Auto-plug | — | — | ✓ | ✓ |
| Auto-repost / resurface | — | — | ✓ | ✓ |
| Analytics (experimental, live platforms) | ✓ | ✓ | ✓ | ✓ |
| Inbox comments & DMs (experimental, live platforms) | ✓ | ✓ | ✓ | ✓ |
| Human support | — | ✓ | ✓ | Priority (Pro) |

*Pricing shown on the website; early adopters lock in launch pricing.*

---

## Security & compliance

- **Encrypted OAuth tokens**: HKDF per connected account
- **Better Auth**: session cookies; optional API key auth (`s0_live_*`) on backend
- **Turnstile**: bot protection on sign-up (production)
- **Legal consent**: terms and privacy acceptance on registration
- **Privacy & terms pages**: `/privacy`, `/terms`, data deletion instructions

---

## Developer & API (current state)

| Capability | Status |
| ---------- | ------ |
| Browser app → `POST /api/rpc` | ✓ Production path for dashboard |
| REST `/api/*` (auth, publish, media, billing, connect, cron) | ✓ |
| Publish now + SSE job stream | ✓ |
| API keys UI (`/dashboard/api-keys`) | ✓ Self-serve `sk_live_…` keys |
| User outbound webhooks | ✓ Backend |
| REST `/v1/*` API (`me`, `accounts`, `posts`, `media`, `jobs`, `webhooks`) | ✓ Implemented; Bearer API key |
| REST `/v1/analytics/*` | ✓ Live metrics: overview, per-post, eligible accounts |
| REST `/v1/inbox/*` | ✓ Comments + DMs: list, reply, like, hide, DM thread, DM reply |
| CLI (`npm i -g social0`) | ✓ Includes `social0 analytics` and `social0 inbox` |
| MCP (`@social0/mcp`, `mcp.social0.app`) | ✓ Includes analytics + inbox tools |
| OpenAPI (`/openapi.json`, `/docs`) | ✓ Covers every `/v1` route |
| Teams (`/dashboard/teams`) | ✓ Invite teammates as Admin, Member, Community, or Analyst (Pro-gated) |

`/v1` analytics and inbox reuse the same cores as the dashboard, but API keys
address the **personal (main) pool** only: workspace-scoped accounts stay in the
dashboard. Live reads are subject to the same `LIVE_PLATFORMS` gate, cache, and
per-platform outbound limits, so totals can come back `sampled` or `partial`;
clients are expected to surface that rather than quote a partial total as final.

---

## Infrastructure (behind the scenes)

Not user-facing, but powers the product:

- Fastify API + Postgres (Neon)
- Cloudflare R2 media uploads (presigned)
- Cloudflare publish worker for platform posting (production default)
- BullMQ background worker for scheduled dispatch, repost, autoplug, token health
- PostHog product analytics
- Sentry error tracking (optional, API server)
- Dodo Payments for subscriptions

---

*Last updated from codebase on `main` (Analytics + Inbox on the dashboard, `/v1`, CLI, and MCP). For how-to guides, see [docs.social0.app](https://docs.social0.app).*
