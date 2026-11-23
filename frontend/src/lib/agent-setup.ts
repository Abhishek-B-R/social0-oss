/*
 * Agent setup values shared by onboarding ("How will you post?") and the AI
 * agents page. Same values as social0-cli and cloudflare/mcp-worker; keep
 * them in step.
 */

/** Hosted MCP server. OAuth sign-in, never an API key in the URL. */
export const HOSTED_MCP_URL = "https://mcp.social0.app/mcp";

/** CLI install + browser sign-in, as one pasteable line. */
export const CLI_ONE_LINER = "npm install -g social0 && social0 login";
