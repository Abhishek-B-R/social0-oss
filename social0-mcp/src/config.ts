import { config as loadDotenv } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

loadDotenv({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../.env") });

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseApiUrl(raw: string): { host: string; v1Base: string; apiBase: string } {
  const trimmed = raw.replace(/\/$/, "");
  const host = trimmed.replace(/\/v1$/, "");
  return {
    host,
    v1Base: `${host}/v1`,
    apiBase: `${host}/api`,
  };
}

const rawApiUrl = process.env.SOCIAL0_API_URL ?? "https://api.social0.app/v1";
const { host, v1Base, apiBase } = parseApiUrl(rawApiUrl);

export const config = {
  apiKey: process.env.SOCIAL0_API_KEY ?? "",
  apiHost: host,
  v1Base,
  apiBase,
  verbose: process.env.SOCIAL0_MCP_VERBOSE === "true",
  requestTimeoutMs: parsePositiveInt(process.env.SOCIAL0_REQUEST_TIMEOUT_MS, 30_000),
  maxRetries: parsePositiveInt(process.env.SOCIAL0_MAX_RETRIES, 3),
} as const;

export function assertConfig(): void {
  if (!config.apiKey) {
    throw new Error(
      "SOCIAL0_API_KEY is required. Create one at https://social0.app/settings/api-keys",
    );
  }
  if (!config.apiKey.startsWith("s0_live_")) {
    throw new Error(
      'SOCIAL0_API_KEY must start with "s0_live_". Check your key at https://social0.app/settings/api-keys',
    );
  }
}
