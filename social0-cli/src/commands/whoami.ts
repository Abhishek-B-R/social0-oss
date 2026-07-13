import { hasApiKey } from "../config/credentials.js";
import { loadConfig } from "../config/settings.js";
import { listAccounts } from "../api/accounts.js";
import { printOutput } from "../utils/output.js";
import { exitWithError } from "../utils/errors.js";
import { applyGlobalOptions, ensureAccounts, formatAccountsTable, getFormat } from "./helpers.js";
import type { GlobalOptions } from "../types/index.js";

export async function whoamiCommand(opts: GlobalOptions): Promise<void> {
  applyGlobalOptions(opts);
  const format = getFormat(opts);

  if (!(await hasApiKey())) {
    console.error("Not logged in. Run `social0 login` first.");
    process.exit(1);
  }

  try {
    const aliases = await ensureAccounts();
    const config = loadConfig();

    const data = {
      authenticated: true,
      connected_accounts: aliases.length,
      api_url: config.apiUrl,
      default_timezone: config.defaultTimezone,
      accounts: formatAccountsTable(aliases),
    };

    if (format === "table") {
      console.log("");
      console.log("  Authenticated:  yes");
      console.log(`  API URL:        ${config.apiUrl}`);
      console.log(`  Accounts:       ${aliases.length} connected`);
      console.log(`  Timezone:       ${config.defaultTimezone}`);
      console.log("");
      if (aliases.length > 0) {
        printOutput(data.accounts, "table");
      }
    } else {
      printOutput(data, format);
    }
  } catch (err) {
    exitWithError(err);
  }
}
