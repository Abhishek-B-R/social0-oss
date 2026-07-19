/**
 * Mirrors frontend `app/api/**` routes. Server registers stubs; heavy handlers enqueue.
 * `async: true` → 202 + jobId, never blocks on social APIs.
 */
export type ApiRouteDef = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  /** BullMQ job name when async */
  job?: string;
  async?: boolean;
  note?: string;
};

export const FRONTEND_API_ROUTES: ApiRouteDef[] = [
  // Auth
  { method: "GET", path: "/api/auth/check-email", note: "sync - rate limited" },
  { method: "POST", path: "/api/auth/sign-up", note: "sync" },
  { method: "POST", path: "/api/auth/sign-up-with-turnstile", note: "sync" },
  { method: "GET", path: "/api/auth/subscription-check", note: "sync" },
  { method: "POST", path: "/api/auth/test-signin", note: "dev only" },
  { method: "GET", path: "/api/auth/*", note: "Better Auth catch-all" },
  { method: "POST", path: "/api/auth/*", note: "Better Auth catch-all" },

  // Legal consent
  { method: "GET", path: "/api/legal/status", note: "sync" },
  { method: "POST", path: "/api/legal/accept", note: "sync" },

  // Accounts
  { method: "GET", path: "/api/accounts", note: "sync" },
  { method: "DELETE", path: "/api/accounts/:id", note: "sync" },
  {
    method: "POST",
    path: "/api/accounts/refresh-premium",
    job: "token.refresh",
    async: true,
  },

  // Connect / OAuth (redirect flows stay sync; token refresh async)
  { method: "GET", path: "/api/connect/:platform", note: "OAuth redirect" },
  {
    method: "GET",
    path: "/api/connect/:platform/callback",
    note: "OAuth callback",
  },
  {
    method: "POST",
    path: "/api/connect/:platform/reauth",
    note: "OAuth redirect",
  },
  { method: "POST", path: "/api/connect/bluesky/byok", note: "sync" },
  { method: "GET", path: "/api/connect/instagram-facebook", note: "OAuth" },
  {
    method: "GET",
    path: "/api/connect/instagram-facebook/callback",
    note: "OAuth",
  },
  {
    method: "POST",
    path: "/api/connect/instagram-facebook/select",
    note: "sync",
  },
  { method: "POST", path: "/api/connect/facebook/select", note: "sync" },
  { method: "POST", path: "/api/connect/linkedin/select", note: "sync" },
  {
    method: "POST",
    path: "/api/connect/refresh-tokens",
    job: "token.refresh",
    async: true,
  },
  {
    method: "POST",
    path: "/api/connect/refresh-twitter-premium",
    job: "token.refresh",
    async: true,
  },

  // Media
  {
    method: "POST",
    path: "/api/media/presign",
    note: "sync - returns presigned URL",
  },
  {
    method: "POST",
    path: "/api/media/confirm",
    job: "media.confirm",
    async: true,
  },
  { method: "POST", path: "/api/media/upload", note: "deprecated" },

  // Billing
  {
    method: "POST",
    path: "/api/billing/checkout",
    note: "sync - Dodo redirect",
  },
  { method: "POST", path: "/api/billing/portal", note: "sync" },
  {
    method: "POST",
    path: "/api/billing/sync",
    job: "billing.sync",
    async: true,
  },
  { method: "POST", path: "/api/billing/change-plan", note: "sync" },
  { method: "POST", path: "/api/billing/cancel", note: "sync" },
  { method: "POST", path: "/api/billing/cancel-downgrade", note: "sync" },
  { method: "POST", path: "/api/billing/undo-cancel", note: "sync" },
  { method: "POST", path: "/api/billing/pause", note: "sync" },
  { method: "POST", path: "/api/billing/preview-plan-change", note: "sync" },

  // Queue slots
  { method: "GET", path: "/api/queue/slots", note: "sync" },
  { method: "POST", path: "/api/queue/slots", note: "sync" },
  { method: "PATCH", path: "/api/queue/slots/:id", note: "sync" },
  { method: "DELETE", path: "/api/queue/slots/:id", note: "sync" },
  { method: "GET", path: "/api/queue/next-slot", note: "sync" },
  { method: "POST", path: "/api/queue/add", note: "sync" },

  // Pinterest
  { method: "GET", path: "/api/pinterest/boards", note: "sync" },
  { method: "POST", path: "/api/pinterest/boards", note: "sync" },
  { method: "PUT", path: "/api/pinterest/default-board", note: "sync" },

  // Account email
  { method: "POST", path: "/api/account/change-email/send-otp", note: "sync" },
  { method: "POST", path: "/api/account/change-email", note: "sync" },

  // Teams / Workspace
  { method: "GET", path: "/api/team", note: "sync" },
  { method: "GET", path: "/api/team/context", note: "sync" },
  { method: "GET", path: "/api/team/workspaces", note: "sync" },
  { method: "POST", path: "/api/team/workspaces", note: "sync" },
  { method: "POST", path: "/api/team/switch", note: "sync" },
  { method: "POST", path: "/api/team/leave", note: "sync" },
  { method: "GET", path: "/api/team/invitations", note: "sync" },
  { method: "POST", path: "/api/team/invite", note: "sync" },
  { method: "POST", path: "/api/team/accept", note: "sync" },
  { method: "PATCH", path: "/api/team/member/:id/role", note: "sync" },
  { method: "DELETE", path: "/api/team/member/:id", note: "sync" },
  { method: "DELETE", path: "/api/team/invitation/:id", note: "sync" },

  // Canny
  { method: "GET", path: "/api/canny/sso", note: "sync" },
  { method: "GET", path: "/api/canny/config", note: "sync — public board token" },

  // Webhooks
  {
    method: "POST",
    path: "/api/webhooks/dodo",
    note: "sync - verify signature",
  },

  // Crons → enqueue sweeps (never run publish inline on server)
  {
    method: "POST",
    path: "/api/cron/publish-scheduled",
    job: "cron.publish-scheduled",
    async: true,
  },
  { method: "POST", path: "/api/cron/repost", job: "cron.repost", async: true },
  {
    method: "POST",
    path: "/api/cron/autoplug",
    job: "cron.autoplug",
    async: true,
  },
  {
    method: "POST",
    path: "/api/cron/token-health",
    job: "token.health-sweep",
    async: true,
  },
  {
    method: "POST",
    path: "/api/cron/billing-zombie-cleanup",
    note: "sync - cancel stale unpaid Dodo subscriptions",
  },

  // Dev
  {
    method: "POST",
    path: "/api/dev/trigger-crons",
    note: "dev only - enqueue all crons",
  },

  // Publish
  {
    method: "POST",
    path: "/api/publish",
    job: "publish.post",
    async: true,
    note: "Publish now → 202 + SSE streamUrl; schedule → 200 scheduled (BullMQ delay)",
  },
  {
    method: "GET",
    path: "/api/jobs/:trackingId",
    note: "Job progress snapshot",
  },
  {
    method: "GET",
    path: "/api/jobs/:trackingId/stream",
    note: "SSE live progress - publish now only",
  },
];
