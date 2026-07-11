#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { assertConfig } from "./config.js";
import { createMcpServer } from "./tools/index.js";
import { logVerbose } from "./utils/index.js";

async function main(): Promise<void> {
  assertConfig();

  const server = createMcpServer();
  const transport = new StdioServerTransport();

  logVerbose("Starting Social0 MCP server on stdio");

  await server.connect(transport);
}

main().catch((error) => {
  console.error(
    "Social0 MCP server failed to start:",
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});
