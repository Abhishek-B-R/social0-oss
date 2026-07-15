# VS Code (GitHub Copilot / MCP)

## 1. API key

Create one at [social0.app/dashboard/api-keys](https://social0.app/dashboard/api-keys) (`sk_live_…`).

## 2. Add the MCP server

In your VS Code MCP / Copilot settings (exact UI varies):

```json
{
  "servers": {
    "social0": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@social0/mcp"],
      "env": {
        "SOCIAL0_API_KEY": "sk_live_your_key_here"
      }
    }
  }
}
```

Requires **Node.js 20+** on your PATH so `npx` works.

## Example prompts

- "List my Social0 connected accounts."
- "Create a draft about remote work tips for LinkedIn."
- "Check the publish status of my last post."
