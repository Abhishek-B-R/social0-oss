#!/usr/bin/env bash
# Social0 CLI installer — https://github.com/Abhishek-B-R/social0-cli
# Usage: curl -fsSL https://social0.app/install.sh | sh
set -euo pipefail

PACKAGE="social0"
MIN_NODE_MAJOR=20

info()  { printf '==> %s\n' "$*"; }
warn()  { printf 'warn: %s\n' "$*" >&2; }
fail()  { printf 'error: %s\n' "$*" >&2; exit 1; }

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

node_major() {
  node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo "0"
}

install_with_npm() {
  local npm_bin="$1"
  info "Installing ${PACKAGE} with ${npm_bin}…"
  if [ "$(id -u)" -eq 0 ]; then
    "$npm_bin" install -g "$PACKAGE"
  else
    if "$npm_bin" install -g "$PACKAGE" 2>/tmp/social0-npm-install.log; then
      :
    else
      warn "Global install failed (permissions?). Retrying with sudo…"
      need_cmd sudo
      sudo "$npm_bin" install -g "$PACKAGE"
    fi
  fi
}

main() {
  need_cmd uname

  if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
    fail "Node.js ${MIN_NODE_MAJOR}+ and npm are required.
Install Node from https://nodejs.org/ then re-run:
  curl -fsSL https://social0.app/install.sh | sh

Or install directly:
  npm install -g ${PACKAGE}"
  fi

  local major
  major="$(node_major)"
  if [ "${major}" -lt "${MIN_NODE_MAJOR}" ]; then
    fail "Node.js ${MIN_NODE_MAJOR}+ required (found $(node -v)).
Upgrade Node, then re-run this installer."
  fi

  info "Detected Node $(node -v) / npm $(npm -v)"
  install_with_npm npm

  if ! command -v social0 >/dev/null 2>&1; then
    warn "social0 is installed, but the global npm bin directory may not be on your PATH."
    warn "Try: export PATH=\"\$(npm bin -g):\$PATH\""
    warn "Or open a new terminal, then run: social0 version"
    exit 0
  fi

  info "Installed: $(social0 version 2>/dev/null || echo social0)"
  cat <<'EOF'

Next:
  1. Create an API key at https://social0.app/dashboard/api-keys
  2. social0 login
  3. social0 accounts
  4. social0 publish -c "Hello from Social0" -p twitter

Docs: https://docs.social0.app/docs/integrations/cli
EOF
}

main "$@"
