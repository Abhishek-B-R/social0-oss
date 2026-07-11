import { config } from "../config.js";
import type { ConnectedAccount } from "../types/index.js";
import { apiClient } from "./client.js";

export async function listAccounts(): Promise<ConnectedAccount[]> {
  return apiClient.get<ConnectedAccount[]>(config.apiBase, "/accounts");
}

export async function getAccount(accountId: string): Promise<ConnectedAccount & { publicationCount?: number }> {
  return apiClient.get(config.apiBase, `/accounts/${accountId}`);
}
