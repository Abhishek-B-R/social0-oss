import { storeApiKey, type PassphraseMode } from "../config/credentials.js";
import { getClient } from "../api/client.js";
import { listAccounts } from "../api/accounts.js";
import { success } from "../utils/output.js";
import { exitWithError } from "../utils/errors.js";
import { promptApiKey } from "./helpers.js";
import { readStdin } from "../utils/files.js";

function validateApiKey(key: string): boolean {
  return key.startsWith("sk_live_") || key.startsWith("s0_live_");
}

export async function loginCommand(options: {
  passphrase?: boolean;
  noPassphrase?: boolean;
} = {}): Promise<void> {
  if (options.passphrase && options.noPassphrase) {
    console.error("Use either --passphrase or --no-passphrase, not both.");
    process.exit(1);
  }

  let apiKey = await readStdin();
  if (!apiKey) {
    apiKey = await promptApiKey();
  }

  if (!validateApiKey(apiKey)) {
    console.error("API key must start with sk_live_");
    process.exit(1);
  }

  let passphraseMode: PassphraseMode = "ask";
  if (options.passphrase) passphraseMode = "require";
  if (options.noPassphrase) passphraseMode = "skip";

  await storeApiKey(apiKey, { passphrase: passphraseMode });

  const client = getClient();
  client.setApiKey(apiKey);

  try {
    await listAccounts();
    success("Logged in successfully!");
    console.log("");
    console.log("  Run `social0 accounts` to see your connected accounts.");
    console.log("  Run `social0 post create` to create your first post.");
    console.log("");
    console.log("  Non-interactive: echo \"sk_live_...\" | social0 login --skip-passphrase");
    console.log("  Passphrase later: social0 passphrase set | social0 passphrase remove");
  } catch (err) {
    exitWithError(err);
  }
}
