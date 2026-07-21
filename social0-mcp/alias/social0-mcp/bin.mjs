#!/usr/bin/env node
/**
 * Thin deprecated shim: `npx social0-mcp` → `@social0/mcp`.
 * Prefer: npx -y @social0/mcp
 */
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

if (!process.env.SOCIAL0_MCP_SILENCE_DEPRECATION) {
  process.stderr.write(
    "Note: `social0-mcp` is deprecated. Prefer `npx -y @social0/mcp`.\n",
  );
}

const require = createRequire(import.meta.url);

let entry;
try {
  // Resolve the package main (dist/index.js) from this alias's dependency tree
  entry = require.resolve("@social0/mcp");
} catch {
  console.error(
    "Could not load @social0/mcp. Reinstall with: npm i -g @social0/mcp\n" +
      "Or run: npx -y @social0/mcp",
  );
  process.exit(1);
}

await import(pathToFileURL(entry).href);
