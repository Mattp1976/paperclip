#!/bin/bash
# Paperclip dev launcher — double-click this file to start the dev server.
# Keeps its Terminal window open so you can see logs and Ctrl-C to stop.

set -e

# Resolve the directory this script lives in (works when double-clicked)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Make sure common Homebrew / corepack / node paths are available when
# launched from Finder (Finder uses a minimal PATH by default).
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.nvm/versions/node/$(ls -1 $HOME/.nvm/versions/node 2>/dev/null | tail -1)/bin:$PATH"

echo ""
echo "  Paperclip dev launcher"
echo "  ----------------------"
echo "  Repo: $SCRIPT_DIR"
echo ""

# Activate corepack so `pnpm` resolves even on a fresh machine.
if command -v corepack >/dev/null 2>&1; then
  corepack enable >/dev/null 2>&1 || true
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "  ✗ pnpm not found. Install Node.js (https://nodejs.org) first."
  echo ""
  read -p "  Press Enter to close..."
  exit 1
fi

# Install deps only if node_modules is missing or stale.
if [ ! -d "node_modules" ]; then
  echo "  › First run — installing dependencies (this takes a minute)…"
  pnpm install
fi

echo ""
echo "  › Starting dev server — open http://localhost:5173 in your browser."
echo "  › Press Ctrl+C in this window to stop."
echo ""

pnpm dev
