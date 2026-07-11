import type { ConnectedAccount } from "../types/index.js";
import { getClient } from "./client.js";

export async function listAccounts(): Promise<ConnectedAccount[]> {
  const response = await getClient().get<{ data: ConnectedAccount[] }>("/accounts");
  return response.data;
}

export async function connectAccount(platform: string): Promise<{ authorization_url: string }> {
  return getClient().post("/accounts/connect", { platform });
}

export async function disconnectAccount(accountId: string): Promise<void> {
  await getClient().delete(`/accounts/${accountId}`);
}
