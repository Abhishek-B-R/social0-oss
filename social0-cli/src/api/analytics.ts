import type {
  AnalyticsAccount,
  AnalyticsOverview,
  AnalyticsWindowQuery,
  PostAnalytics,
} from "../types/index.js";
import { getClient } from "./client.js";
import { analyticsQueryString } from "./query.js";

export async function listAnalyticsAccounts(): Promise<AnalyticsAccount[]> {
  const response = await getClient().get<{ data: AnalyticsAccount[] }>(
    "/analytics/accounts",
  );
  return response.data;
}

export async function getAnalyticsOverview(
  query: AnalyticsWindowQuery = {},
): Promise<AnalyticsOverview> {
  return getClient().get<AnalyticsOverview>(
    `/analytics/overview${analyticsQueryString(query)}`,
  );
}

export async function getPostAnalytics(postId: string): Promise<PostAnalytics> {
  return getClient().get<PostAnalytics>(
    `/analytics/posts/${encodeURIComponent(postId)}`,
  );
}
