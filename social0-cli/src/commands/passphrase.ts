import {
  disablePassphrase,
  enablePassphrase,
  getCredentialStorage,
} from "../config/credentials.js";
import { success } from "../utils/output.js";
import { exitWithError } from "../utils/errors.js";

function storageLabel(storage: Awaited<ReturnType<typeof getCredentialStorage>>): string {
  switch (storage) {
    case "env":
      return "SOCIAL0_API_KEY environment variable";
    case "keychain":
      return "OS keychain (no local passphrase)";
    case "encrypted":
      return "local file encrypted with passphrase";
    case "plaintext":
      return "local file (no passphrase)";
    case "none":
      return "not logged in";
  }
}

export async function passphraseCommand(action: string | undefined): Promise<void> {
  try {
    if (!action || action === "status") {
      const storage = await getCredentialStorage();
      console.log("");
      console.log(`  Credential storage: ${storageLabel(storage)}`);
      if (storage === "encrypted") {
        console.log("  Passphrase:         enabled");
        console.log("");
        console.log("  Run `social0 passphrase remove` to store without a passphrase.");
      } else if (storage === "plaintext") {
        console.log("  Passphrase:         disabled");
        console.log("");
        console.log("  Run `social0 passphrase set` to encrypt with a passphrase.");
      } else if (storage === "keychain" || storage === "env") {
        console.log("  Passphrase:         not used");
      } else {
        console.log("");
        console.log("  Run `social0 login` to authenticate.");
      }
      console.log("");
      return;
    }

    if (action === "set") {
      const result = await enablePassphrase();
      if (result === "none") {
        console.error("Not logged in. Run `social0 login` first.");
        process.exit(1);
      }
      if (result === "keychain") {
        console.log("Credentials are in the OS keychain / env — a local passphrase is not used.");
        return;
      }
      success("Passphrase enabled. Local credentials are now encrypted.");
      return;
    }

    if (action === "remove") {
      const result = await disablePassphrase();
      if (result === "none") {
        console.error("Not logged in. Run `social0 login` first.");
        process.exit(1);
      }
      if (result === "keychain") {
        console.log("Credentials are in the OS keychain / env — a local passphrase is not used.");
        return;
      }
      if (result === "already") {
        console.log("Passphrase is already disabled.");
        return;
      }
      success("Passphrase removed. Credentials are stored in a local file (mode 0600).");
      console.log("  Tip: prefer OS keychain when available, or re-enable with `social0 passphrase set`.");
      return;
    }

    console.error("Usage: social0 passphrase [status|set|remove]");
    process.exit(1);
  } catch (err) {
    exitWithError(err);
  }
}
