# Billing (Dodo Payments) – Security Audit

**Date:** 2025-03  
**Scope:** `/api/billing/*`, `/api/webhooks/dodo`, `lib/subscription.ts`, `lib/plans.ts`, env and DB usage.

---

## 1. Webhook security (`/api/webhooks/dodo`)

| Check | Status | Notes |
|-------|--------|------|
| **Signature verification** | ✅ | Uses `standardwebhooks` with `DODO_PAYMENTS_WEBHOOK_SECRET`. HMAC-SHA256 over `webhook-id` + `webhook-timestamp` + raw body. Signature verified **before** parsing body. |
| **Replay protection** | ✅ | `standardwebhooks` rejects timestamps outside ±5 minutes. Old or future events are rejected. |
| **Timing-safe comparison** | ✅ | Library uses constant-time comparison for signature (no timing side-channel). |
| **Secret handling** | ✅ | Webhook secret read from `process.env` only; never logged or sent in responses. Supports `whsec_` prefix (base64-decoded). |
| **No trust of payload before verify** | ✅ | Raw body is read and passed to `wh.verify()`; only after verification is payload parsed and used. |
| **PII in logs** | ✅ | Logs redacted: no customer email, no userId, no subscription_id in success path; verification/handler errors log message only. |
| **Error responses** | ✅ | Client gets generic `"Invalid signature"` or `"Webhook handler failed"`; no stack traces or internal details. |
| **Event handling** | ✅ | Only known subscription event types are handled; unknown types are ignored (no crash). |

**Recommendation:** In Dodo Dashboard, configure webhook URL to `https://<your-domain>/api/webhooks/dodo` and subscribe only to needed events. Use a strong, unique webhook secret.

---

## 2. Checkout (`/api/billing/checkout`)

| Check | Status | Notes |
|-------|--------|------|
| **Authentication** | ✅ | `auth.api.getSession()` required; 401 if no session. |
| **Input validation** | ✅ | `plan` must be exactly `"starter"` or `"growth"`; otherwise 400. No user-controlled product IDs or quantities. |
| **Product IDs** | ✅ | `productId` comes from `PLAN_IDS` (env), not request body. |
| **Return URL** | ✅ | `return_url` built from `NEXT_PUBLIC_APP_URL` only; no user input → no open redirect. |
| **Metadata** | ✅ | `metadata.userId` is `session.user.id` (server-side). Used so webhook can attribute subscription to user. |
| **API key** | ✅ | `DODO_PAYMENTS_API_KEY` used only server-side; never exposed to client or in responses. |
| **Error logging** | ✅ | Only error message logged; no full exception (avoids leaking API or provider details). |

---

## 3. Customer portal (`/api/billing/portal`)

| Check | Status | Notes |
|-------|--------|------|
| **Authentication** | ✅ | Session required; 401 if not logged in. |
| **Authorization** | ✅ | `customerId` is loaded from DB with `where: eq(userSettings.userId, session.user.id)`. User can only open portal for their own customer ID. |
| **Redirect allowlist** | ✅ | Before redirecting, URL is parsed and host must be `customer.dodopayments.com` or `test.customer.dodopayments.com` over HTTPS. Prevents open redirect if API ever returned a bad link. |
| **API key** | ✅ | Used only server-side. |
| **Error logging** | ✅ | Only error message logged. |

---

## 4. Sync (`/api/billing/sync`)

| Check | Status | Notes |
|-------|--------|------|
| **Authentication** | ✅ | Session required; 401 if no session. |
| **Authorization** | ✅ | Subscription is matched by `session.user.email`; `setSubscription` is called only with `session.user.id`. User cannot assign another user’s subscription to themselves. |
| **Email match** | ✅ | Dodo subscription `customer.email` is compared to logged-in user’s email; only then is DB updated for that user. |
| **API key** | ✅ | Used only server-side. |
| **Error logging** | ✅ | Only error message logged. |

---

## 5. Subscription data (`lib/subscription.ts`)

| Check | Status | Notes |
|-------|--------|------|
| **Who can call `setSubscription`** | ✅ | Only (1) webhook handler (after verified signature) and (2) sync route (with `session.user.id`). |
| **Webhook → userId** | ✅ | Webhook gets userId from (a) `metadata.userId` (set by us at checkout) or (b) DB lookup by customer email. Both are from verified Dodo payload. |
| **SQL injection** | ✅ | Drizzle ORM with `eq()`; all inputs parameterized. |
| **Idempotency** | ✅ | Same subscription event can be processed multiple times (e.g. retries); last write wins. No sensitive side effects beyond DB update. |

---

## 6. Secrets and environment

| Check | Status | Notes |
|-------|--------|------|
| **`.env` in version control** | ✅ | `.gitignore` includes `.env*`; secrets not committed. |
| **Billing vars server-only** | ✅ | `DODO_PAYMENTS_*` are not `NEXT_PUBLIC_*`; not exposed to client bundle. |
| **Env validation** | ✅ | `lib/env.ts` parses with Zod; Dodo vars optional so app runs without billing configured. |

---

## 7. Dependency and build

| Check | Status | Notes |
|-------|--------|------|
| **Webhook library** | ✅ | `standardwebhooks` implements Standard Webhooks (HMAC, timestamp check, timing-safe compare). |
| **Build** | ✅ | No billing or webhook secrets in client bundle; only public app URL and auth client config are public. |

---

## 8. Summary and recommendations

- **Webhook:** Verify-then-parse, replay-safe, no PII in logs, generic error responses.
- **Checkout / Portal / Sync:** Auth’d, input validated, no open redirect, redirect allowlist on portal, server-only use of API key.
- **Data:** Subscription updates scoped to authenticated user or verified webhook payload; parameterized DB access.

**Operational recommendations:**

1. Use a **strong, unique** `DODO_PAYMENTS_WEBHOOK_SECRET` (e.g. from Dodo Dashboard) and keep it in env only.
2. In production, ensure **HTTPS** and secure cookies (e.g. SameSite, Secure) for auth.
3. Consider **rate limiting** or alerting on repeated 401s to the webhook endpoint (optional; avoid blocking legitimate Dodo retries).
4. For **audit**, enable access logs for `/api/billing/*` and `/api/webhooks/dodo` without logging request bodies or secrets.
