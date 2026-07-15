import type { JobStatusResponse } from "../types/index.js";
import { apiClient } from "./client.js";

export async function getPublishStatus(trackingId: string): Promise<JobStatusResponse> {
  return apiClient.get<JobStatusResponse>(`/jobs/${trackingId}`);
}
