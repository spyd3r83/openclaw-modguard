#!/usr/bin/env bash
# install.sh — Install OpenClaw ModGuard into a local OpenClaw installation
#
# Usage:
#   ./install.sh [--openclaw-dir <path>]
#
# Defaults:
#   OPENCLAW_DIR: ~/.openclaw
#   Plugin install target: $OPENCLAW_DIR/extensions/modguard
#   Vault path: $OPENCLAW_DIR/modguard/vault.db
#   Master key: generated and written to $OPENCLAW_DIR/.env

set -euo pipefail

# ── Colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'
BOLD='\033[1m'; NC='\033[0m'

info()    { echo -e "  ${GREEN}✓${NC} $*"; }
warn()    { echo -e "  ${YELLOW}!${NC} $*"; }
error()   { echo -e "  ${RED}✗${NC} $*" >&2; }
die()     { error "$*"; exit 1; }
header()  { echo; echo -e "${BOLD}── $* ──${NC}"; }

# ── Args ─────────────────────────────────────────────────────────────────────
OPENCLAW_DIR="${OPENCLAW_DIR:-$HOME/.openclaw}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --openclaw-dir) OPENCLAW_DIR="$2"; shift 2 ;;
    -h|--help)
      echo "Usage: $0 [--openclaw-dir <path>]"
      echo "  --openclaw-dir   Path to OpenClaw config directory (default: ~/.openclaw)"
      exit 0 ;;
    *) die "Unknown option: $1" ;;
  esac
done

PLUGIN_TARGET="$OPENCLAW_DIR/extensions/modguard"
VAULT_DIR="$OPENCLAW_DIR/modguard"
VAULT_PATH="$VAULT_DIR/vault.db"
CONFIG_FILE="$OPENCLAW_DIR/openclaw.json"
ENV_FILE="$OPENCLAW_DIR/.env"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo
echo -e "${BOLD}OpenClaw ModGuard — Installer${NC}"
echo "  Plugin source : $SCRIPT_DIR"
echo "  OpenClaw dir  : $OPENCLAW_DIR"
echo "  Plugin target : $PLUGIN_TARGET"
echo "  Vault path    : $VAULT_PATH"
echo "  Config file   : $CONFIG_FILE"

# ── 1. Prerequisites ─────────────────────────────────────────────────────────
header "Step 1: Prerequisites"

# Node.js >= 22
if ! command -v node &>/dev/null; then
  die "Node.js not found. Install Node.js >= 22: https://nodejs.org"
fi
NODE_MAJOR=$(node -e "process.stdout.write(process.versions.node.split('.')[0])")
if (( NODE_MAJOR < 22 )); then
  die "Node.js $NODE_MAJOR found; version 22 or higher required."
fi
info "Node.js $(node --version)"

# pnpm
if ! command -v pnpm &>/dev/null; then
  die "pnpm not found. Install pnpm >= 10: https://pnpm.io/installation"
fi
PNPM_MAJOR=$(pnpm --version | cut -d. -f1)
if (( PNPM_MAJOR < 10 )); then
  die "pnpm $(pnpm --version) found; version 10 or higher required."
fi
info "pnpm $(pnpm --version)"

# OpenClaw config dir
if [[ ! -d "$OPENCLAW_DIR" ]]; then
  die "OpenClaw config directory not found: $OPENCLAW_DIR\nRun OpenClaw at least once to create it, or pass --openclaw-dir <path>."
fi
info "OpenClaw dir exists: $OPENCLAW_DIR"

# openclaw.json
if [[ ! -f "$CONFIG_FILE" ]]; then
  die "openclaw.json not found at $CONFIG_FILE\nRun OpenClaw at least once, or pass --openclaw-dir <path>."
fi
info "openclaw.json found"

# ── 2. Build ──────────────────────────────────────────────────────────────────
header "Step 2: Build"

cd "$SCRIPT_DIR"

echo "  Installing dependencies (pnpm install)..."
pnpm install --store-dir "$HOME/.pnpm-store" 2>&1 | grep -E "^(Packages|Progress|ERR|WARN)" || true

echo "  Compiling TypeScript (pnpm build)..."
pnpm build

info "Build complete — dist/ ready"

# ── 3. Copy plugin files ──────────────────────────────────────────────────────
header "Step 3: Install plugin files"

mkdir -p "$PLUGIN_TARGET"
echo "  Copying dist/ ..."
cp -r "$SCRIPT_DIR/dist" "$PLUGIN_TARGET/"
echo "  Copying package.json ..."
cp "$SCRIPT_DIR/package.json" "$PLUGIN_TARGET/"
echo "  Copying openclaw.plugin.json ..."
cp "$SCRIPT_DIR/openclaw.plugin.json" "$PLUGIN_TARGET/"
echo "  Copying node_modules/ (this may take a moment) ..."
cp -r "$SCRIPT_DIR/node_modules" "$PLUGIN_TARGET/"

# Secure the plugin directory
chmod 750 "$PLUGIN_TARGET"
info "Plugin files installed to $PLUGIN_TARGET"

# ── 4. Vault directory ────────────────────────────────────────────────────────
header "Step 4: Vault directory"

mkdir -p "$VAULT_DIR"
chmod 700 "$VAULT_DIR"
info "Vault directory ready: $VAULT_DIR"

