import type { ConnectedAccount } from "../types/index.js";
import { apiClient } from "./client.js";

export async function listAccounts(): Promise<ConnectedAccount[]> {
  const response = await apiClient.get<{ data: ConnectedAccount[] }>("/accounts");
  return response.data;
}

export async function getMe(): Promise<Record<string, unknown>> {
  return apiClient.get("/me");
}

export async function listWorkspaces(): Promise<Record<string, unknown>[]> {
  const response = await apiClient.get<{ data: Record<string, unknown>[] }>("/workspaces");
  return response.data;
}

export async function connectAccount(platform: string): Promise<{ authorization_url: string }> {
  return apiClient.post("/accounts/connect", { platform });
}

export async function disconnectAccount(accountId: string): Promise<void> {
  await apiClient.delete(`/accounts/${encodeURIComponent(accountId)}`);
}
