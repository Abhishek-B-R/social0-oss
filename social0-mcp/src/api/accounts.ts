import type { ConnectedAccount } from "../types/index.js";
import { apiClient } from "./client.js";

export async function listAccounts(): Promise<ConnectedAccount[]> {
  const response = await apiClient.get<{ data: ConnectedAccount[] }>("/accounts");
  return response.data;
}