# ── 5. Master key ─────────────────────────────────────────────────────────────
header "Step 5: Master key"

# Check if key already exists in env file
EXISTING_KEY=""
if [[ -f "$ENV_FILE" ]]; then
  EXISTING_KEY=$(grep -E '^MODGUARD_MASTER_KEY=' "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' || true)
fi

if [[ -n "$EXISTING_KEY" && ${#EXISTING_KEY} -ge 64 ]]; then
  info "Master key already present in $ENV_FILE (keeping existing key)"
else
  MASTER_KEY=$(openssl rand -hex 32)
  # Write or append to env file
  if [[ -f "$ENV_FILE" ]]; then
    # Remove old key if present
    if grep -q '^MODGUARD_MASTER_KEY=' "$ENV_FILE" 2>/dev/null; then
      # Use a temp file to rewrite without the old key
      TMP_ENV=$(mktemp)
      grep -v '^MODGUARD_MASTER_KEY=' "$ENV_FILE" > "$TMP_ENV"
      mv "$TMP_ENV" "$ENV_FILE"
    fi
  fi
  printf '\nMODGUARD_MASTER_KEY="%s"\n' "$MASTER_KEY" >> "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  info "Generated master key and saved to $ENV_FILE"
  warn "Back up $ENV_FILE — losing this key means losing access to vault data"
fi

MODGUARD_MASTER_KEY=$(grep -E '^MODGUARD_MASTER_KEY=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"')

# ── 6. Patch openclaw.json ────────────────────────────────────────────────────
header "Step 6: Patch openclaw.json"

# Use Node.js for safe JSON manipulation (run as CJS, outside project dir)
PATCH_TMP=$(mktemp /tmp/modguard-patch-XXXXXX.cjs)
cat > "$PATCH_TMP" <<'PATCH_SCRIPT'
const fs = require('fs');
const [,, configFile, pluginTarget, vaultPath] = process.argv;

const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));

config.plugins         = config.plugins         || {};
config.plugins.load    = config.plugins.load    || {};
config.plugins.entries = config.plugins.entries || {};

// Add load path if not already present
const paths = config.plugins.load.paths || [];
if (!paths.includes(pluginTarget)) paths.push(pluginTarget);
config.plugins.load.paths = paths;

// Merge modguard entry — never overwrite values the user already set
const existing   = config.plugins.entries.modguard || {};
const existingCfg = existing.config || {};
config.plugins.entries.modguard = {
  ...existing,
  enabled: existing.enabled !== undefined ? existing.enabled : true,
  config: {
    vaultPath: existingCfg.vaultPath || vaultPath,
    masterKey: existingCfg.masterKey || '${MODGUARD_MASTER_KEY}',
    ...existingCfg,
  },
};

fs.writeFileSync(configFile, JSON.stringify(config, null, 2) + '\n', 'utf8');
PATCH_SCRIPT
node "$PATCH_TMP" "$CONFIG_FILE" "$PLUGIN_TARGET" "$VAULT_PATH"
rm -f "$PATCH_TMP"

info "openclaw.json patched with modguard plugin config"

# ── 7. Shell profile hint ──────────────────────────────────────────────────────
header "Step 7: Environment variable setup"

# Detect shell profile
PROFILE=""
if [[ -f "$HOME/.zshrc" ]]; then
  PROFILE="$HOME/.zshrc"
elif [[ -f "$HOME/.bashrc" ]]; then
  PROFILE="$HOME/.bashrc"
elif [[ -f "$HOME/.profile" ]]; then
  PROFILE="$HOME/.profile"
fi

ENV_SOURCE_LINE="[ -f \"$ENV_FILE\" ] && source \"$ENV_FILE\""

if [[ -n "$PROFILE" ]]; then
  if grep -qF "$ENV_FILE" "$PROFILE" 2>/dev/null; then
    info "Shell profile already sources $ENV_FILE"
  else
    echo "$ENV_SOURCE_LINE" >> "$PROFILE"
    info "Added env source to $PROFILE"
    warn "Run: source $PROFILE  (or open a new terminal)"
  fi
else
  warn "Could not detect shell profile. Add this line manually to ~/.bashrc or ~/.zshrc:"
  echo "    $ENV_SOURCE_LINE"
fi

# ── 8. Summary ────────────────────────────────────────────────────────────────
echo
echo -e "${BOLD}── Installation complete ──${NC}"
echo
echo "  Plugin installed : $PLUGIN_TARGET"
echo "  Vault directory  : $VAULT_DIR"
echo "  Master key       : $ENV_FILE"
echo "  Config           : $CONFIG_FILE"
echo
echo -e "${BOLD}Next steps:${NC}"
echo
echo "  1. Ensure MODGUARD_MASTER_KEY is in your environment:"
echo "       source $ENV_FILE"
echo
echo "  2. Restart OpenClaw to load the plugin."
echo
echo "  3. Look for this line in OpenClaw logs to confirm:"
echo "       OpenClaw ModGuard plugin registered"
echo
echo "  To uninstall:"
echo "       ./uninstall.sh"
echo "  (or manually: rm -rf $PLUGIN_TARGET and remove modguard from $CONFIG_FILE)"
echo
