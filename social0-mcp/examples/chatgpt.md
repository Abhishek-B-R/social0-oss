# ChatGPT (Custom GPT / MCP)

When ChatGPT supports MCP connectors for your plan, configure a stdio MCP server pointing to this package.

## Prerequisites

1. Build the server: `npm install && npm run build`
2. Create an API key at [social0.app/dashboard/api-keys](https://social0.app/dashboard/api-keys)

## Configuration

Use the same stdio command as other hosts:

```
node /absolute/path/to/social0-mcp/dist/index.js
```

Environment variables:

| Variable | Value |
|----------|-------|
| `SOCIAL0_API_KEY` | `sk_live_...` (legacy `s0_live_...` accepted) |
| `SOCIAL0_API_URL` | `https://api.social0.app/v1` |

## Example prompts

- "Post this to my connected Twitter and LinkedIn accounts."
- "What platforms would work best for a 30-second product demo video?"
- "Schedule a post for Friday at 10 AM Eastern."

> **Note:** ChatGPT MCP availability varies by plan and region. Use Claude Desktop or Cursor for the most reliable experience today.
