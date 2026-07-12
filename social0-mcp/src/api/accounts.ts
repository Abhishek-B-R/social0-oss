import type { ConnectedAccount } from "../types/index.js";
import { getApiClient } from "./client.js";

export async function listAccounts(): Promise<ConnectedAccount[]> {
  const response = await getApiClient().get<{ data: ConnectedAccount[] }>("/accounts");
  return response.data;
}
