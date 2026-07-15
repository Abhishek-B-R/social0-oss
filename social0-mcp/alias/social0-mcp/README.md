# social0-mcp (deprecated)

This package is a **compatibility alias** for [`@social0/mcp`](https://www.npmjs.com/package/@social0/mcp).

```bash
# Preferred
npx -y @social0/mcp

# Still works (prints a deprecation note)
npx -y social0-mcp
```

Update your MCP host config:

```json
{
  "mcpServers": {
    "social0": {
      "command": "npx",
      "args": ["-y", "@social0/mcp"],
      "env": {
        "SOCIAL0_API_KEY": "sk_live_your_key_here"
      }
    }
  }
}
```

Set `SOCIAL0_MCP_SILENCE_DEPRECATION=1` to hide the stderr note.
