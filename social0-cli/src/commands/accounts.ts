import chalk from "chalk";
import { connectAccount, disconnectAccount } from "../api/accounts.js";
import { printOutput, success, info } from "../utils/output.js";
import { exitWithError } from "../utils/errors.js";
import {
  applyGlobalOptions,
  ensureAccounts,
  formatAccountsTable,
  getFormat,
  confirmAction,
} from "./helpers.js";
import {
  resolveAliasToId,
  formatPlatformName,
  setAccountCache,
} from "../utils/aliases.js";
import type { GlobalOptions } from "../types/index.js";
import { SUPPORTED_PLATFORMS } from "../types/index.js";

export async function accountsCommand(
  action: string | undefined,
  arg: string | undefined,
  opts: GlobalOptions,
): Promise<void> {
  applyGlobalOptions(opts);
  const format = getFormat(opts);

  try {
    if (!action || action === "list") {
      const aliases = await ensureAccounts();
      if (aliases.length === 0) {
        info("No connected accounts.");
        console.log("");
        console.log("  Connect an account:");
        console.log("    social0 accounts connect linkedin");
        console.log("    social0 accounts connect twitter");
        return;
      }
      printOutput(formatAccountsTable(aliases), format);
      if (format === "table") {
        console.log("");
        console.log(chalk.dim("  Use account IDs (1, 2, 3...) when creating posts."));
      }
      return;
    }

    if (action === "connect") {
      if (!arg) {
        console.error("Usage: social0 accounts connect <platform>");
        console.error(`Platforms: ${SUPPORTED_PLATFORMS.map(formatPlatformName).join(", ")}`);
        process.exit(1);
      }
      const platform = arg.toLowerCase().replace(/^twitter$/, "twitter_x");
      const result = await connectAccount(platform);
      success("Authorization URL generated.");
      console.log("");
      console.log(result.authorization_url);
      console.log("");
      console.log(chalk.dim("  Open this URL in your browser to connect your account."));
      return;
    }

    if (action === "disconnect") {
      if (!arg) {
        console.error("Usage: social0 accounts disconnect <id>");
        console.error("  Use the numeric ID from `social0 accounts` (e.g. 1, 2, 3)");
        process.exit(1);
      }
      const aliases = await ensureAccounts();
      const aliasNum = Number(arg);
      const accountId = resolveAliasToId(aliasNum, aliases.map((a) => a.account));
      if (!accountId) {
        console.error(`Account ID ${arg} not found. Run \`social0 accounts\` to see available IDs.`);
        process.exit(1);
      }
      const account = aliases.find((a) => a.alias === aliasNum);
      const label = account ? formatPlatformName(account.account.platform) : arg;
      const confirmed = await confirmAction(`Disconnect ${label} (account #${arg})?`);
      if (!confirmed) {
        info("Cancelled.");
        return;
      }
      await disconnectAccount(accountId);
      setAccountCache([]);
      success(`Disconnected account #${arg} (${label}).`);
      return;
    }

    console.error(`Unknown accounts action: ${action}`);
    process.exit(1);
  } catch (err) {
    exitWithError(err);
  }
}
