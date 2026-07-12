# ChatGPT (Desktop)

ChatGPT supports MCP servers. Availability varies by plan / region.

## 1. API key

Create one at [social0.app/dashboard/api-keys](https://social0.app/dashboard/api-keys) (`sk_live_…`).

## 2. Add the connector

Open:

**Settings → Connectors / MCP** (wording varies by version)

Add:

```json
{
  "name": "social0",
  "command": "npx",
  "args": ["-y", "social0-mcp"],
  "env": {
    "SOCIAL0_API_KEY": "sk_live_your_key_here"
  }
}
```

Save and restart ChatGPT if needed. You should see the Social0 tools available.

Requires **Node.js 20+** on the machine running ChatGPT Desktop.

## Example prompts

- "Show my connected Social0 accounts."
- "Post this to my connected Twitter and LinkedIn accounts."
- "Upload this image from https://… and publish it."
- "What platforms would work best for a 30-second product demo video?"
- "Schedule a post for Friday at 10 AM Eastern (convert to UTC)."

## Media tip

Prefer `upload_media` with a public `url` or base64 `data`. Sandbox paths like `/home/…` will fail with ENOENT.

See [AGENTS.md](../AGENTS.md) for full tool details.
