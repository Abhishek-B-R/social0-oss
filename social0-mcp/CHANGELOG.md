# Changelog

All notable changes to the Social0 MCP server are documented here.

## [0.2.1] - 2026-07-12

### Changed

- README is install/config-first for general users; troubleshooting and local-dev moved to AGENTS.md

## [0.2.0] - 2026-07-12

### Changed

- **Breaking:** npm package renamed from `@social0/mcp-server` to `social0-mcp` (bin name unchanged). Use `npx -y social0-mcp`.
- README and host examples use paste-ready `npx -y social0-mcp` configs. Local clone is optional for contributors only.

## [0.1.2] - 2026-07-12

### Added

- `upload_media` accepts `url` (remote download) and `data` (base64 / data URLs) in addition to local `file_path`
- Safer URL fetch (http/https only, blocks localhost / private hosts, size limits)

## [0.1.1] - 2026-07-12

### Changed

- Standalone public repo documentation overhaul for agents and hosts
- Added `AGENTS.md` (full tool params, platforms, publish polling, agent rules)
- README quick start uses `git clone` of this repository
- Host examples include clone + build steps
- Removed internal `docs-updation-mcp.md` brief from the public package

## [0.1.0] - 2026-07-11

### Added

- Initial release of the official Social0 MCP server
- 13 MCP tools for managing social posts from AI assistants
- API key authentication via `SOCIAL0_API_KEY`
- Reusable REST API client with timeout, retry-on-429, and structured errors
- `suggest_best_platforms` tool for AI-native platform recommendations
- Setup guides for Claude Desktop, Cursor, VS Code, and ChatGPT
- Verbose logging mode for debugging (`SOCIAL0_MCP_VERBOSE=true`)

### Notes

- All MCP tools call **`/v1/*`** REST endpoints on `api.social0.app` (accounts, posts, media, publish, jobs).
- API keys use the `sk_live_` prefix (`s0_live_` legacy keys still accepted).
- Interactive API reference: https://api.social0.app/docs · User docs: https://docs.social0.app/docs/integrations/mcp
