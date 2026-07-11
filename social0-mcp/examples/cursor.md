# Cursor

Add to Cursor MCP settings (`.cursor/mcp.json` in your project or global Cursor settings):

```json
{
  "mcpServers": {
    "social0": {
      "command": "node",
      "args": ["/absolute/path/to/social0-mcp/dist/index.js"],
      "env": {
        "SOCIAL0_API_KEY": "s0_live_your_key_here",
        "SOCIAL0_API_URL": "https://api.social0.app/v1"
      }
    }
  }
}
```

For development with hot reload:

```json
{
  "mcpServers": {
    "social0": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/social0-mcp/src/index.ts"],
      "env": {
        "SOCIAL0_API_KEY": "s0_live_your_key_here",
        "SOCIAL0_MCP_VERBOSE": "true"
      }
    }
  }
}
```

Restart Cursor or reload MCP servers after saving.

## Example prompts

- "Use Social0 to draft a post about our Series A for LinkedIn and X."
- "Upload `./assets/hero.png` and create a post with it for Instagram."
- "Show all my scheduled Social0 posts."
- "Publish the draft I created yesterday."
