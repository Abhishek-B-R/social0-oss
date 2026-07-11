# Changelog

All notable changes to the Social0 MCP server are documented here.

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

- Post CRUD tools call `/v1/posts` endpoints (rolling out on the Social0 API)
- Accounts, media upload, publish, and job status use `/api/*` endpoints today
