# Social0 MCP

Post to **Instagram, TikTok, YouTube, X, LinkedIn, Facebook, Pinterest, Threads, and Bluesky** from Claude, Cursor, ChatGPT, and other AI apps — in plain English.

[social0.app](https://social0.app) · [Get an API key](https://social0.app/dashboard/api-keys)

---

## Setup

### 1. Get an API key

1. Sign up at [social0.app](https://social0.app)
2. [Connect your social accounts](https://social0.app/dashboard/connections)
3. Create a key at [Dashboard → API keys](https://social0.app/dashboard/api-keys)

### 2. Paste this into your AI app

Replace `sk_live_your_key_here` with your key. You need [Node.js 20+](https://nodejs.org/) installed (one-time).

#### Cursor

**Settings → MCP**, or create `.cursor/mcp.json`:

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

Reload MCP / restart Cursor.

#### Claude Desktop

Edit:

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

Fully quit and reopen Claude Desktop.

#### ChatGPT (Desktop)

**Settings → Connectors / MCP** (wording varies):

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

Save and restart ChatGPT if needed.

#### VS Code / Windsurf / others

Same idea — add an MCP server with:

```json
{
  "command": "npx",
  "args": ["-y", "social0-mcp"],
  "env": {
    "SOCIAL0_API_KEY": "sk_live_your_key_here"
  }
}
```

### 3. Try saying

- “Show my connected Social0 accounts”
- “Post this to LinkedIn and X”
- “Schedule this for tomorrow at 9am UTC on Instagram and TikTok”
- “Upload this image from a URL and publish it everywhere”

---

## What you can do

- Publish or schedule to any connected platforms
- Upload images and videos
- Draft, edit, and delete before going live
- Check per-platform publish status
- Get suggestions for which platforms fit a caption

---

## Help

Something not working? See [AGENTS.md](./AGENTS.md) (troubleshooting + full tool reference for developers).

More: [Product docs](https://docs.social0.app/docs/integrations/mcp) · [social0.app](https://social0.app)

## License

MIT — see [LICENSE](LICENSE).
