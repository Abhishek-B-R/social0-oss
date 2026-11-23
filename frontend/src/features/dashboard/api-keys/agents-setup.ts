import { getApiBaseUrl } from "@/lib/env";

/*
 * Real values for the setup guides. Keep in step with social0-mcp/README.md,
 * social0-cli/README.md and cloudflare/mcp-worker (hosted MCP).
 */

/** Hosted MCP server (OAuth). Shared with onboarding. */
export { HOSTED_MCP_URL } from "@/lib/agent-setup";

/** Key name the hosted MCP OAuth flow mints (old name kept by the server). */
export const MCP_CONNECTOR_KEY_NAMES = ["MCP Connector", "Claude MCP Connector"];

export const KEY_PLACEHOLDER = "sk_live_...";

/** Public `/v1` origin for curl examples (env override, else production). */
export function publicApiOrigin(): string {
  const configured = getApiBaseUrl();
  return configured || "https://api.social0.app";
}

export function envVarLine(key: string): string {
  return `export SOCIAL0_API_KEY=${key}`;
}

/** Claude Code: local stdio MCP server with an API key. */
export function claudeCodeMcpCommand(key = KEY_PLACEHOLDER): string {
  return `claude mcp add --transport stdio social0 --env SOCIAL0_API_KEY=${key} -- npx -y @social0/mcp`;
}

/** Cursor (and other stdio MCP hosts): `mcp.json` entry. */
export function stdioMcpJson(key = KEY_PLACEHOLDER): string {
  return JSON.stringify(
    {
      mcpServers: {
        social0: {
          command: "npx",
          args: ["-y", "@social0/mcp"],
          env: { SOCIAL0_API_KEY: key },
        },
      },
    },
    null,
    2,
  );
}

export const CLI_LOCAL_COMMANDS = [
  "npm install -g social0",
  "social0 login",
  "npx skills add Abhishek-B-R/social0-cli --skill social0",
] as const;

export const CLI_REMOTE_COMMANDS = [
  "npm install -g social0",
  envVarLine(KEY_PLACEHOLDER),
  "social0 whoami",
] as const;

export function curlWhoAmI(key = KEY_PLACEHOLDER): string {
  return `curl ${publicApiOrigin()}/v1/me \\\n  -H "Authorization: Bearer ${key}"`;
}

export type AgentClient = "chatgpt" | "claude" | "cursor" | "claude-code" | "api";

export const AGENT_CLIENTS: { value: AgentClient; label: string }[] = [
  { value: "chatgpt", label: "ChatGPT" },
  { value: "claude", label: "Claude" },
  { value: "cursor", label: "Cursor" },
  { value: "claude-code", label: "Claude Code (CLI)" },
  { value: "api", label: "Other / API" },
];

export const EXAMPLE_PROMPT =
  "Schedule this for my X and LinkedIn tomorrow at 9am: “We just shipped dark mode.”";
