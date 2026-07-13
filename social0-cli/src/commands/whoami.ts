import { hasApiKey } from "../config/credentials.js";
import { loadConfig } from "../config/settings.js";
import { getMe } from "../api/me.js";
import { printOutput } from "../utils/output.js";
import { exitWithError } from "../utils/errors.js";
import { applyGlobalOptions, getFormat } from "./helpers.js";
import type { GlobalOptions } from "../types/index.js";

export async function whoamiCommand(opts: GlobalOptions): Promise<void> {
  applyGlobalOptions(opts);
  const format = getFormat(opts);

  if (!(await hasApiKey())) {
    console.error("Not logged in. Run `social0 login` first.");
    process.exit(1);
  }

  try {
    const me = await getMe();
    const config = loadConfig();

    const data = {
      id: me.id,
      name: me.name,
      email: me.email,
      plan: me.plan,
      timezone: me.timezone,
      api_url: config.apiUrl,
      api_key: me.api_key,
      created_at: me.created_at,
    };

    if (format === "table") {
      console.log("");
      console.log(`  Name:     ${me.name ?? "—"}`);
      console.log(`  Email:    ${me.email}`);
      console.log(`  Plan:     ${me.plan}`);
      console.log(`  Timezone: ${me.timezone}`);
      if (me.api_key) {
        console.log(`  API key:  ${me.api_key.name} (${me.api_key.prefix}…)`);
      }
      console.log(`  API URL:  ${config.apiUrl}`);
      console.log("");
      console.log("  Run `social0 accounts` to list connected social accounts.");
    } else {
      printOutput(data, format);
    }
  } catch (err) {
    exitWithError(err);
  }
}
