#!/usr/bin/env node
/**
 * Thin deprecated shim: `npx social0-mcp` → `@social0/mcp`.
 * Prefer: npx -y @social0/mcp
 */
if (!process.env.SOCIAL0_MCP_SILENCE_DEPRECATION) {
  process.stderr.write(
    "Note: `social0-mcp` is deprecated. Prefer `npx -y @social0/mcp`.\n",
  );
}
await import("@social0/mcp");
