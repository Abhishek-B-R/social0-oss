import type { JobStatusResponse } from "../types/index.js";
import { getClient } from "./client.js";
import { getApiKey } from "../config/credentials.js";
import { resolveApiUrl } from "../config/settings.js";

export async function getJobStatus(trackingId: string): Promise<JobStatusResponse> {
  return getClient().get<JobStatusResponse>(`/jobs/${trackingId}`);
}

export async function* streamJobEvents(trackingId: string): AsyncGenerator<Record<string, unknown>> {
  const apiKey = await getApiKey();
  if (!apiKey) throw new Error("Not authenticated");

  const base = resolveApiUrl();
  const url = `${base}/jobs/${trackingId}/stream`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "text/event-stream",
    },
  });

  if (!response.ok || !response.body) {
    throw new Error(`SSE stream failed: HTTP ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          yield JSON.parse(line.slice(6)) as Record<string, unknown>;
        } catch {
          // skip malformed events
        }
      }
    }
  }
}

export async function pollUntilComplete(
  trackingId: string,
  onUpdate?: (status: JobStatusResponse) => void,
): Promise<JobStatusResponse> {
  while (true) {
    const status = await getJobStatus(trackingId);
    onUpdate?.(status);
    if (status.status === "completed" || status.status === "failed" || status.status === "partial") {
      return status;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
}
