# Social0 React Rebuild — Master Agent Prompt

Use this prompt **one feature at a time**. Do not generate the entire frontend in one shot.

---

## Context

- **Repo:** `social0` at repo root
- **New frontend:** `react-frontend/apps/web` (React 19 + Vite + TypeScript)
- **Backend:** `backend/server` (Fastify) + `backend/worker` (BullMQ)
- **Legacy reference:** `frontend/` (Next.js — do not modify unless fixing shared types)
- **Branch:** `cursor/backend-v2-server-engine-worker`
- **API manifest:** `backend/shared/src/api-routes.ts`
- **Backend docs:** `backend/claude.md`

## Rules

- **No database commands** — no `psql`, `drizzle-kit push`, `drizzle migrate`. Schema in `react-frontend/apps/web/src/db/schema.ts` is reference-only.
- **No mock services** unless marked `@mock` in filename.
- **Strict TypeScript** — no `any`.
- **All API calls** go through `src/services/*.service.ts` + Axios (`src/lib/api-client.ts`).
- **Auth:** Better Auth client (`src/lib/auth-client.ts`), `credentials: include`.
- **Publish now:** SSE via `publishService.subscribeToProgress()`.
- **Publish schedule:** instant success toast, no SSE.
- Match existing Social0 design: emerald accent `#10b981`, semantic CSS vars in `src/index.css`.

---

## Prompt template (copy per feature)

```
You are a senior staff frontend engineer working in social0/react-frontend/apps/web.

Task: Implement the **[FEATURE NAME]** feature to production quality.

Reference the existing Next.js implementation in frontend/:
- Routes: [list paths]
- Components: [list components]
- Server actions to port: [list actions → REST endpoints needed]

Requirements:
1. Use existing architecture: features/, services/, hooks/, stores/
2. Wire TanStack Query for data fetching
3. Use React Hook Form + Zod for forms
4. Preserve all UX flows from Next.js — do not simplify
5. If backend endpoint is stubbed (/v1/*), add a TODO and implement the UI against the service contract anyway
6. Run `npm run typecheck` and `npm run build` when done
7. Do not run any database commands

Deliver: complete feature code only. No explanations.
```

---

## Feature build order

### 1. Auth ✅ (scaffolded)
- `/auth`, `/auth/verify-email`, `/auth/forgot-password`, `/auth/reset-password`
- Better Auth email + Google + OTP flows
- Route guards: unverified → verify-email, incomplete onboarding → `/onboarding`

### 2. Onboarding
- `/onboarding`, step2–4
- Plan selection → `billingService.checkout`
- Connect step → `accountsService.list`
- Reference: `frontend/app/onboarding/**`

### 3. Connections
- `/dashboard/connections` + FB/IG/LinkedIn select pages
- OAuth redirects (full page — not XHR)
- Bluesky BYOK modal
- Disconnect, refresh premium
- Reference: `frontend/app/dashboard/connections/**`, `ConnectionsPageClient`

### 4. Billing
- `/dashboard/billing` — full `BillingClient` parity
- Change plan, cancel, downgrade, pause, preview
- Reference: `frontend/app/dashboard/billing/**`

### 5. Composer + Publishing
- `/dashboard/composer` — bridge to create flows
- Create forms: text, image, video, threads, collection
- Media upload: `mediaService.uploadFile` (presign → PUT → confirm)
- Publish now + SSE progress panel
- **Blocker:** needs `POST /v1/posts` on backend — port from `frontend/app/actions/posts.ts`

### 6. Posts
- List: all, drafts, scheduled, posted
- Detail + edit + publish button
- Reference: `frontend/app/dashboard/posts/**`, `PostsPageClient`

### 7. Calendar
- Day / week / month views
- Drag-and-drop rescheduling
- Reference: `frontend/app/dashboard/calendar/**`, `CalendarClient`

### 8. Settings
- Timezone, display name, email change OTP
- Queue schedule section (`queueService`)
- Reference: `frontend/app/dashboard/settings/**`, `SettingsClient`

### 9. Automations
- Auto-resurface panel (X)
- Auto-plug panel (X)
- Reference: `frontend/components/repost/**`, `frontend/components/autoplug/**`
- **Blocker:** needs `/v1/automations/*` on backend

### 10. Bulk tools
- `/dashboard/bulk-tools/image`, `/video`
- Reference: `frontend/app/dashboard/bulk-tools/**`

### 11. API keys + Feedback
- `/dashboard/api-keys` — `apiKeysService`
- `/dashboard/feedback` — Canny SSO token

### 12. Marketing
- Landing, features, alternatives, terms, privacy
- Reference: `frontend/app/page.tsx`, `frontend/components/landing/**`

---

## Screenshots & inputs to attach per session

When starting a feature agent session, attach:

1. Screenshots of every page in that feature (from production or localhost Next app)
2. This file + `react-frontend/README.md`
3. `backend/shared/src/api-routes.ts`
4. Relevant `frontend/app/**` and `frontend/components/**` source files

---

## Backend endpoints the SPA uses today

| Service | Endpoints |
|---------|-----------|
| `authService` | `/api/auth/check-email`, sign-up, change-email |
| `accountsService` | `/api/accounts` |
| `connectionsService` | `/api/connect/*` (redirects + BYOK + select) |
| `mediaService` | `/api/media/presign`, `/api/media/confirm` |
| `publishService` | `/api/publish`, `/api/jobs/:id/stream` (SSE) |
| `billingService` | `/api/billing/*` |
| `queueService` | `/api/queue/*` |
| `postsService` | `/v1/posts` (**stub on backend**) |
| `settingsService` | `/v1/settings` (**not implemented**) |
| `automationService` | `/v1/automations/*` (**not implemented**) |

---

## SSE publish integration (reference)

```ts
const res = await publishService.publish({ postId, connectedAccountIds, mode: "now" });
if ("trackingId" in res) {
  publishService.subscribeToProgress(res.trackingId, (event) => {
    // event.phase: queued | platform_uploading | platform_success | platform_failed | completed
  });
}
```

---

## Staging cutover checklist (do not rush prod)

1. Deploy backend + Redis + workers to staging
2. Point `VITE_API_URL` at staging API
3. Run React app on staging host (or CF Pages)
4. Test auth cookies cross-origin (same-site or proxy)
5. Test OAuth redirects with updated `NEXT_PUBLIC_APP_URL`
6. Test publish SSE end-to-end
7. Switch Dodo webhook to backend only after billing QA
8. Keep Next.js prod running until 30-day parallel test completes
