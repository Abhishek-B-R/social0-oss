import { storeApiKey } from "../config/credentials.js";
import { getClient } from "../api/client.js";
import { listAccounts } from "../api/accounts.js";
import { success } from "../utils/output.js";
import { exitWithError } from "../utils/errors.js";
import { promptApiKey } from "./helpers.js";
import { readStdin } from "../utils/files.js";

function validateApiKey(key: string): boolean {
  return key.startsWith("sk_live_") || key.startsWith("s0_live_");
}

export async function loginCommand(): Promise<void> {
  let apiKey = await readStdin();
  if (!apiKey) {
    apiKey = await promptApiKey();
  }

  if (!validateApiKey(apiKey)) {
    console.error("API key must start with sk_live_");
    process.exit(1);
  }

  await storeApiKey(apiKey);

  const client = getClient();
  client.setApiKey(apiKey);

  try {
    await listAccounts();
    success("Logged in successfully!");
    console.log("");
    console.log("  Run `social0 accounts` to see your connected accounts.");
    console.log("  Run `social0 post create` to create your first post.");
    console.log("");
    console.log("  Non-interactive: echo \"sk_live_...\" | social0 login");
  } catch (err) {
    exitWithError(err);
  }
}
