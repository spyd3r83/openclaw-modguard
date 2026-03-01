#!/usr/bin/env bash
set -euo pipefail

# dev/rebuild.sh — Canonical "code changed, test it" workflow
#
# Run this after any source change to rebuild the plugin and restart
# the dev gateway so the container picks up the new dist/index.js.
#
# Usage:
#   ./dev/rebuild.sh
#
# Equivalent manual steps:
#   pnpm build && docker compose -f dev/docker-compose.yml restart openclaw-gateway

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "==> Rebuilding openclaw-modguard plugin"
cd "$PROJECT_ROOT"
pnpm build

# Verify the build produced dist/index.js before restarting the container
if [[ ! -f "$PROJECT_ROOT/dist/index.js" ]]; then
  echo "" >&2
  echo "ERROR: Build did not produce dist/index.js" >&2
  echo "       Check for TypeScript errors above and fix them before retrying." >&2
  exit 1
fi
echo "==> Build verified: dist/index.js exists"

echo ""
echo "==> Restarting openclaw-gateway"
docker compose -f "$SCRIPT_DIR/docker-compose.yml" restart openclaw-gateway

echo ""
echo "==> Done. Tail logs with:"
echo "    docker compose -f $SCRIPT_DIR/docker-compose.yml logs -f openclaw-gateway"
