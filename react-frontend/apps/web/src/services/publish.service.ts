import { api, apiGet } from "@/lib/api-client";
import { getApiBaseUrl } from "@/lib/env";
import type {
  JobProgressEvent,
  JobSnapshot,
  PublishMode,
  PublishNowResponse,
  PublishScheduleResponse,
} from "@/types";

export interface PublishInput {
  postId: string;
  connectedAccountIds?: string[];
  scheduledAt?: string;
  mode?: PublishMode;
}

export type PublishProgressHandler = (event: JobProgressEvent) => void;

export const publishService = {
  async publish(
    input: PublishInput,
  ): Promise<PublishNowResponse | PublishScheduleResponse> {
    const { data } = await api.post<PublishNowResponse | PublishScheduleResponse>(
      "/api/publish",
      input,
    );
    return data;
  },

  getJob(trackingId: string): Promise<JobSnapshot> {
    return apiGet<JobSnapshot>(`/api/jobs/${trackingId}`);
  },

  subscribeToProgress(
    trackingId: string,
    onEvent: PublishProgressHandler,
    onDone?: () => void,
    onError?: (err: Error) => void,
  ): () => void {
    const url = `${getApiBaseUrl()}/api/jobs/${trackingId}/stream`;
    const es = new EventSource(url, { withCredentials: true });

    es.addEventListener("progress", (e) => {
      try {
        onEvent(JSON.parse(e.data) as JobProgressEvent);
      } catch (err) {
        onError?.(err instanceof Error ? err : new Error("Invalid SSE payload"));
      }
    });

    es.addEventListener("done", () => {
      onDone?.();
      es.close();
    });

    es.onerror = () => {
      onError?.(new Error("SSE connection failed"));
      es.close();
    };

    return () => es.close();
  },
};
