/**
 * OAuth scopes each `/v1` operation accepts (any one of them is enough), keyed
 * by method and Fastify route pattern. Mirrors the `oauth2` security of every
 * operation in `openapi/openapi.json`; `v1-scopes.test.ts` fails if they drift.
 *
 * Only OAuth callers are checked: API keys have full account access, as the
 * spec documents. An OAuth call to a route missing here is refused.
 */
export const V1_ROUTE_SCOPES: Readonly<Record<string, readonly string[]>> = {
  "GET /v1/me": ["me:read", "social0:read"],
  "GET /v1/workspaces": ["me:read", "social0:read"],
  "GET /v1/accounts": ["accounts:read", "social0:read"],
  "POST /v1/accounts/connect": ["accounts:write", "social0:write"],
  "DELETE /v1/accounts/:id": ["accounts:write", "social0:write"],
  "GET /v1/posts": ["posts:read", "social0:read"],
  "POST /v1/posts": ["posts:write", "social0:write"],
  "GET /v1/posts/:id": ["posts:read", "social0:read"],
  "PATCH /v1/posts/:id": ["posts:write", "social0:write"],
  "DELETE /v1/posts/:id": ["posts:write", "social0:write"],
  "GET /v1/posts/:id/events": ["posts:read", "jobs:read", "social0:read"],
  "POST /v1/posts/:id/publish": ["posts:write", "social0:write"],
  "POST /v1/posts/:id/schedule": ["posts:write", "social0:write"],
  "POST /v1/posts/publish": ["posts:write", "social0:write"],
  "POST /v1/posts/schedule": ["posts:write", "social0:write"],
  "POST /v1/posts/bulk-delete": ["posts:write", "social0:write"],
  "POST /v1/posts/:id/duplicate": ["posts:write", "social0:write"],
  "POST /v1/posts/:id/post-again": ["posts:write", "social0:write"],
  "PUT /v1/posts/:id/auto-plug": ["posts:write", "social0:write"],
  "DELETE /v1/posts/:id/auto-plug": ["posts:write", "social0:write"],
  "PUT /v1/posts/:id/auto-repost": ["posts:write", "social0:write"],
  "DELETE /v1/posts/:id/auto-repost": ["posts:write", "social0:write"],
  "GET /v1/jobs/:trackingId": ["jobs:read", "social0:read"],
  "GET /v1/jobs/:trackingId/stream": ["jobs:read", "social0:read"],
  "POST /v1/media/presign": ["media:write", "social0:write"],
  "POST /v1/media/confirm": ["media:write", "social0:write"],
  "GET /v1/media/:id": ["media:write", "social0:read"],
  "GET /v1/webhooks": ["webhooks:read", "social0:read"],
  "POST /v1/webhooks": ["webhooks:write", "social0:write"],
  "GET /v1/webhooks/:id": ["webhooks:read", "social0:read"],
  "PATCH /v1/webhooks/:id": ["webhooks:write", "social0:write"],
  "DELETE /v1/webhooks/:id": ["webhooks:write", "social0:write"],
  "GET /v1/webhooks/:id/deliveries": ["webhooks:read", "social0:read"],
  "POST /v1/webhooks/:id/test": ["webhooks:write", "social0:write"],
  "GET /v1/analytics/accounts": ["analytics:read", "social0:read"],
  "GET /v1/analytics/overview": ["analytics:read", "social0:read"],
  "GET /v1/analytics/posts/:postId": ["analytics:read", "social0:read"],
  "GET /v1/inbox/accounts": ["inbox:read", "social0:read"],
  "GET /v1/inbox/comments": ["inbox:read", "social0:read"],
  "POST /v1/inbox/comments/:commentId/reply": ["inbox:write", "social0:write"],
  "POST /v1/inbox/comments/:commentId/like": ["inbox:write", "social0:write"],
  "POST /v1/inbox/comments/:commentId/hide": ["inbox:write", "social0:write"],
  "GET /v1/inbox/dms": ["inbox:read", "social0:read"],
  "GET /v1/inbox/dms/:conversationId": ["inbox:read", "social0:read"],
  "POST /v1/inbox/dms/:conversationId/reply": ["inbox:write", "social0:write"],
};

/** The scopes `method` + `routeUrl` accepts, or null when the route is not listed. */
export function scopesForV1Route(method: string, routeUrl: string | undefined): readonly string[] | null {
  if (!routeUrl) return null;
  return V1_ROUTE_SCOPES[`${method.toUpperCase()} ${routeUrl}`] ?? null;
}

/** Whether a token granted `granted` may call a route that accepts `accepted`. */
export function hasV1Scope(granted: readonly string[], accepted: readonly string[]): boolean {
  return accepted.some((scope) => granted.includes(scope));
}
