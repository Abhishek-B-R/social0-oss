import chalk from "chalk";
import { hasApiKey } from "../config/credentials.js";
import { resolveApiUrl } from "../config/settings.js";
import { CLI_VERSION } from "../version.js";
import { getClient } from "../api/client.js";
import { listAccounts } from "../api/accounts.js";
import { printOutput } from "../utils/output.js";
import { applyGlobalOptions, getFormat } from "./helpers.js";
import type { GlobalOptions } from "../types/index.js";


interface Diagnostic {
  check: string;
  status: "pass" | "fail" | "warn";
  message: string;
}

export async function doctorCommand(opts: GlobalOptions): Promise<void> {
  applyGlobalOptions(opts);
  const format = getFormat(opts);
  const diagnostics: Diagnostic[] = [];

  diagnostics.push({
    check: "Version",
    status: "pass",
    message: `social0 v${CLI_VERSION}`,
  });

  diagnostics.push({
    check: "Config",
    status: "pass",
    // Effective URL, including SOCIAL0_API_URL / --api-url.
    message: `API URL: ${resolveApiUrl()}`,
  });

  const authed = await hasApiKey();
  diagnostics.push({
    check: "Authentication",
    status: authed ? "pass" : "fail",
    message: authed ? "API key found in secure storage" : "Not logged in — run `social0 login`",
  });

  try {
    // Check the API this CLI is actually configured for. Probing the
    // production host told self-hosted and staging users their setup was
    // healthy no matter what their own server was doing.
    const healthUrl = `${resolveApiUrl().replace(/\/v1$/, "")}/health`;
    const res = await fetch(healthUrl, { signal: AbortSignal.timeout(5000) });
    diagnostics.push({
      check: "Internet",
      status: res.ok ? "pass" : "warn",
      message: res.ok
        ? `Connected to ${healthUrl}`
        : `API health check returned ${res.status}`,
    });
  } catch {
    diagnostics.push({
      check: "Internet",
      status: "fail",
      message: "Cannot reach Social0 API — check your connection",
    });
  }

  if (authed) {
    try {
      const client = getClient();
      await client.init();
      const accounts = await listAccounts();
      diagnostics.push({
        check: "API Access",
        status: "pass",
        message: `${accounts.length} connected account(s)`,
      });
    } catch (err) {
      diagnostics.push({
        check: "API Access",
        status: "fail",
        message: err instanceof Error ? err.message : "API request failed",
      });
    }
  }

  if (format === "table") {
    console.log("");
    console.log(chalk.bold("Social0 CLI Diagnostics"));
    console.log("");
    for (const d of diagnostics) {
      const icon =
        d.status === "pass" ? chalk.green("✓") : d.status === "warn" ? chalk.yellow("!") : chalk.red("✗");
      console.log(`  ${icon} ${chalk.bold(d.check)}: ${d.message}`);
    }
    console.log("");
    const failed = diagnostics.filter((d) => d.status === "fail").length;
    if (failed === 0) {
      console.log(chalk.green("All checks passed."));
    } else {
      console.log(chalk.red(`${failed} check(s) failed.`));
      process.exit(1);
    }
  } else {
    printOutput(diagnostics, format);
  }
}

export function versionCommand(): void {
  console.log(`social0 v${CLI_VERSION}`);
}

export async function updateCommand(): Promise<void> {
  console.log(`Current version: v${CLI_VERSION}`);
  try {
    const res = await fetch("https://registry.npmjs.org/social0/latest", {
      headers: { Accept: "application/vnd.npm.install-v1+json" },
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 404) {
      console.log("social0 is not published on npm yet.");
      console.log("Install from the repo: cd social0-cli && npm link");
      return;
    }
    if (!res.ok) {
      console.log(`Could not check for updates (HTTP ${res.status}).`);
      return;
    }
    const data = (await res.json()) as { version: string };
    if (data.version === CLI_VERSION) {
      console.log("You are on the latest version.");
    } else {
      console.log(`Update available: v${data.version}`);
      console.log("");
      console.log("  npm install -g social0@latest");
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.log(`Could not check for updates (${message}).`);
  }
}
