import { getClient } from "./client.js";

export const WEBHOOK_EVENTS = ["post.published", "post.failed", "post.scheduled", "post.deleted"] as const;

export interface Webhook {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  last_delivery_at: string | null;
  last_delivery_status: string | null;
  last_delivery_response_status: number | null;
  last_delivery_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface WebhookDelivery {
  id: string;
  delivery_id: string;
  event: string;
  url: string;
  status: string;
  response_status: number | null;
  attempts: number;
  duration_ms: number | null;
  error: string | null;
  created_at: string;
}

export interface WebhookTestResult {
  delivery_id: string;
  event: string;
  url: string;
  status: string;
  response_status: number | null;
  attempts: number;
  duration_ms: number | null;
  error: string | null;
}

export async function listWebhooks(): Promise<Webhook[]> {
  const response = await getClient().get<{ data: Webhook[] }>("/webhooks");
  return response.data;
}

/** The signing `secret` is only returned here, once. */
export async function createWebhook(payload: {
  url: string;
  events: string[];
}): Promise<Pick<Webhook, "id" | "url" | "events" | "active" | "created_at"> & { secret: string }> {
  return getClient().post("/webhooks", payload);
}

export async function getWebhook(id: string): Promise<Webhook> {
  return getClient().get(`/webhooks/${id}`);
}

export async function updateWebhook(
  id: string,
  payload: { url?: string; events?: string[]; active?: boolean },
): Promise<Pick<Webhook, "id" | "url" | "events" | "active" | "updated_at">> {
  return getClient().patch(`/webhooks/${id}`, payload);
}

export async function deleteWebhook(id: string): Promise<void> {
  await getClient().delete(`/webhooks/${id}`);
}

export async function listWebhookDeliveries(
  id: string,
  query: { limit?: number; before?: string } = {},
): Promise<{ data: WebhookDelivery[]; next_before: string | null }> {
  const params = new URLSearchParams();
  if (query.limit !== undefined) params.set("limit", String(query.limit));
  if (query.before) params.set("before", query.before);
  const qs = params.toString();
  return getClient().get(`/webhooks/${id}/deliveries${qs ? `?${qs}` : ""}`);
}

export async function testWebhook(id: string): Promise<WebhookTestResult> {
  return getClient().post(`/webhooks/${id}/test`);
}
