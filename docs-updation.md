# Social0 Docs Update Guide — Public REST API (`/v1`)

> **Purpose:** Hand this file to your `social0-docs` agent (or editor) to update [docs.social0.app](https://docs.social0.app).  
> **Source of truth for implementation:** PR `cursor/public-rest-api-da54` on the main app repo.  
> **Interactive API reference (live):** `https://api.social0.app/docs` (Swagger UI) · `https://api.social0.app/openapi.json`

---

## 1. What shipped (summary for docs intro)

Social0 now has a **versioned public REST API** at `/v1`. Users authenticate with **API keys** (`sk_live_…`), manage keys and webhooks from the dashboard **Developer** page, and can publish, schedule, upload media, and receive webhook events programmatically.

**Design principles to communicate in docs:**
- API keys are **per-user** (no workspace/team scoping yet).
- Publishing reuses the **same pipeline** as the dashboard (Cloudflare queues, retries, token refresh).
- Responses use **stable snake_case** JSON field names on `/v1`.
- Errors use a single shape: `{ "error": { "code", "message" } }`.
- Every response includes **`x-request-id`** for support/debugging.

**Not supported via API (document clearly):**
- **Twitter/X OAuth connect** — requires browser session; connect via dashboard → Connections.
- **Bluesky BYOK** — dashboard only.
- **API key scopes** — not implemented; all keys are full-access today (scopes may be added in a future release).

---

## 2. Documentation site structure (new + updated)

### 2.1 Add top-level section: **API**

Suggested sidebar order:

```
API
├── Overview                    /docs/api
├── Quickstart                  /docs/api/quickstart
├── Authentication              /docs/api/authentication
├── Rate limits                 /docs/api/rate-limits
├── Errors                      /docs/api/errors
├── Idempotency                 /docs/api/idempotency
├── Webhooks                    /docs/api/webhooks
├── API Reference               /docs/api/reference
│   ├── Accounts                /docs/api/reference/accounts
│   ├── Posts                   /docs/api/reference/posts
│   ├── Jobs                    /docs/api/reference/jobs
│   ├── Media                   /docs/api/reference/media
│   └── Webhooks (management)   /docs/api/reference/webhooks
├── Guides
│   ├── Publish a post          /docs/api/guides/publish
│   ├── Schedule a post         /docs/api/guides/schedule
│   ├── Upload media            /docs/api/guides/media
│   └── Connect accounts        /docs/api/guides/connect-accounts
└── OpenAPI & SDKs              /docs/api/openapi
```

### 2.2 Update existing dashboard docs

| Existing slug | Action |
|---------------|--------|
| `/docs/dashboard/api-keys` | **Rewrite** — was placeholder; now full Developer guide (keys + webhooks) |
| `/docs/dashboard/settings` | Add link: *Settings → sidebar also has **Developer** at `/dashboard/api-keys`* |
| `/docs/dashboard/connections` | Add note: *OAuth for most platforms can also be started via API (`POST /v1/accounts/connect`), except Twitter/X and Bluesky* |
| `/docs/dashboard` (overview) | Add bullet: *Programmatic access via REST API* → link `/docs/api/quickstart` |
| `/docs/billing/fair-usage` | Cross-link API rate limits page |
| Homepage / marketing | Optional CTA: *Build with the API* → `/docs/api/quickstart` |

### 2.3 App deep-links already expecting docs

The app links to these URLs — **keep slugs stable**:

| Constant in app | Expected docs URL |
|-----------------|-------------------|
| `DOCS_API_KEYS_URL` | `https://docs.social0.app/docs/dashboard/api-keys` |

---

## 3. Global API facts (repeat on Overview + Quickstart)

| Item | Value |
|------|-------|
| Base URL (production) | `https://api.social0.app` |
| API version prefix | `/v1` |
| Auth header | `Authorization: Bearer sk_live_…` |
| Content-Type | `application/json` (except media upload to presigned URL) |
| `scheduledAt` format | ISO 8601 datetime — **absolute instant** (see §5.2 scheduling) |
| Key prefix | `sk_live_` (legacy `s0_live_` still accepted) |
| Interactive docs | `https://api.social0.app/docs` |
| OpenAPI spec | `https://api.social0.app/openapi.json` |
| Dashboard: Developer | `https://social0.app/dashboard/api-keys` |

---

## 4. Page-by-page content specs

### 4.1 `/docs/api` — API Overview

**Audience:** Developers evaluating or integrating Social0.

**Include:**
- One-paragraph value prop: publish to LinkedIn, Instagram, X, etc. from your backend, CI, or automation tool.
- High-level flow diagram (mermaid):

```mermaid
sequenceDiagram
  participant App as Your app
  participant API as Social0 API
  participant Q as Publish queue
  participant Net as Social networks

  App->>API: POST /v1/posts/publish (Bearer sk_live_…)
  API-->>App: 202 tracking_id
  App->>API: GET /v1/jobs/:trackingId (poll)
  API->>Q: enqueue per platform
  Q->>Net: publish
  API-->>App: webhook post.published (optional)
```

- What you can do: list accounts, create drafts, publish now, schedule, upload media, track jobs, receive webhooks.
- What you need first: Social0 account, at least one connected account, API key from Developer settings.
- Link to Quickstart, Authentication, Reference, OpenAPI.

---

### 4.2 `/docs/api/quickstart` — Quickstart (5 minutes)

**Step 1 — Connect an account (dashboard)**  
Open [Connections](https://social0.app/dashboard/connections) and connect LinkedIn (or another platform). Copy the account UUID from the API or dashboard.

**Step 2 — Create an API key**  
Developer → [API Keys](https://social0.app/dashboard/api-keys) → Create key → copy `sk_live_…` (shown once).

**Step 3 — List accounts**

```bash
curl -s https://api.social0.app/v1/accounts \
  -H "Authorization: Bearer sk_live_YOUR_KEY" | jq
```

**Step 4 — Publish a post**

```bash
curl -s -X POST https://api.social0.app/v1/posts/publish \
  -H "Authorization: Bearer sk_live_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{
    "content": "Hello from the Social0 API!",
    "platforms": ["YOUR_CONNECTED_ACCOUNT_UUID"]
  }' | jq
```

Response (202):

```json
{
  "post_id": "uuid",
  "tracking_id": "uuid",
  "status": "queued",
  "stream_url": "/v1/jobs/{tracking_id}/stream"
}
```

`status: "queued"` on the **202** response means the publish job was **accepted** and is running asynchronously — not that the post is live yet. Poll `GET /v1/jobs/:trackingId` (or use the stream URL) until `status` is `completed` or `failed`.

**Step 5 — Poll job status**

```bash
curl -s https://api.social0.app/v1/jobs/TRACKING_ID \
  -H "Authorization: Bearer sk_live_YOUR_KEY" | jq
```

**Next steps:** Webhooks (avoid polling), Media guide, Schedule guide.

---

### 4.3 `/docs/api/authentication` — Authentication

**API keys**
- Created in dashboard: **Developer** (`/dashboard/api-keys`).
- Format: `sk_live_` + random secret; only the **hash** is stored server-side.
- Raw key shown **once** on create and regenerate.
- Multiple keys per user; each has `name`, `prefix`, `last_used_at`, `created_at`, optional `expires_at`.
- Revoked keys return `401` with `invalid_api_key`.

**Request header**

```
Authorization: Bearer sk_live_xxxxxxxxxxxxxxxx
```

**Security best practices (document prominently)**
- Never commit keys to git; use environment variables or secrets managers.
- Rotate keys via **Regenerate** in dashboard (old key revoked immediately).
- Revoke unused keys.
- Do not expose keys in client-side/browser code.

**Legacy keys**  
Older keys with prefix `s0_live_` still work; new keys use `sk_live_`.

**Session auth**  
Dashboard management routes (`/api/api-keys`, `/api/webhooks/subscriptions`) use **session cookies**, not API keys. External integrations should use `/v1` only.

---

### 4.4 `/docs/api/rate-limits` — Rate limits

Limits apply **per user** (derived from subscription tier), enforced via Redis.

| Plan | Requests per hour |
|------|-------------------|
| Free | 60 |
| Starter | 300 |
| Growth | 1,000 |
| Pro | 5,000 |

When exceeded:
- HTTP **429 Too Many Requests**
- Header **`Retry-After`** (seconds; typically 3600)
- Body:

```json
{
  "error": {
    "code": "rate_limit_exceeded",
    "message": "Too many requests. Try again later."
  }
}
```

**Note:** Publish actions on the dashboard have separate limits (`/api/publish`). API limits are for all `/v1/*` requests collectively.

Link to billing/upgrade for higher limits.

---

### 4.5 `/docs/api/errors` — Errors

**Shape (all `/v1` errors)**

```json
{
  "error": {
    "code": "invalid_api_key",
    "message": "API key is invalid."
  }
}
```

**Error codes**

| HTTP | `code` | When |
|------|--------|------|
| 400 | `validation_error` | Bad JSON, missing fields, invalid UUIDs, schedule in past, etc. |
| 401 | `invalid_api_key` | Missing, wrong, expired, or revoked key |
| 403 | `forbidden` | Resource belongs to another user |
| 404 | `not_found` | Post, job, media, account, or webhook not found |
| 409 | `idempotency_conflict` | Duplicate `Idempotency-Key` while first request in flight |
| 429 | `rate_limit_exceeded` | Hourly API quota exceeded |
| 500 | `internal_error` | Server error (no stack trace in body) |

**Debugging**  
Every response includes **`x-request-id`**. Users should include this when contacting support.

**Common `validation_error` mistakes**

| Symptom | Cause | Fix |
|---------|-------|-----|
| `"Expected object, received string"` | Request body sent as plain text, not JSON | Set `Content-Type: application/json` and send a JSON body (not Raw/Text in API clients) |
| Invalid UUID on `platforms` | Used platform name (`"linkedin"`) instead of account ID | Use UUID from `GET /v1/accounts` → `data[].id` |
| Accounts invalid / not yours | Wrong UUID or another user's account | Re-list accounts with the same API key |

---

### 4.6 `/docs/api/idempotency` — Idempotency

**Header:** `Idempotency-Key: <unique string>` (UUID recommended)

**Supported routes:**
- `POST /v1/posts/:id/publish`
- `POST /v1/posts/publish`

**Behavior:**
- First request with a key executes normally; response cached in Redis for 24 hours.
- Retry with same key returns the **same response** (status + body).
- Concurrent duplicate keys return **409** `idempotency_conflict`.

**Example**

```bash
KEY="$(uuidgen)"
curl -X POST https://api.social0.app/v1/posts/publish \
  -H "Authorization: Bearer sk_live_…" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $KEY" \
  -d '{"content":"…","platforms":["…"]}'
# Safe to retry with same Idempotency-Key if network fails
```

---

### 4.7 `/docs/api/webhooks` — Webhooks (user guide)

**Events**

| Event | When fired |
|-------|------------|
| `post.published` | All platforms finished; post status `published` or `partial` |
| `post.failed` | All platforms failed |
| `post.scheduled` | Post scheduled via API (`POST …/schedule` or `POST /v1/posts/schedule`) |
| `post.deleted` | Draft or scheduled post deleted via API |

**Setup (dashboard)**  
Developer → Webhooks tab → Add endpoint → select events → copy **signing secret** (shown once).

**Setup (API)**  
`POST /v1/webhooks` with `{ "url": "https://…", "events": ["post.published", …] }` — response includes `secret` once.

**Delivery**
- Method: `POST`
- `Content-Type: application/json`
- Headers:
  - `X-Social0-Event`: event type
  - `X-Social0-Delivery-Id`: UUID for this delivery
  - `X-Social0-Signature`: `t={unix_timestamp},v1={hex_hmac}`

**Payload shape**

```json
{
  "id": "delivery-uuid",
  "type": "post.published",
  "created_at": "2026-07-11T14:00:00.000Z",
  "data": {
    "post_id": "uuid",
    "status": "published",
    "platforms": [
      {
        "platform": "linkedin",
        "status": "published",
        "connected_account_id": "uuid",
        "error": null
      }
    ]
  }
}
```

**Signature verification (document with code sample)**

```
signed_payload = "{timestamp}.{raw_json_body}"
expected = HMAC_SHA256(webhook_secret, signed_payload)
compare expected to v1 value in X-Social0-Signature
```

**Python verification example**

```python
import hmac, hashlib, time

def verify(secret: str, signature_header: str, body: bytes, tolerance=300) -> bool:
    parts = dict(p.split("=", 1) for p in signature_header.split(","))
    ts = int(parts["t"])
    if abs(time.time() - ts) > tolerance:
        return False
    signed = f"{ts}.{body.decode()}".encode()
    expected = hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, parts["v1"])
```

**URL requirements**  
Production: HTTPS only, public URL (no localhost/private IPs). Same SSRF rules as other outbound webhooks.

**Retries**  
Document honestly: current implementation is fire-and-forget (`Promise.allSettled`); recommend idempotent handlers. *(Future: retry policy can be documented when added.)*

---

### 4.8 `/docs/dashboard/api-keys` — Dashboard: Developer

**Replace "coming soon" content entirely.**

**Sections:**

#### API Keys
- Path: `/dashboard/api-keys` (sidebar: **Developer**)
- Create: name → copy key once
- Table columns: Name, Key prefix (`sk_live_…`), Last used, Created
- Actions: Rename, Regenerate (revokes old), Revoke (delete)
- Link: `/docs/api/authentication`

#### Webhooks
- Same page, **Webhooks** tab
- Add endpoint URL + event checkboxes
- Signing secret shown once after create
- Delete endpoint from list

#### API documentation link
- Points to `https://api.social0.app/docs` (or `/docs/api` on docs site)

---

## 5. API Reference pages (`/docs/api/reference/*`)

Use consistent template per endpoint:
1. Method + path
2. Description
3. Auth required (always Bearer on `/v1`)
4. Request body / query params (table)
5. Response examples (success + common errors)
6. cURL + JavaScript + Python snippets

### 5.1 Accounts

#### `GET /v1/accounts`
List connected social accounts for the authenticated user.

**Response 200**

```json
{
  "data": [
    {
      "id": "uuid",
      "platform": "linkedin",
      "username": "jane",
      "profile_image_url": "https://…",
      "is_active": true,
      "token_expires_at": "2026-08-01T00:00:00.000Z",
      "token_status": "ok",
      "created_at": "2026-01-01T00:00:00.000Z"
    }
  ]
}
```

#### `POST /v1/accounts/connect`
Returns OAuth URL to open in a browser. User must complete OAuth in browser; callback uses existing `/api/connect/:platform/callback`.

**Body**

```json
{ "platform": "linkedin" }
```

**Supported `platform` values:** `linkedin`, `instagram`, `youtube`, `pinterest`, `tiktok`, `threads`, `facebook`

**Not supported:** `twitter_x` (use dashboard), `bluesky` (BYOK in dashboard)

**Response 200**

```json
{ "authorization_url": "https://…" }
```

#### `DELETE /v1/accounts/:id`
Disconnect account. Revokes token on platform (best effort) and deletes row. **204** empty body.

---

### 5.2 Posts

**`platforms` field:** array of **connected account UUIDs** (not platform names). Get IDs from `GET /v1/accounts`.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/posts` | List posts (paginated) |
| `POST` | `/v1/posts` | Create **draft** |
| `GET` | `/v1/posts/:id` | Full post + per-platform status |
| `PATCH` | `/v1/posts/:id` | Update draft or scheduled post |
| `DELETE` | `/v1/posts/:id` | Delete draft or scheduled post |
| `POST` | `/v1/posts/:id/publish` | Publish existing post now → **202** + `tracking_id` |
| `POST` | `/v1/posts/:id/schedule` | Schedule existing post |
| `POST` | `/v1/posts/publish` | Create + publish in one request → **202** |
| `POST` | `/v1/posts/schedule` | Create + schedule in one request → **201** |

**`GET /v1/posts` query params**

| Param | Type | Description |
|-------|------|-------------|
| `page` | int | Default 1 |
| `limit` | int | Default 20, max 100 |
| `status` | string | `draft`, `scheduled`, `published`, `failed`, etc. |
| `platform` | string | Filter by platform enum |
| `search` | string | Search post content |

**Create draft body**

```json
{
  "content": "Post text",
  "platforms": ["connected-account-uuid"],
  "media": ["media-uuid-optional"]
}
```

**Schedule body** (`POST …/schedule` or `POST /v1/posts/schedule`)

```json
{
  "scheduledAt": "2026-07-15T10:00:00.000Z"
}
```

#### Scheduling & timezones (`scheduledAt`)

**Accepted formats (pick one)**

| Form | Example | Meaning |
|------|---------|---------|
| UTC | `"2026-07-20T10:00:00.000Z"` | Absolute instant: 10:00 **UTC** |
| Explicit offset | `"2026-07-20T15:30:00+05:30"` | Absolute instant (same as `04:30Z` for IST) |
| **`+default` suffix** | `"2026-07-20T10:00:00+default"` | **10:00 in the user's dashboard timezone** (`user_settings.timezone`) |
| Naive + `timezone` field | `"scheduledAt": "2026-07-20T10:00:00", "timezone": "default"` | Same as `+default` — wall time in dashboard timezone |
| Naive + IANA zone | `"scheduledAt": "2026-07-20T10:00:00", "timezone": "Asia/Kolkata"` | 10:00 in that zone |

Optional body field on schedule endpoints:

```json
{
  "timezone": "default"
}
```

- `"default"` → reads **Settings → timezone** from the DB for the API key's user (falls back to `UTC`).
- Or pass any IANA name (`"America/New_York"`, `"Asia/Kolkata"`, …) with a **naive** `scheduledAt` (no `Z`, no numeric offset).

**Recommended for agents / no manual conversion:** use `+default` when the user means “10am my time” and they already set timezone in Social0 settings:

```json
{
  "content": "Hello",
  "platforms": ["account-uuid"],
  "scheduledAt": "2026-07-20T10:00:00+default"
}
```

**Rules**

- Must be in the **future** (small grace for clock skew).
- Must be within **1 year**.
- Use `Content-Type: application/json`.
- If `scheduledAt` includes `Z` or `+05:30`, the optional `timezone` field is **ignored** (already an absolute instant).

**JavaScript examples**

```javascript
// User's dashboard timezone (easiest)
const scheduledAt = "2026-07-20T10:00:00+default";

// Or explicit UTC / offset
const scheduledAt = "2026-07-20T04:30:00.000Z";
const scheduledAt = "2026-07-20T10:00:00+05:30";
```

**Python — local → UTC (when not using +default)**

```python
from datetime import datetime
from zoneinfo import ZoneInfo

local = datetime(2026, 7, 20, 10, 0, tzinfo=ZoneInfo("Asia/Kolkata"))
scheduled_at = local.astimezone(ZoneInfo("UTC")).strftime("%Y-%m-%dT%H:%M:%S.000Z")
```

**Docs copy for agents:** *“Prefer `scheduledAt` ending in `+default` for the user's local wall time (uses their Social0 settings timezone). Otherwise send UTC (`Z`) or an explicit offset.”*

**Post statuses:** `draft`, `scheduled`, `publishing`, `published`, `partial`, `failed`

**Free tier:** Publishing or scheduling consumes free post quota (same as dashboard). Document link to billing.

**Publish response (202)**

```json
{
  "tracking_id": "uuid",
  "status": "queued",
  "stream_url": "/v1/jobs/{tracking_id}/stream"
}
```

- `status: "queued"` = job accepted; publish runs in the background. Use job endpoints for the real outcome.
- `stream_url` is a **relative path** on the same API host. Full URL: `https://api.social0.app/v1/jobs/{tracking_id}/stream` (Bearer auth).

**Create draft (`POST /v1/posts`)** returns **201** `{ "id": "post-uuid" }` only — no `tracking_id`. To publish that draft, call `POST /v1/posts/:id/publish`.

---

### 5.3 Jobs

#### `GET /v1/jobs/:trackingId`

Poll publish progress (recommended for most integrations; alternative to SSE or webhooks).

Returns the **current** job state. Status is reconciled from publish progress and post publications, so a completed post shows `status: "completed"` even if you poll after the fact.

**Response 200**

```json
{
  "tracking_id": "uuid",
  "post_id": "uuid",
  "status": "completed",
  "total": 2,
  "completed": 2,
  "failed": 0,
  "platform_statuses": [
    {
      "platform": "linkedin",
      "connected_account_id": "uuid",
      "phase": "platform_success",
      "message": "Published to linkedin",
      "error": null
    }
  ],
  "errors": [],
  "failure_reason": null,
  "created_at": "2026-07-11T14:00:00.000Z",
  "completed_at": "2026-07-11T14:01:00.000Z"
}
```

**Job `status` values:** `queued`, `processing`, `completed`, `failed`

**`platform_statuses`:** one entry per platform — **latest** phase only. On failure, `phase` is `platform_failed`, `message`/`error` contain the same human-readable reason as the dashboard (from `post_publications.last_error`).

**`errors`:** convenience array of failed platforms only — `{ platform, connected_account_id, message }`.

**`failure_reason`:** post-level summary when set (e.g. quota / billing), same as `GET /v1/posts/:id`.

#### `GET /v1/jobs/:trackingId/stream`

Optional **Server-Sent Events (SSE)** stream for live progress. Same Bearer API key auth as other `/v1` routes.

**When to use:** building a UI that shows live publish progress. For backends/CI, polling `GET /v1/jobs/:trackingId` is usually enough.

**Event types**

| Event | When |
|-------|------|
| `progress` | Meaningful phase change (`platform_uploading`, `platform_success`, `platform_failed`) |
| `done` | Job finished — payload is the same shape as `GET /v1/jobs/:trackingId` |

**`progress` payload (slim — no `user_id`, no repeated tracking IDs):**

```json
{
  "status": "processing",
  "phase": "platform_uploading",
  "platform": "bluesky",
  "message": "Uploading to bluesky",
  "completed": 0,
  "failed": 0,
  "total": 1
}
```

**`done` payload:** full job snapshot (same as poll response), e.g. `{ "tracking_id", "post_id", "status": "completed", "platform_statuses", … }`.

**Late subscribers:** if the job is already `completed` or `failed` when you open the stream, you receive a single `done` event (no replay of historical progress chunks).

**Note:** Dashboard session UI may use `/api/jobs/…/stream` internally. **Public API integrations should use `/v1/jobs/…/stream` only.**

---

### 5.4 Media

Two-step upload (same as dashboard):

#### Step 1 — `POST /v1/media/presign`

```json
{
  "filename": "photo.jpg",
  "content_type": "image/jpeg",
  "size_bytes": 1048576
}
```

**Response**

```json
{
  "upload_url": "https://…",
  "key": "uploads/{userId}/{storage_filename}",
  "storage_filename": "uuid.jpg"
}
```

#### Step 2 — Upload file

```bash
curl -X PUT "$upload_url" \
  -H "Content-Type: image/jpeg" \
  --data-binary @photo.jpg
```

#### Step 3 — `POST /v1/media/confirm`

```json
{
  "key": "uploads/…/uuid.jpg",
  "storage_filename": "uuid.jpg",
  "original_filename": "photo.jpg",
  "content_type": "image/jpeg",
  "size_bytes": 1048576
}
```

**Response 201:** `{ "id": "media-uuid", "url": "https://cdn…" }`

Use `id` in `POST /v1/posts` → `media` array.

#### `GET /v1/media/:id`
Returns metadata for owned media.

**Allowed content types:** document same as dashboard (JPEG, PNG, MP4, QuickTime; size limits 50MB images / 500MB video).

---

### 5.5 Webhooks (management API)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/webhooks` | List subscriptions |
| `POST` | `/v1/webhooks` | Create; returns `secret` once |
| `PATCH` | `/v1/webhooks/:id` | Update URL, events, or `active` |
| `DELETE` | `/v1/webhooks/:id` | Remove subscription |

---

## 6. Guide pages (tutorial style)

### 6.1 `/docs/api/guides/publish`

Walkthrough:
1. List accounts → pick UUID from `data[].id` (not the `platform` name)
2. Optional: upload media
3. `POST /v1/posts/publish` with `Content-Type: application/json` and `Idempotency-Key`
4. Poll `GET /v1/jobs/:trackingId` until `status` is `completed` or `failed` (ignore `queued` on the initial 202)
5. Optional: `GET /v1/jobs/:trackingId/stream` for live SSE in a UI
6. Optional: set up `post.published` webhook

Include full JS example:

```javascript
const API = "https://api.social0.app";
const KEY = process.env.SOCIAL0_API_KEY;

async function publish(content, accountIds) {
  const res = await fetch(`${API}/v1/posts/publish`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify({ content, platforms: accountIds }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function waitForJob(trackingId) {
  for (;;) {
    const res = await fetch(`${API}/v1/jobs/${trackingId}`, {
      headers: { Authorization: `Bearer ${KEY}` },
    });
    const job = await res.json();
    if (job.status === "completed" || job.status === "failed") return job;
    await new Promise((r) => setTimeout(r, 2000));
  }
}
```

### 6.2 `/docs/api/guides/schedule`

Explain:
- Sets `scheduledAt` on post; cron dispatches at that **absolute** time (Cloudflare scheduled queue).
- Do **not** expect instant publish.
- `scheduledAt` must be future, within 1 year.
- **Timezone:** Prefer `scheduledAt` with `+default` suffix for wall time in the user's dashboard timezone. Or use UTC/offset. `timezone: "default"` works with naive datetimes too.

Include a short “I want to post at 9am New York time” walkthrough: compute `America/New_York` → UTC → `scheduledAt`.

### 6.3 `/docs/api/guides/media`

Three-step presign → PUT → confirm flow with diagrams.

### 6.4 `/docs/api/guides/connect-accounts`

1. `POST /v1/accounts/connect` with `platform`
2. Open `authorization_url` in browser (logged-in Social0 user)
3. After callback, `GET /v1/accounts` shows new account

Call out Twitter/X and Bluesky exceptions.

---

## 7. `/docs/api/openapi` — OpenAPI & SDKs

**Content:**
- Link to live Swagger UI: **https://api.social0.app/docs**
- Link to machine-readable spec: **https://api.social0.app/openapi.json**
- OpenAPI version: **3.1.0**
- API version: **v1** (URL prefix; breaking changes → `/v2`)

**SDKs:**  
State that official SDKs are not shipped yet; users can generate clients from OpenAPI (openapi-generator, Stainless, Speakeasy, etc.).

**SSE streaming:**  
Document `GET /v1/jobs/:trackingId/stream` for optional real-time progress (Bearer API key). See §5.3 for event shapes. Prefer polling `GET /v1/jobs/:trackingId` for server-side integrations.

**Dashboard-only SSE:** `/api/jobs/:trackingId/stream` exists for the logged-in dashboard (session cookies). Third-party API clients should **not** use `/api/*` job routes.

---

## 8. Copy-paste examples block (for multiple pages)

### cURL — list posts

```bash
curl "https://api.social0.app/v1/posts?status=draft&limit=10" \
  -H "Authorization: Bearer sk_live_YOUR_KEY"
```

### cURL — schedule (UTC)

```bash
# 2026-07-14 09:00 UTC — adjust for your audience's timezone before sending
curl -X POST https://api.social0.app/v1/posts/schedule \
  -H "Authorization: Bearer sk_live_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Monday motivation",
    "platforms": ["ACCOUNT_UUID"],
    "scheduledAt": "2026-07-14T09:00:00.000Z"
  }'
```

### cURL — schedule (explicit offset, same instant as above for IST 14:30)

```bash
curl -X POST https://api.social0.app/v1/posts/schedule \
  -H "Authorization: Bearer sk_live_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Monday motivation",
    "platforms": ["ACCOUNT_UUID"],
    "scheduledAt": "2026-07-14T14:30:00+05:30"
  }'
```

### Python — full publish flow

```python
import os, time, uuid, requests

API = "https://api.social0.app"
KEY = os.environ["SOCIAL0_API_KEY"]
HEADERS = {"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}

# Publish
r = requests.post(
    f"{API}/v1/posts/publish",
    headers={**HEADERS, "Idempotency-Key": str(uuid.uuid4())},
    json={"content": "Hello API", "platforms": ["YOUR_ACCOUNT_UUID"]},
    timeout=30,
)
r.raise_for_status()
tracking_id = r.json()["tracking_id"]

# Poll
while True:
    job = requests.get(f"{API}/v1/jobs/{tracking_id}", headers=HEADERS, timeout=30).json()
    if job["status"] in ("completed", "failed"):
        print(job)
        break
    time.sleep(2)
```

### JavaScript (Node 18+) — create draft then publish

```javascript
const headers = {
  Authorization: `Bearer ${process.env.SOCIAL0_API_KEY}`,
  "Content-Type": "application/json",
};

const draft = await fetch("https://api.social0.app/v1/posts", {
  method: "POST",
  headers,
  body: JSON.stringify({
    content: "Draft via API",
    platforms: [process.env.SOCIAL0_ACCOUNT_ID],
  }),
}).then((r) => r.json());

const pub = await fetch(`https://api.social0.app/v1/posts/${draft.id}/publish`, {
  method: "POST",
  headers: { ...headers, "Idempotency-Key": crypto.randomUUID() },
}).then((r) => r.json());

console.log(pub.tracking_id);
```

---

## 9. FAQ section (add to `/docs/api` or separate FAQ)

| Question | Answer |
|----------|--------|
| Where do I get my API key? | Dashboard → Developer (`/dashboard/api-keys`) |
| What is `platforms` in the request body? | Array of **connected account IDs** (UUIDs from `GET /v1/accounts`), not platform names like `"linkedin"` |
| Why `Expected object, received string`? | Body was not sent as JSON — set `Content-Type: application/json` |
| What does `status: "queued"` on publish mean? | Job accepted (202); poll `GET /v1/jobs/:trackingId` for `completed` / `failed` |
| Poll or stream for job status? | **Poll** for backends/CI; **stream** optional for live UI (`GET /v1/jobs/:id/stream`) |
| Can I use the API on the free plan? | Yes; 60 requests/hour + free post limits apply |
| How do I connect Twitter/X? | Dashboard only (OAuth 1.0a) |
| Publish vs schedule? | `publish` enqueues immediately; `schedule` sets `scheduledAt` for cron |
| What timezone is `scheduledAt`? | Use `+default` for dashboard timezone, `timezone: "default"` with naive datetime, or UTC/offset (`Z`, `+05:30`) for absolute instants |
| How do I avoid double-posting? | Use `Idempotency-Key` on publish endpoints |
| How do I debug errors? | Note `x-request-id` header; check `error.code` in body |
| Is there a sandbox? | No separate sandbox; use a test account and draft posts |
| Will `/v1` change? | Breaking changes will ship under `/v2`; `/v1` remains stable |

---

## 10. SEO & metadata suggestions

| Page | Title | Description |
|------|-------|-------------|
| `/docs/api` | Social0 API — Publish to social media programmatically | REST API for scheduling and publishing posts to LinkedIn, Instagram, and more. |
| `/docs/api/quickstart` | Quickstart — Social0 API | Create an API key and publish your first post in 5 minutes. |
| `/docs/api/webhooks` | Webhooks — Social0 API | Receive HTTP notifications when posts are published, fail, or are scheduled. |
| `/docs/dashboard/api-keys` | Developer settings — API keys & webhooks | Manage API keys and webhook endpoints in the Social0 dashboard. |

---

## 11. Agent checklist (execution order)

Use this as a task list for the docs agent:

- [ ] **Create** `/docs/api` section with sidebar navigation (§2.1)
- [ ] **Write** Overview + Quickstart (§4.1–4.2)
- [ ] **Write** Authentication, Rate limits, Errors, Idempotency (§4.3–4.6)
- [ ] **Write** Webhooks guide with signature verification (§4.7)
- [ ] **Rewrite** `/docs/dashboard/api-keys` for Developer UI (§4.8)
- [ ] **Create** API Reference subpages for Accounts, Posts, Jobs, Media, Webhooks (§5)
- [ ] **Create** Guides: publish, schedule, media, connect-accounts (§6)
- [ ] **Create** OpenAPI page with links to live `/docs` and `openapi.json` (§7)
- [ ] **Add** FAQ (§9)
- [ ] **Update** cross-links: dashboard overview, connections, settings, fair-usage (§2.2)
- [ ] **Verify** slug `docs/dashboard/api-keys` matches app `DOCS_API_KEYS_URL`
- [ ] **Add** copy-paste examples on Quickstart + Reference pages (§8)
- [ ] **Optional:** Embed or link Swagger UI if docs framework supports OpenAPI embed

---

## 12. Out of scope / do not document yet

- API key **scopes** (not implemented; all keys full-access)
- **Workspace / team** API scoping (not implemented)
- Official **Node/Python SDK** packages (not shipped)
- Webhook **automatic retries** (not implemented; handlers should be idempotent)
- **`/v2`** endpoints (do not exist)

---

## 13. Files in main repo (for docs agent reference)

| File | Purpose |
|------|---------|
| `backend/server/openapi/openapi.json` | OpenAPI 3.1 spec (can sync or link) |
| `backend/migrations/20260711_api_keys.sql` | DB migration (ops docs only) |
| `frontend/src/features/dashboard/api-keys/ApiKeysPage.tsx` | Dashboard UI behavior reference |
| `frontend/src/lib/docs-url.ts` | Existing docs URL constants |

---

*Last updated: 2026-07-11 — includes v1 job tracking, `stream_url`, validation FAQ, and `scheduledAt` UTC/offset scheduling.*
