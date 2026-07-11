import { homedir } from "node:os";
import { join } from "node:path";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import type { CliConfig, OutputFormat } from "../types/index.js";

const CONFIG_DIR = join(homedir(), ".social0");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

const DEFAULT_CONFIG: CliConfig = {
  apiUrl: "https://api.social0.app/v1",
  defaultTimezone: "default",
  outputFormat: "table",
};

export function getConfigDir(): string {
  return CONFIG_DIR;
}

export function getConfigPath(): string {
  return CONFIG_FILE;
}

export function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
}

export function loadConfig(): CliConfig {
  ensureConfigDir();
  if (!existsSync(CONFIG_FILE)) {
    return { ...DEFAULT_CONFIG };
  }
  try {
    const raw = readFileSync(CONFIG_FILE, "utf8");
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(config: CliConfig): void {
  ensureConfigDir();
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), { mode: 0o600 });
}

export function getConfigValue(key: keyof CliConfig): string | OutputFormat | undefined {
  return loadConfig()[key];
}

export function setConfigValue(key: keyof CliConfig, value: string): void {
  const config = loadConfig();
  if (key === "apiUrl") config.apiUrl = value;
  else if (key === "defaultWorkspace") config.defaultWorkspace = value;
  else if (key === "defaultTimezone") config.defaultTimezone = value;
  else if (key === "defaultPlatform") config.defaultPlatform = value;
  else if (key === "outputFormat") config.outputFormat = value as CliConfig["outputFormat"];
  saveConfig(config);
}

export function resolveApiUrl(override?: string): string {
  const env = process.env.SOCIAL0_API_URL;
  const config = loadConfig().apiUrl;
  const url = override ?? env ?? config;
  return url.replace(/\/$/, "").endsWith("/v1") ? url.replace(/\/$/, "") : `${url.replace(/\/$/, "")}/v1`;
}

export function resolveOutputFormat(opts: {
  json?: boolean;
  yaml?: boolean;
  table?: boolean;
}): OutputFormat {
  if (opts.json) return "json";
  if (opts.yaml) return "yaml";
  if (opts.table) return "table";
  return loadConfig().outputFormat;
}

export function getRequestTimeoutMs(): number {
  const env = process.env.SOCIAL0_REQUEST_TIMEOUT_MS;
  return env ? Number(env) : 30_000;
}

export function getMaxRetries(): number {
  const env = process.env.SOCIAL0_MAX_RETRIES;
  return env ? Number(env) : 3;
}
