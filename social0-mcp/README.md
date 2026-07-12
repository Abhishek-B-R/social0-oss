# Social0 MCP Server

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-0.1.0-green.svg)]()
[![Social0 API](https://img.shields.io/badge/Social0-API-1a6b4a)](https://api.social0.app/docs)

Give your AI agent the ability to post to **9 social media platforms** from natural language.

**Supports:** Instagram, TikTok, YouTube, X (Twitter), LinkedIn, Facebook, Pinterest, Threads, Bluesky

Built on the [Social0 API](https://api.social0.app/docs). [Social0](https://social0.app) is a multi-platform social scheduler — write once, publish everywhere from one dashboard.

## Install

Works with **Claude Desktop**, **Cursor**, **VS Code**, **ChatGPT**, Windsurf, and other MCP hosts.

```bash
git clone https://github.com/Abhishek-B-R/social0-mcp.git
cd social0-mcp
npm install && npm run build
```

Then add to your MCP config (use an **absolute** path):

```json
{
  "mcpServers": {
    "social0": {
      "command": "node",
      "args": ["/absolute/path/to/social0-mcp/dist/index.js"],
      "env": {
        "SOCIAL0_API_KEY": "sk_live_your_key_here"
      }
    }
  }
}
```

Host-specific guides: [Cursor](examples/cursor.md) · [Claude Desktop](examples/claude-desktop.md) · [VS Code](examples/vscode.md) · [ChatGPT](examples/chatgpt.md)

Requires **Node.js 20+**.

<details>
<summary>Other setup options</summary>

**With verbose logging (debug):**

```json
{
  "mcpServers": {
    "social0": {
      "command": "node",
      "args": ["/absolute/path/to/social0-mcp/dist/index.js"],
      "env": {
        "SOCIAL0_API_KEY": "sk_live_your_key_here",
        "SOCIAL0_MCP_VERBOSE": "true"
      }
    }
  }
}
```

**Dev / hot reload:**

```json
{
  "mcpServers": {
    "social0": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/social0-mcp/src/index.ts"],
      "env": {
        "SOCIAL0_API_KEY": "sk_live_your_key_here"
      }
    }
  }
}
```

</details>

## Setup

1. Sign up at [social0.app](https://social0.app) and [connect your social accounts](https://social0.app/dashboard/connections)
2. Create an API key at [Dashboard → Developer](https://social0.app/dashboard/api-keys) (`sk_live_…`)
3. Put the key in your MCP host `env` block (see Install above)
4. Restart / reload MCP in your AI host

> **Tip:** You can also put `SOCIAL0_API_KEY=sk_live_…` in a local `.env` (see `.env.example`) when running the server directly.

### Start using it

Ask your AI agent things like:

- "Show my connected Social0 accounts"
- "Post this to LinkedIn and X"
- "Schedule a post for tomorrow at 9am UTC on Instagram and TikTok"
- "Upload this image and publish it everywhere"
- "Show my scheduled posts"
- "Delete the draft I made earlier"
- "Which platforms should I use for this caption?"

## What your agent can do

- **Post** to any or all connected platforms in one step
- **Schedule** posts for any date/time
- **Upload** images and videos from local files
- **Draft / edit / delete** posts before they go live
- **Track publish status** per platform (success, fail, or partial)
- **Per-platform options** — captions, TikTok / Instagram / YouTube / Pinterest settings, and more
- **Platform suggestions** — recommend where a caption fits best

## Supported platforms

- Instagram
- TikTok
- YouTube
- X (Twitter)
- LinkedIn
- Facebook
- Pinterest
- Threads
- Bluesky

## Troubleshooting

### `SOCIAL0_API_KEY is required`

Add the key to your MCP host config `env` block and reload MCP.

### Wrong key format

Keys start with `sk_live_` (legacy `s0_live_` still works). Create one at [social0.app/dashboard/api-keys](https://social0.app/dashboard/api-keys).

### `401 Unauthorized`

Key revoked or wrong — create a new key and update your config.

### No connected account / multiple accounts

Connect platforms in the [dashboard](https://social0.app/dashboard/connections). If you have more than one account on a platform, tell the agent to use the account ID from “show my connected accounts.”

### Media upload failed / ENOENT

Remote hosts cannot use local sandbox paths. Call `upload_media` with a public `url` or base64 `data` (+ `filename`). `file_path` only works for files on the machine running the MCP server.

### One platform failed, others succeeded

That’s normal — each platform publishes independently. Ask your agent to check publish status with the tracking ID.

## Links

- [Social0](https://social0.app)
- [MCP docs](https://docs.social0.app/docs/integrations/mcp)
- [API reference](https://api.social0.app/docs)
- [Get an API key](https://social0.app/dashboard/api-keys)
- [Agent reference (AGENTS.md)](./AGENTS.md)

## License

MIT — see [LICENSE](LICENSE).
