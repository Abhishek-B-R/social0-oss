# Claude Desktop

1. Clone and build:

```bash
git clone https://github.com/Abhishek-B-R/social0-mcp.git
cd social0-mcp
npm install && npm run build
```

2. Create an API key at [social0.app/dashboard/api-keys](https://social0.app/dashboard/api-keys).

3. Edit Claude Desktop MCP config:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "social0": {
      "command": "node",
      "args": ["/absolute/path/to/social0-mcp/dist/index.js"],
      "env": {
        "SOCIAL0_API_KEY": "sk_live_your_key_here",
        "SOCIAL0_API_URL": "https://api.social0.app/v1"
      }
    }
  }
}
```

Or if installed globally (`npm link` / npm package bin):

```json
{
  "mcpServers": {
    "social0": {
      "command": "social0-mcp",
      "env": {
        "SOCIAL0_API_KEY": "sk_live_your_key_here"
      }
    }
  }
}
```

4. Fully quit and reopen Claude Desktop. Test: “Show my connected Social0 accounts.”

## Example prompts

- "Show my connected Social0 accounts."
- "Create a LinkedIn post about how AI is changing marketing."
- "Schedule tomorrow's product announcement at 9 AM UTC on LinkedIn and X."
- "Publish my latest draft."
- "Which platforms should I use for this post?"
