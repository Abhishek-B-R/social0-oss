import { apiDelete, apiGet, apiPost } from "@/lib/api-client";
import type { ConnectedAccount } from "@/types";

export const accountsService = {
  list(): Promise<ConnectedAccount[]> {
    return apiGet<ConnectedAccount[]>("/api/accounts");
  },

  disconnect(id: string): Promise<{ ok: boolean }> {
    return apiDelete<{ ok: boolean }>(`/api/accounts/${id}`);
  },

  refreshPremium(): Promise<{ jobId: string }> {
    return apiPost<{ jobId: string }>("/api/accounts/refresh-premium");
  },
};
