# Cursor

1. Clone and build:

```bash
git clone https://github.com/Abhishek-B-R/social0-mcp.git
cd social0-mcp
npm install && npm run build
```

2. Create an API key at [social0.app/dashboard/api-keys](https://social0.app/dashboard/api-keys).

3. Add to Cursor MCP settings (`.cursor/mcp.json` in your project, or global Cursor MCP settings). **Use an absolute path:**

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

Development (hot reload):

```json
{
  "mcpServers": {
    "social0": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/social0-mcp/src/index.ts"],
      "env": {
        "SOCIAL0_API_KEY": "sk_live_your_key_here",
        "SOCIAL0_MCP_VERBOSE": "true"
      }
    }
  }
}
```

4. Restart Cursor or reload MCP servers. Test: “Show my connected Social0 accounts.”

## Example prompts

- "Use Social0 to draft a post about our Series A for LinkedIn and X."
- "Upload `/absolute/path/to/hero.png` and create a post with it for Instagram."
- "Show all my scheduled Social0 posts."
- "Publish the draft I created yesterday."
- "Check the publish status for tracking id …"
