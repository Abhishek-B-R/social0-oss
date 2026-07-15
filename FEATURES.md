# Social0 — Product features

Complete list of what Social0 offers today, based on the live app (`react-frontend/`) and API (`backend/server/`).  
Plan gates reflect `react-frontend/src/lib/plans.ts` and the pricing page.

---

## Core value

- **Multi-platform scheduler** — compose once, publish or schedule to many networks from one dashboard
- **Parallel publishing** — all selected accounts receive a post at the same time; one platform failing does not block the others
- **Live publish progress** — “Publish now” shows per-platform status (SSE) until complete
- **One calendar** — scheduled, queued, draft, and published posts across all connected accounts
- **Official OAuth** — connect platforms via each network’s supported auth flow (encrypted tokens at rest)

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

- **Composer** — quick text-first flow with optional media; supports thread-style multi-post drafts
- **Manual create** — per-type forms (`/dashboard/create/:type`) with full platform-specific options
- **Per-platform captions** — one base caption, customize per account/platform where needed
- **Carousel / multi-image** — image collections and Instagram-style carousels (Starter+)
- **Aspect-ratio guidance** — video dimension hints before upload
- **Drag-and-drop media** — images and videos in composer and create forms
- **Drafts** — save work in progress; edit later from Posts → Drafts
- **Edit scheduled posts** — update content, accounts, or schedule before publish time
- **Post again** — republish or retry from post detail
- **Publish now or schedule** — immediate publish with live progress, or pick date/time

---

## Scheduling & organization

- **Schedule for later** — date/time in user’s timezone
- **Content calendar** — month/week view of scheduled and published posts (`/dashboard/calendar`)
- **Posts list** — all posts with filters (platform, account, time, sort); views for drafts, scheduled, posted
- **Posting queue** — recurring weekly time slots (Settings → Queue); assign posts to “next queue slot”
- **Timezone** — user timezone drives schedule display and queue slots (Settings)
- **Bulk scheduling** — upload many images or videos and schedule across days (Growth+; `/dashboard/bulk-tools`)

---

## Growth automation (Growth & Pro)

- **Auto-repost / resurface** — automatically repost evergreen content on an interval with optional max resurfaces and plug comment
- **Auto-plug** — add a call-to-action reply when a post hits a performance threshold (e.g. retweets/likes on X)
- Configurable per post at schedule time or on post detail for eligible posts

---

## Connections & accounts

- **Connections hub** — connect, disconnect, and refresh tokens (`/dashboard/connections`)
- **Multiple accounts per platform** — when plan limits allow
- **Account pickers** — Facebook Page select, Instagram select, LinkedIn company/page select, Instagram-via-Facebook flow
- **Token health** — background validation and refresh; reconnect prompts when auth expires
- **X Premium detection** — extended character limit when Premium is active on the connected account
- **Pinterest default board** — set a default; override per post in composer

---

## Dashboard & app experience

- **Marketing site** — landing, pricing, FAQ, features/alternatives SEO pages (`/`, `/features`, `/alternatives`)
- **Auth** — email sign-up/sign-in, Google OAuth, email verification, forgot/reset password
- **Guest dashboard** — browse dashboard UI without signing in (test mode; cannot post)
- **Onboarding** — guided setup after sign-up (goal, connect accounts, plan selection)
- **Billing** — Stripe/Dodo checkout, plan change, cancel, portal, 3-day trial on paid plans
- **Settings** — display name, avatar, timezone, platform preferences, automation emails, post-failure emails, sign out all devices
- **Feedback** — embedded Canny board (`/dashboard/feedback`)
- **Documentation links** — in-app links to [docs.social0.app](https://docs.social0.app)
- **Dark / light theme** — toggle on marketing and auth pages
- **Mobile-friendly dashboard** — bottom nav on small screens; responsive layouts

---

## Reliability & notifications

- **Per-platform publish status** — success/failure per account on each post
- **Failure reasons** — stored and shown when a platform publish fails
- **Email on post failure** — optional notification (Settings)
- **Payment-failed banner** — prompt to upgrade when trial ends and publish is blocked
- **Free-tier post allowance** — limited lifetime posts on Free before upgrade required

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
| Human support | — | ✓ | ✓ | Priority (Pro) |
| 3-day free trial on paid plans | — | ✓ | ✓ | ✓ |

*Pricing shown on the website; early adopters lock in launch pricing.*

---

## Security & compliance

- **Encrypted OAuth tokens** — HKDF per connected account
- **Better Auth** — session cookies; optional API key auth (`s0_live_*`) on backend
- **Turnstile** — bot protection on sign-up (production)
- **Legal consent** — terms and privacy acceptance on registration
- **Privacy & terms pages** — `/privacy`, `/terms`, data deletion instructions

---

## Developer & API (current state)

| Capability | Status |
| ---------- | ------ |
| Browser app → `POST /api/rpc` | ✓ Production path for dashboard |
| REST `/api/*` (auth, publish, media, billing, connect, cron) | ✓ |
| Publish now + SSE job stream | ✓ |
| API keys UI (`/dashboard/api-keys`) | Coming soon (backend supports keys) |
| User outbound webhooks | ✓ Backend |
| REST `/v1/*` CRUD API | Stubs / not implemented |
| Teams (`/dashboard/teams`) | ✓ Invite teammates, roles, Pro-gated workspace |

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

*Last updated from codebase on `main`. For how-to guides, see [docs.social0.app](https://docs.social0.app).*
