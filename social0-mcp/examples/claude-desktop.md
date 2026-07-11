# Claude Desktop

Add to your Claude Desktop MCP config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

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

Or if installed globally:

```json
{
  "mcpServers": {
    "social0": {
      "command": "social0-mcp",
      "env": {
        "SOCIAL0_API_KEY": "s0_live_your_key_here"
      }
    }
  }
}
```

Restart Claude Desktop after saving.

## Example prompts

- "Show my connected Social0 accounts."
- "Create a LinkedIn post about how AI is changing marketing."
- "Schedule tomorrow's product announcement at 9 AM on LinkedIn and X."
- "Publish my latest draft."
- "Which platforms should I use for this post?"
