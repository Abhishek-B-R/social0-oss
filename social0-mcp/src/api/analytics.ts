import { apiClient } from "./client.js";
import type {
  AnalyticsAccount,
  AnalyticsOverview,
  AnalyticsWindowQuery,
  PostAnalytics,
} from "../types/index.js";

function windowQuery(query: AnalyticsWindowQuery): string {
  const params = new URLSearchParams();
  if (query.range) params.set("range", query.range);
  if (query.since) params.set("since", query.since);
  if (query.until) params.set("until", query.until);
  if (query.account_id) params.set("account_id", query.account_id);
  if (query.fresh) params.set("fresh", "1");
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export async function listAnalyticsAccounts(): Promise<AnalyticsAccount[]> {
  const response = await apiClient.get<{ data: AnalyticsAccount[] }>(
    "/analytics/accounts",
  );
  return response.data;
}

export async function getOverview(
  query: AnalyticsWindowQuery = {},
): Promise<AnalyticsOverview> {
  return apiClient.get<AnalyticsOverview>(
    `/analytics/overview${windowQuery(query)}`,
  );
}

export async function getPostAnalytics(postId: string): Promise<PostAnalytics> {
  return apiClient.get<PostAnalytics>(
    `/analytics/posts/${encodeURIComponent(postId)}`,
  );
}
