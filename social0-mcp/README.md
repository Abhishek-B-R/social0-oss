# Social0 MCP

Post to **Instagram, TikTok, YouTube, X, LinkedIn, Facebook, Pinterest, Threads, and Bluesky** from Claude, Cursor, ChatGPT, and other AI apps — in plain English.

Prefer the **[`social0` CLI](https://www.npmjs.com/package/social0)** when you have a terminal or agent shell (`npx social0`). Use this MCP package when the AI host only supports MCP connectors.

[social0.app](https://social0.app) · [CLI docs](https://docs.social0.app/docs/integrations/cli) · [MCP docs](https://docs.social0.app/docs/integrations/mcp) · [Get an API key](https://social0.app/dashboard/api-keys)

---

## Remote URL (recommended — no npx)

Works with **Claude.ai**, **ChatGPT**, and any AI that accepts a remote MCP connector.

1. [Connect your social accounts](https://social0.app/dashboard/connections)
2. Open **Connectors** / **MCP** settings in your AI app
3. Add remote server URL:

```text
https://mcp.social0.app/mcp
```

4. Click **Connect** and approve Social0 (OAuth)
5. Ask: “Show my connected Social0 accounts”

No Node.js, no API key in config.

### Cursor (remote)

```json
{
  "mcpServers": {
    "social0": {
      "url": "https://mcp.social0.app/mcp"
    }
  }
}
```

If your Cursor build doesn’t support remote/OAuth MCP yet, use local npx below.

---

## Local npx (API key)

Needs [Node.js 20+](https://nodejs.org/) and a `sk_live_` key from [API keys](https://social0.app/dashboard/api-keys).

```json
{
  "mcpServers": {
    "social0": {
      "command": "npx",
      "args": ["-y", "@social0/mcp"],
      "env": {
        "SOCIAL0_API_KEY": "sk_live_your_key_here"
      }
    }
  }
}
```

> Unscoped `npx -y social0-mcp` still works as a deprecated alias.

| Host | Where |
|------|--------|
| Cursor | Settings → MCP / `.cursor/mcp.json` |
| Claude Desktop | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| VS Code | Copilot MCP settings |

---

## Try saying

- “Show my connected Social0 accounts”
- “Post this to LinkedIn and X”
- “Schedule this for tomorrow at 9am UTC on Instagram and TikTok”
- “Upload this image from a URL and publish it everywhere”

---

## Hosted vs local

| | Hosted | Local (`npx`) |
|--|--------|----------------|
| URL / command | `https://mcp.social0.app/mcp` | `npx -y @social0/mcp` |
| Auth | OAuth | `SOCIAL0_API_KEY` |
| Media | `url` or `data` | `url`, `data`, or `file_path` |

---

## What you can do

- Publish or schedule to any connected platforms
- Upload images and videos
- Draft, edit, and delete before going live
- Check per-platform publish status
- Get suggestions for which platforms fit a caption

## Help

[AGENTS.md](./AGENTS.md) · [Product docs](https://docs.social0.app/docs/integrations/mcp) · [social0.app/mcp](https://social0.app/mcp)

## License

MIT — see [LICENSE](LICENSE).
