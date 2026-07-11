# @social0/cli

The official CLI for [Social0](https://social0.app) — manage social media from your terminal.

<p align="center">
  <img src="https://img.shields.io/npm/v/@social0/cli?style=flat-square" alt="npm version" />
  <img src="https://img.shields.io/node/v/@social0/cli?style=flat-square" alt="node version" />
  <img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="MIT License" />
</p>

## Quick Start

```bash
# Install globally
npm install -g @social0/cli

# Or run without installing
npx @social0/cli

# Authenticate
social0 login

# See your connected accounts
social0 accounts

# Create and publish a post (interactive)
social0 post create

# Publish immediately
social0 publish --content "Launching today!" --platform twitter linkedin
```

## Installation

### npm (recommended)

```bash
npm install -g @social0/cli
```

### Homebrew

```bash
brew tap social0/tap
brew install social0
```

### Windows (Scoop)

```powershell
scoop bucket add social0 https://github.com/social0/scoop-bucket
scoop install social0
```

### Linux

```bash
curl -fsSL https://social0.app/install.sh | sh
```

## Authentication

Get your API key from [social0.app/dashboard/api-keys](https://social0.app/dashboard/api-keys).

```bash
social0 login
# Enter your API key (sk_live_...)

social0 whoami
social0 logout
```

API keys are stored securely:
- **macOS** → Keychain
- **Linux** → Secret Service
- **Windows** → Credential Manager
- **Fallback** → Encrypted local config

## Commands

### Accounts

Connected accounts use **human-friendly numeric IDs** — no UUIDs to memorize.

```bash
social0 accounts

#  ID  PLATFORM   NAME         HANDLE          STATUS
#  1   twitter    social0      @social0         active
#  2   linkedin   social0-co   @social0-co      active
#  3   instagram  social0app   @social0app      expired

social0 accounts connect linkedin
social0 accounts disconnect 3
```

Use account IDs (`1`, `2`, `3`) or platform names (`twitter`, `linkedin`) when creating posts.

### Posts

```bash
# Interactive wizard (like the competitor CLI you know)
social0 post create

# Non-interactive
social0 post create \
  --content "Launching today!" \
  --platform 1 2

social0 post list
social0 post show <id>
social0 post edit <id> --content "Updated text"
social0 post delete <id>
social0 post init   # generate sample JSON
```

### Publish

```bash
# Interactive
social0 publish

# From flags
social0 publish --content "Hello world" --platform twitter

# Publish a draft
social0 publish <draft-id>
social0 publish latest

# From markdown with front matter
social0 publish launch.md

# From stdin
echo "Launching today!" | social0 publish
cat blog.md | social0 post create
```

**Markdown front matter example:**

```markdown
---
platforms:
  - twitter
  - linkedin
schedule: tomorrow 9am
---

Launching Social0 today 🚀
```

### Schedule

Natural time parsing supported:

```bash
social0 schedule <draft-id> --time "tomorrow 9am"
social0 schedule <draft-id> --time "today 8pm"
social0 schedule <draft-id> --time "next monday"
social0 schedule <draft-id> --time "2026-08-01 14:00"

# Batch schedule from JSON
social0 schedule posts.json
```

### Media

```bash
social0 upload logo.png
social0 upload ./images/*
```

### Status

Live polling with platform indicators:

```bash
social0 status <tracking-id>

#  ✓ twitter
#  ⟳ linkedin
#  ✗ tiktok
```

### Drafts

```bash
social0 drafts
social0 drafts publish <id>
social0 drafts schedule <id> --time "tomorrow 9am"
social0 drafts delete <id>
```

### Configuration

```bash
social0 config
social0 config get apiUrl
social0 config set defaultTimezone America/New_York
social0 config set outputFormat json
```

### Diagnostics

```bash
social0 doctor    # check API, auth, connectivity
social0 version
social0 update    # check for new version
```

### Interactive Mode

Run without arguments for a keyboard-navigable menu:

```bash
social0

# → Create Post
#   Publish
#   Schedule
#   Accounts
#   Upload
#   Settings
#   Exit
```

### Project Linking

```bash
social0 link   # saves .social0 in current directory
```

### Output Formats

```bash
social0 accounts --json
social0 accounts --yaml
social0 accounts --table   # default
```

### Shell Completions

```bash
# bash
social0 completion bash >> ~/.bashrc

# zsh
social0 completion zsh >> ~/.zshrc

# fish
social0 completion fish > ~/.config/fish/completions/social0.fish

# PowerShell
social0 completion powershell >> $PROFILE
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `SOCIAL0_API_KEY` | API key (overrides stored key) | — |
| `SOCIAL0_API_URL` | API base URL | `https://api.social0.app/v1` |
| `SOCIAL0_REQUEST_TIMEOUT_MS` | Request timeout | `30000` |
| `SOCIAL0_MAX_RETRIES` | Rate limit retries | `3` |
| `SOCIAL0_VERBOSE` | Enable verbose logging | `0` |

## Architecture

The CLI contains **zero business logic** — it is a thin, polished client for the Social0 REST API (`/v1/*`).

```
src/
  commands/    # CLI commands (call API only)
  api/         # REST API client
  config/      # Settings & credential storage
  utils/       # Output, aliases, date parsing
  types/       # TypeScript types
```

## Development

```bash
cd social0-cli
npm install
npm run dev -- accounts
npm test
npm run build
```

## License

MIT © Social0
