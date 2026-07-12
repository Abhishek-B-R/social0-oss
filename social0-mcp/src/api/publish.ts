import type { JobStatusResponse } from "../types/index.js";
import { getApiClient } from "./client.js";

export async function getPublishStatus(trackingId: string): Promise<JobStatusResponse> {
  return getApiClient().get<JobStatusResponse>(`/jobs/${trackingId}`);
}
