# VS Code (GitHub Copilot / MCP)

If your VS Code MCP extension supports stdio servers, add to your MCP config:

```json
{
  "servers": {
    "social0": {
      "type": "stdio",
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

Build first:

```bash
cd social0-mcp
npm install
npm run build
```

## Example prompts

- "List my Social0 connected accounts."
- "Create a draft about remote work tips for LinkedIn."
- "Check the publish status of my last post."
