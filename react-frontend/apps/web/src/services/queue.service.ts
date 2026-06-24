import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api-client";
import type { QueueSlot } from "@/types";

export const queueService = {
  listSlots(): Promise<QueueSlot[]> {
    return apiGet<QueueSlot[]>("/api/queue/slots");
  },

  createSlot(input: {
    daysOfWeek: number[];
    hour: number;
    minute: number;
  }): Promise<QueueSlot> {
    return apiPost<QueueSlot>("/api/queue/slots", input);
  },

  updateSlot(
    id: string,
    input: Partial<{ daysOfWeek: number[]; hour: number; minute: number; isActive: boolean }>,
  ): Promise<QueueSlot> {
    return apiPatch<QueueSlot>(`/api/queue/slots/${id}`, input);
  },

  deleteSlot(id: string): Promise<void> {
    return apiDelete(`/api/queue/slots/${id}`);
  },

  nextSlot(): Promise<{ scheduledFor: string | null }> {
    return apiGet("/api/queue/next-slot");
  },

  addToQueue(input: { postId: string; slotId?: string }): Promise<{ ok: boolean }> {
    return apiPost("/api/queue/add", input);
  },
};
