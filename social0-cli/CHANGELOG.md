# Changelog

All notable changes to `@social0/cli` will be documented in this file.

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
