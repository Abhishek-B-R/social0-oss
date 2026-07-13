# Changelog

All notable changes to `@social0/cli` will be documented in this file.

## [0.1.1] - 2026-07-13

### Security

- Remove weak hostname-derived credential encryption; fallback now requires user passphrase
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
