import { config } from "../config.js";
import type { JobProgressSnapshot, PublishNowResult, ScheduleResult } from "../types/index.js";
import { apiClient } from "./client.js";

export interface PublishPayload {
  postId: string;
  connectedAccountIds?: string[];
  scheduledAt?: string;
  mode?: "now" | "schedule";
}

export async function publishPost(payload: PublishPayload): Promise<PublishNowResult | ScheduleResult> {
  return apiClient.post<PublishNowResult | ScheduleResult>(config.apiBase, "/publish", payload);
}

export async function getPublishStatus(trackingId: string): Promise<JobProgressSnapshot> {
  return apiClient.get<JobProgressSnapshot>(config.apiBase, `/jobs/${trackingId}`);
}
