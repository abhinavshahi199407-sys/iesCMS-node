#!/usr/bin/env bash
# One-command Mac setup for the GBN Excise Command Centre collector.
# Does everything except the portal login (which only the operator may do):
# clone/update the repo, install dependencies, configure, open Chrome for the
# one-time login, run a first fetch of every enabled report, then start the
# 30-minute collection loop.
set -euo pipefail

REPO_URL="https://github.com/abhinavshahi199407-sys/iesCMS-node.git"
BRANCH="claude/create-mcp-k43g6z"
DIR="$HOME/iesCMS-node"

echo "== GBN Excise Command Centre — collector setup =="

if ! command -v git >/dev/null 2>&1; then
    echo "git is missing — macOS will offer to install command line tools; accept, then re-run this script."
    xcode-select --install || true
    exit 1
fi
if ! command -v node >/dev/null 2>&1; then
    echo "Node.js is missing. Install the LTS version from https://nodejs.org and re-run this script."
    exit 1
fi

if [ -d "$DIR/.git" ]; then
    echo "Updating existing checkout…"
    git -C "$DIR" fetch origin "$BRANCH"
    git -C "$DIR" checkout "$BRANCH"
    git -C "$DIR" pull origin "$BRANCH"
else
    git clone -b "$BRANCH" "$REPO_URL" "$DIR"
fi

cd "$DIR/circle4-v2-command-centre/collector"
npm install
[ -f portal.config.json ] || cp portal.config.example.json portal.config.json

echo ""
echo ">>> Chrome will open on the MIS portal. Log in yourself (password, CAPTCHA, OTP),"
echo ">>> then press Enter in THIS window."
node fetch_reports.mjs --setup

echo ""
echo ">>> First fetch of every enabled report…"
node fetch_reports.mjs --once || true

echo ""
echo ">>> Starting the 30-minute collection loop (08:00-22:00, keep-alive 24x7)."
echo ">>> Keep this window open. Dashboard: cd ~/iesCMS-node/circle4-v2-command-centre && python3 -m http.server 8080  ->  http://localhost:8080/public/"
exec node fetch_reports.mjs
