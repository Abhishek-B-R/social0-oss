import { loadConfig, saveConfig, setConfigValue } from "../config/settings.js";
import { printOutput } from "../utils/output.js";
import { success } from "../utils/output.js";
import { applyGlobalOptions, getFormat } from "./helpers.js";
import type { CliConfig, GlobalOptions } from "../types/index.js";

const CONFIG_KEYS: Array<keyof CliConfig> = [
  "apiUrl",
  "defaultWorkspace",
  "defaultTimezone",
  "defaultPlatform",
  "outputFormat",
];

export async function configCommand(
  action: string | undefined,
  key: string | undefined,
  value: string | undefined,
  opts: GlobalOptions,
): Promise<void> {
  applyGlobalOptions(opts);
  const format = getFormat(opts);

  if (!action || action === "list") {
    const config = loadConfig();
    if (format === "table") {
      printOutput(
        CONFIG_KEYS.map((k) => ({ KEY: k, VALUE: String(config[k] ?? "—") })),
        "table",
      );
    } else {
      printOutput(config, format);
    }
    return;
  }

  if (action === "get") {
    if (!key) {
      console.error("Usage: social0 config get <key>");
      process.exit(1);
    }
    const config = loadConfig();
    const val = config[key as keyof CliConfig];
    if (format === "json" || format === "yaml") {
      printOutput({ [key]: val ?? null }, format);
    } else {
      console.log(val ?? "");
    }
    return;
  }

  if (action === "set") {
    if (!key || value === undefined) {
      console.error("Usage: social0 config set <key> <value>");
      process.exit(1);
    }
    if (!CONFIG_KEYS.includes(key as keyof CliConfig)) {
      console.error(`Unknown config key: ${key}`);
      console.error(`Valid keys: ${CONFIG_KEYS.join(", ")}`);
      process.exit(1);
    }
    setConfigValue(key as keyof CliConfig, value);
    success(`Set ${key} = ${value}`);
    return;
  }

  console.error(`Unknown config action: ${action}`);
  process.exit(1);
}
