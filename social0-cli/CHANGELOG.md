# Changelog

All notable changes to `social0` will be documented in this file.

## [0.1.2] - 2026-07-14

### Changed

- Renamed npm package to `social0` (was scoped `@social0/cli`); binary is still `social0`

### Fixed

- Print full post/media UUIDs in tables and success hints; resolve short ID prefixes client-side
- Natural-language schedule times keep local wall-clock (no UTC shift); support `in 2 hours` / `in 2 days at 3pm`
- Skip interactive schedule prompt when non-TTY or `-c`/`-p` are provided
- Accept a single JSON object (or array) for `schedule <file.json>`
- Honor `schedule` / `scheduled_at` on `import`
- Clear error for unknown platform/account refs
- `status` no longer double-prints platform lines; `update` handles unpublished package; hide stub AI commands; non-interactive `link` flags
- Stabilize numeric account IDs by connection order (`created_at`) so they don't reshuffle between runs

## [0.1.1] - 2026-07-13

### Changed

- Local credential passphrase is now optional; `social0 login` asks whether to enable it when OS keychain is unavailable
- Add `social0 login --skip-passphrase` / `--require-passphrase` and `social0 passphrase [status|set|remove]`
- `whoami` now shows Social0 user name, email, and plan (via `GET /v1/me`) instead of connected accounts

### Security

- Remove weak hostname-derived credential encryption; fallback supports optional user passphrase
- Remove `--key` flag from `login`; use masked prompt or stdin pipe instead
- Redact presigned upload URL query strings in verbose logs

## [0.1.0] - 2026-07-11

### Added

- Initial release of the official Social0 CLI
- Authentication: `login`, `logout`, `whoami`
- Account management with human-friendly numeric aliases
- Post CRUD: `post create`, `edit`, `delete`, `list`, `show`
- Publishing: `publish`, `schedule` with natural time parsing
- Media upload with progress
- Live job status polling with platform indicators
- Drafts management
- Interactive mode when run without arguments
- Output formats: table (default), `--json`, `--yaml`
- Secure credential storage (Keychain / Secret Service / Credential Manager)
- Shell completion generation (bash, zsh, fish, PowerShell)
- `doctor`, `version`, `update` commands
- `post init`, `examples` templates
- Batch mode and stdin pipe support
- Markdown publishing with front matter
- Project linking via `.social0` config
- Export/import posts
- Watch mode and live logs
- Unit and command tests
