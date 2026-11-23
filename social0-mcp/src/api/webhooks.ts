import { apiClient } from "./client.js";

type Json = Record<string, unknown>;

export async function listWebhooks(): Promise<Json> {
  return apiClient.get("/webhooks");
}

export async function createWebhook(body: { url: string; events: string[] }): Promise<Json> {
  return apiClient.post("/webhooks", body);
}

export async function getWebhook(id: string): Promise<Json> {
  return apiClient.get(`/webhooks/${encodeURIComponent(id)}`);
}

export async function updateWebhook(
  id: string,
  body: { url?: string; events?: string[]; active?: boolean },
): Promise<Json> {
  return apiClient.patch(`/webhooks/${encodeURIComponent(id)}`, body);
}

export async function deleteWebhook(id: string): Promise<void> {
  await apiClient.delete(`/webhooks/${encodeURIComponent(id)}`);
}

export async function listWebhookDeliveries(
  id: string,
  query: { limit?: number; before?: string } = {},
): Promise<Json> {
  const params = new URLSearchParams();
  if (query.limit !== undefined) params.set("limit", String(query.limit));
  if (query.before) params.set("before", query.before);
  const qs = params.toString();
  return apiClient.get(`/webhooks/${encodeURIComponent(id)}/deliveries${qs ? `?${qs}` : ""}`);
}

export async function testWebhook(id: string): Promise<Json> {
  return apiClient.post(`/webhooks/${encodeURIComponent(id)}/test`);
}
