# Claude Desktop

## 1. API key

Create one at [social0.app/dashboard/api-keys](https://social0.app/dashboard/api-keys) (`sk_live_…`).

## 2. Edit the MCP config

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

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

## 3. Restart

Fully quit and reopen Claude Desktop. Test: “Show my connected Social0 accounts.”

Requires **Node.js 20+** on your PATH so `npx` works.

## Example prompts

- "Show my connected Social0 accounts."
- "Create a LinkedIn post about how AI is changing marketing."
- "Schedule tomorrow's product announcement at 9 AM UTC on LinkedIn and X."
- "Publish my latest draft."
- "Which platforms should I use for this post?"
