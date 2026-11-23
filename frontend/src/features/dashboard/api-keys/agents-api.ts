import { fetchApi } from "@/lib/fetch-api";
import { toClientErrorMessage } from "@/lib/client-error-message";
import { listAgentConnections } from "@/api/dashboard";
import type { SubscriptionTier } from "@/lib/plans";

/*
 * REST helpers for the AI agents page (API keys + webhooks). Endpoints live in
 * backend/server/src/routes/api/api-platform.ts. API keys are personal
 * credentials: they never change with the workspace switcher.
 */

export const AGENTS_QUERY_KEYS = {
  keys: ["api-keys"] as const,
  connections: ["agent-connections"] as const,
  webhooks: ["webhooks"] as const,
  deliveries: (id: string) => ["webhooks", id, "deliveries"] as const,
};

export type ApiKeyRow = {
  id: string;
  name: string;
  keyPrefix: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string | null;
};

export type WebhookDeliveryStatus = "delivered" | "failed" | "blocked";

export type WebhookRow = {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  lastDeliveryAt: string | null;
  lastDeliveryStatus: WebhookDeliveryStatus | null;
  lastDeliveryResponseStatus: number | null;
  lastDeliveryError: string | null;
  createdAt: string | null;
  updatedAt?: string | null;
};

export type WebhookDelivery = {
  id: string;
  deliveryId: string;
  event: string;
  url: string;
  status: WebhookDeliveryStatus | string;
  responseStatus: number | null;
  attempts: number;
  durationMs: number | null;
  error: string | null;
  createdAt: string;
  /**
   * Opaque keyset cursor; pass the last row's value as `before` for the next
   * page. `createdAt` is millisecond-truncated, so paging by it skips rows that
   * share the boundary row's millisecond. Optional only for an older API.
   */
  cursor?: string;
};

export type WebhookTestOutcome = {
  status: WebhookDeliveryStatus;
  responseStatus: number | null;
  attempts: number;
  durationMs: number;
  error: string | null;
};

/** Events a subscription can listen to (mirrors `WEBHOOK_EVENTS` on the server). */
export const WEBHOOK_EVENT_OPTIONS = [
  { value: "post.published", label: "Post published" },
  { value: "post.failed", label: "Post failed" },
  { value: "post.scheduled", label: "Post scheduled" },
  { value: "post.deleted", label: "Post deleted" },
] as const;

export const WEBHOOK_DELIVERIES_PAGE_SIZE = 25;

async function readError(res: Response, fallback: string): Promise<never> {
  const text = await res.text().catch(() => "");
  throw new Error(toClientErrorMessage(text, fallback));
}

async function json<T>(res: Response, fallback: string): Promise<T> {
  if (!res.ok) return readError(res, fallback);
  return (await res.json()) as T;
}

function jsonInit(method: string, body?: unknown): RequestInit {
  return {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  };
}

// ── API keys ────────────────────────────────────────────────────────────────

/**
 * The signed-in user's own `/v1` budget. Keys are personal, so the API limits
 * them by the key owner's plan, never the active workspace owner's; the server
 * computes this from the same table it enforces.
 */
export type ApiKeyRateLimit = {
  tier: SubscriptionTier;
  requestsPerHour: number;
};

export async function fetchApiKeys(): Promise<{
  keys: ApiKeyRow[];
  rateLimit: ApiKeyRateLimit | null;
}> {
  const res = await fetchApi("/api/api-keys");
  const data = await json<{ keys: ApiKeyRow[]; rateLimit?: ApiKeyRateLimit }>(
    res,
    "Couldn't load your API keys.",
  );
  return { keys: data.keys, rateLimit: data.rateLimit ?? null };
}

/** Returns the raw key. It is shown once and stored hashed. */
export async function createApiKey(input: {
  name: string;
  expiresAt: string | null;
}): Promise<{ key: string; apiKey: { id: string; name: string } }> {
  const res = await fetchApi(
    "/api/api-keys",
    jsonInit("POST", {
      name: input.name,
      ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
    }),
  );
  return json(res, "Couldn't create the key. Try again.");
}

export async function renameApiKey(id: string, name: string): Promise<void> {
  const res = await fetchApi(
    `/api/api-keys/${encodeURIComponent(id)}`,
    jsonInit("PATCH", { name }),
  );
  await json(res, "Couldn't rename the key. Try again.");
}

/** Revokes the old key and returns a new raw key with the same name. */
export async function regenerateApiKey(
  id: string,
): Promise<{ key: string; apiKey: { id: string; name: string } }> {
  const res = await fetchApi(
    `/api/api-keys/${encodeURIComponent(id)}/regenerate`,
    jsonInit("POST"),
  );
  return json(res, "Couldn't regenerate the key. Try again.");
}

export async function fetchAgentConnections() {
  const result = await listAgentConnections();
  if (!result.ok) throw new Error(result.error || "Couldn't load connected agents.");
  return result.data;
}

// ── Webhooks ────────────────────────────────────────────────────────────────

export async function fetchWebhooks(): Promise<WebhookRow[]> {
  const res = await fetchApi("/api/webhooks/subscriptions");
  const data = await json<{ subscriptions: WebhookRow[] }>(
    res,
    "Couldn't load your webhooks.",
  );
  return data.subscriptions;
}

/** Returns the signing secret. It is shown once. */
export async function createWebhook(input: {
  url: string;
  events: string[];
}): Promise<{ secret: string; subscription: { id: string } }> {
  const res = await fetchApi("/api/webhooks/subscriptions", jsonInit("POST", input));
  return json(res, "Couldn't add the endpoint. Try again.");
}

export async function deleteWebhook(id: string): Promise<void> {
  const res = await fetchApi(
    `/api/webhooks/subscriptions/${encodeURIComponent(id)}`,
    jsonInit("DELETE"),
  );
  await json(res, "Couldn't delete the endpoint. Try again.");
}

export async function sendWebhookTest(id: string): Promise<WebhookTestOutcome> {
  const res = await fetchApi(
    `/api/webhooks/subscriptions/${encodeURIComponent(id)}/test`,
    jsonInit("POST"),
  );
  const body = await json<{ delivery?: WebhookTestOutcome }>(
    res,
    "Couldn't send the test delivery. Try again.",
  );
  if (!body.delivery) throw new Error("Couldn't send the test delivery. Try again.");
  return body.delivery;
}

export async function fetchWebhookDeliveries(
  id: string,
  before: string | null,
): Promise<WebhookDelivery[]> {
  const qs = new URLSearchParams({ limit: String(WEBHOOK_DELIVERIES_PAGE_SIZE) });
  if (before) qs.set("before", before);
  const res = await fetchApi(
    `/api/webhooks/subscriptions/${encodeURIComponent(id)}/deliveries?${qs}`,
  );
  const data = await json<{ deliveries: WebhookDelivery[] }>(
    res,
    "Couldn't load deliveries.",
  );
  return data.deliveries;
}
