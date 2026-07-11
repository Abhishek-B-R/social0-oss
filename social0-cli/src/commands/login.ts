import { storeApiKey } from "../config/credentials.js";
import { getClient } from "../api/client.js";
import { listAccounts } from "../api/accounts.js";
import { success } from "../utils/output.js";
import { exitWithError } from "../utils/errors.js";
import { promptApiKey } from "./helpers.js";

export async function loginCommand(opts: { key?: string }): Promise<void> {
  const apiKey = opts.key ?? (await promptApiKey());
  await storeApiKey(apiKey);

  const client = getClient();
  client.setApiKey(apiKey);

  try {
    await listAccounts();
    success("Logged in successfully!");
    console.log("");
    console.log("  Run `social0 accounts` to see your connected accounts.");
    console.log("  Run `social0 post create` to create your first post.");
  } catch (err) {
    exitWithError(err);
  }
}

export async function loginWithKeyFlag(key: string): Promise<void> {
  if (!key.startsWith("sk_live_") && !key.startsWith("s0_live_")) {
    console.error("API key must start with sk_live_");
    process.exit(1);
  }
  await loginCommand({ key });
}
