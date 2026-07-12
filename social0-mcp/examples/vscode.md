# VS Code (GitHub Copilot / MCP)

1. Clone and build:

```bash
git clone https://github.com/Abhishek-B-R/social0-mcp.git
cd social0-mcp
npm install && npm run build
```

2. Create an API key at [social0.app/dashboard/api-keys](https://social0.app/dashboard/api-keys).

3. If your VS Code MCP setup supports stdio servers, add:

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

Exact config file location depends on your VS Code MCP extension / Copilot settings. Always use an **absolute** path to `dist/index.js`.

## Example prompts

- "List my Social0 connected accounts."
- "Create a draft about remote work tips for LinkedIn."
- "Check the publish status of my last post."
