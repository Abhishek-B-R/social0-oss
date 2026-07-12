# ChatGPT (Custom GPT / MCP)

When ChatGPT supports MCP connectors for your plan, point a stdio MCP server at this package.

## Prerequisites

1. Clone and build:

```bash
git clone https://github.com/Abhishek-B-R/social0-mcp.git
cd social0-mcp
npm install && npm run build
```

2. Create an API key at [social0.app/dashboard/api-keys](https://social0.app/dashboard/api-keys).

## Configuration

```
node /absolute/path/to/social0-mcp/dist/index.js
```

| Variable | Value |
|----------|-------|
| `SOCIAL0_API_KEY` | `sk_live_…` (legacy `s0_live_…` accepted) |
| `SOCIAL0_API_URL` | `https://api.social0.app/v1` |

## Example prompts

- "Post this to my connected Twitter and LinkedIn accounts."
- "What platforms would work best for a 30-second product demo video?"
- "Schedule a post for Friday at 10 AM Eastern (convert to UTC)."

> ChatGPT MCP availability varies by plan and region. Claude Desktop or Cursor are more reliable today.

See [AGENTS.md](../AGENTS.md) for tool details.
