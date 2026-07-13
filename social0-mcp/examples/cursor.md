# Cursor

## Remote URL (recommended)

If your Cursor build supports HTTP MCP servers:

**Settings → MCP**, or project `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "social0": {
      "url": "https://mcp.social0.app/mcp"
    }
  }
}
```

Authorize with Social0 when prompted (OAuth). No API key in config.

## Local npx (fallback)

Create a key at [social0.app/dashboard/api-keys](https://social0.app/dashboard/api-keys) (`sk_live_…`):

```json
{
  "mcpServers": {
    "social0": {
      "command": "npx",
      "args": ["-y", "social0-mcp"],
      "env": {
        "SOCIAL0_API_KEY": "sk_live_your_key_here"
      }
    }
  }
}
```

Requires **Node.js 20+** on your PATH so `npx` works.

## Reload

Restart Cursor or reload MCP servers. Test: “Show my connected Social0 accounts.”

## Example prompts

- "Use Social0 to draft a post about our Series A for LinkedIn and X."
- "Upload this image from a URL and create a post with it for Instagram."
- "Show all my scheduled Social0 posts."
- "Publish the draft I created yesterday."
- "Check the publish status for tracking id …"
