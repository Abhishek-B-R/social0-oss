# ChatGPT

ChatGPT supports MCP connectors (availability varies by plan / region). Prefer the **remote URL** so you don’t need Node.js or an API key in config.

## Remote URL (recommended)

1. [Connect your social accounts](https://social0.app/dashboard/connections)
2. Open ChatGPT → **Settings → Connectors** (wording may vary)
3. Add a custom / remote MCP connector with:

```text
https://mcp.social0.app/mcp
```

4. Click **Connect** and approve Social0 in your browser (OAuth)
5. Ask: “Show my connected Social0 accounts”

## Local npx (fallback)

If your ChatGPT build only supports a local command:

1. Create an API key at [social0.app/dashboard/api-keys](https://social0.app/dashboard/api-keys) (`sk_live_…`)
2. Add:

```json
{
  "name": "social0",
  "command": "npx",
  "args": ["-y", "@social0/mcp"],
  "env": {
    "SOCIAL0_API_KEY": "sk_live_your_key_here"
  }
}
```

Requires **Node.js 20+** on the machine running ChatGPT Desktop.

## Example prompts

- "Show my connected Social0 accounts."
- "Post this to my connected Twitter and LinkedIn accounts."
- "Upload this image from https://… and publish it."
- "What platforms would work best for a 30-second product demo video?"
- "Schedule a post for Friday at 10 AM Eastern (convert to UTC)."

## Media tip

For remote ChatGPT, use `upload_media` with a public `url` or base64 `data` — local sandbox paths will not work on the hosted server.
