#!/usr/bin/env bash
# install.sh — Install OpenClaw ModGuard into a local OpenClaw installation
#
# Usage:
#   ./install.sh [--openclaw-dir <path>] [--openclaw-source-dir <path>]
#
# Options:
#   --openclaw-dir         OpenClaw config directory (default: ~/.openclaw)
#   --openclaw-source-dir  OpenClaw source/install root that contains src/ and dist/.
#                          Required for source-level patching (Strategy A).
#                          Falls back to bundle patching if omitted (Strategy B).
#
# Environment variables (can be used instead of flags):
#   OPENCLAW_DIR           OpenClaw config directory
#   OPENCLAW_SOURCE_DIR    OpenClaw source/install root

set -euo pipefail

# ── Colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'
BOLD='\033[1m'; NC='\033[0m'

info()   { echo -e "  ${GREEN}✓${NC} $*"; }
warn()   { echo -e "  ${YELLOW}!${NC} $*"; }
error()  { echo -e "  ${RED}✗${NC} $*" >&2; }
die()    { error "$*"; exit 1; }
header() { echo; echo -e "${BOLD}── $* ──${NC}"; }

# ── Args ─────────────────────────────────────────────────────────────────────
OPENCLAW_DIR="${OPENCLAW_DIR:-$HOME/.openclaw}"
OPENCLAW_SOURCE="${OPENCLAW_SOURCE_DIR:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --openclaw-dir)        OPENCLAW_DIR="$2";    shift 2 ;;
    --openclaw-source-dir) OPENCLAW_SOURCE="$2"; shift 2 ;;
    -h|--help)
      echo "Usage: $0 [--openclaw-dir <path>] [--openclaw-source-dir <path>]"
      echo
      echo "  --openclaw-dir         OpenClaw config directory (default: ~/.openclaw)"
      echo "  --openclaw-source-dir  OpenClaw source root containing src/ and dist/."
      echo "                         Enables source-level patching (recommended)."
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
echo "  Plugin source   : $SCRIPT_DIR"
echo "  OpenClaw dir    : $OPENCLAW_DIR"
echo "  Plugin target   : $PLUGIN_TARGET"
echo "  Vault path      : $VAULT_PATH"
echo "  Config file     : $CONFIG_FILE"
if [[ -n "$OPENCLAW_SOURCE" ]]; then
  echo "  OpenClaw source : $OPENCLAW_SOURCE"
else
  echo "  OpenClaw source : (not set — will use bundle fallback for patching)"
fi

# ── 1. Prerequisites ─────────────────────────────────────────────────────────
header "Step 1: Prerequisites"

if ! command -v node &>/dev/null; then
  die "Node.js not found. Install Node.js >= 22: https://nodejs.org"
fi
NODE_MAJOR=$(node -e "process.stdout.write(process.versions.node.split('.')[0])")
if (( NODE_MAJOR < 22 )); then
  die "Node.js $NODE_MAJOR found; version 22 or higher required."
fi
info "Node.js $(node --version)"

if ! command -v pnpm &>/dev/null; then
  die "pnpm not found. Install pnpm >= 10: https://pnpm.io/installation"
fi
PNPM_MAJOR=$(pnpm --version | cut -d. -f1)
if (( PNPM_MAJOR < 10 )); then
  die "pnpm $(pnpm --version) found; version 10 or higher required."
fi
info "pnpm $(pnpm --version)"

if [[ ! -d "$OPENCLAW_DIR" ]]; then
  die "OpenClaw config directory not found: $OPENCLAW_DIR\nRun OpenClaw at least once to create it, or pass --openclaw-dir <path>."
fi
info "OpenClaw dir exists: $OPENCLAW_DIR"

if [[ ! -f "$CONFIG_FILE" ]]; then
  die "openclaw.json not found at $CONFIG_FILE\nRun OpenClaw at least once, or pass --openclaw-dir <path>."
fi
info "openclaw.json found"

# ── 2. Build ──────────────────────────────────────────────────────────────────
header "Step 2: Build"

cd "$SCRIPT_DIR"

echo "  Installing dependencies..."
pnpm install --store-dir "$HOME/.pnpm-store" 2>&1 | grep -E "^(Packages|Progress|ERR|WARN)" || true

echo "  Compiling TypeScript..."
pnpm build

info "Build complete — dist/ ready"

# ── 3. Install plugin files ───────────────────────────────────────────────────
header "Step 3: Install plugin files"

mkdir -p "$PLUGIN_TARGET"
cp -r "$SCRIPT_DIR/dist"               "$PLUGIN_TARGET/"
cp    "$SCRIPT_DIR/package.json"       "$PLUGIN_TARGET/"
cp    "$SCRIPT_DIR/openclaw.plugin.json" "$PLUGIN_TARGET/"
echo "  Copying node_modules/ (this may take a moment)..."
cp -r "$SCRIPT_DIR/node_modules"       "$PLUGIN_TARGET/"
chmod 750 "$PLUGIN_TARGET"
info "Plugin files installed to $PLUGIN_TARGET"

# ── 4. Patch OpenClaw ─────────────────────────────────────────────────────────
header "Step 4: Patch OpenClaw (replacePrompt support)"

# Build the argument list for the patch script.
PATCH_ARGS=("--plugin-dir" "$PLUGIN_TARGET")

if [[ -n "$OPENCLAW_SOURCE" ]]; then
  if [[ ! -d "$OPENCLAW_SOURCE/src" && ! -d "$OPENCLAW_SOURCE/dist" ]]; then
    die "OPENCLAW_SOURCE_DIR ($OPENCLAW_SOURCE) does not contain src/ or dist/.\nCheck the path and try again."
  fi
  PATCH_ARGS+=("--openclaw-dir" "$OPENCLAW_SOURCE")
  echo "  OpenClaw source : $OPENCLAW_SOURCE"
  echo "  Strategy        : A (source-level patch + tsdown rebuild)"
else
  echo "  OPENCLAW_SOURCE_DIR not set."
  echo "  Strategy        : B (bundle fallback — patches compiled .js files)"
  warn "Bundle patches break when OpenClaw rebuilds its bundles."
  warn "Set OPENCLAW_SOURCE_DIR or pass --openclaw-source-dir for a durable install."
fi

node "$SCRIPT_DIR/scripts/patch-openclaw.js" "${PATCH_ARGS[@]}" --verbose
info "OpenClaw patched"

# ── 5. Vault directory ────────────────────────────────────────────────────────
header "Step 5: Vault directory"

mkdir -p "$VAULT_DIR"
chmod 700 "$VAULT_DIR"
info "Vault directory ready: $VAULT_DIR"

# ── 6. Master key ─────────────────────────────────────────────────────────────
header "Step 6: Master key"

EXISTING_KEY=""
if [[ -f "$ENV_FILE" ]]; then
  EXISTING_KEY=$(grep -E '^MODGUARD_MASTER_KEY=' "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' || true)
fi

if [[ -n "$EXISTING_KEY" && ${#EXISTING_KEY} -ge 64 ]]; then
  info "Master key already present in $ENV_FILE (keeping existing key)"
else
  MASTER_KEY=$(openssl rand -hex 32)
  if [[ -f "$ENV_FILE" ]] && grep -q '^MODGUARD_MASTER_KEY=' "$ENV_FILE" 2>/dev/null; then
    TMP_ENV=$(mktemp)
    grep -v '^MODGUARD_MASTER_KEY=' "$ENV_FILE" > "$TMP_ENV"
    mv "$TMP_ENV" "$ENV_FILE"
  fi
  printf '\nMODGUARD_MASTER_KEY="%s"\n' "$MASTER_KEY" >> "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  info "Generated master key and saved to $ENV_FILE"
  warn "Back up $ENV_FILE — losing this key means losing access to vault data"
fi

# ── 7. Patch openclaw.json ────────────────────────────────────────────────────
header "Step 7: Register plugin in openclaw.json"

PATCH_TMP=$(mktemp /tmp/modguard-patch-XXXXXX.cjs)
cat > "$PATCH_TMP" <<'PATCH_SCRIPT'
const fs = require('fs');
const [,, configFile, pluginTarget, vaultPath] = process.argv;

const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));

config.plugins         = config.plugins         || {};
config.plugins.load    = config.plugins.load    || {};
config.plugins.entries = config.plugins.entries || {};

const paths = config.plugins.load.paths || [];
if (!paths.includes(pluginTarget)) paths.push(pluginTarget);
config.plugins.load.paths = paths;

// Merge modguard entry — never overwrite values the user already set
const existing    = config.plugins.entries.modguard || {};
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
info "openclaw.json updated with modguard plugin config"

# ── 8. Shell profile ──────────────────────────────────────────────────────────
header "Step 8: Environment variable setup"

PROFILE=""
if [[ -f "$HOME/.zshrc" ]];   then PROFILE="$HOME/.zshrc"
elif [[ -f "$HOME/.bashrc" ]]; then PROFILE="$HOME/.bashrc"
elif [[ -f "$HOME/.profile" ]]; then PROFILE="$HOME/.profile"
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

# ── Summary ───────────────────────────────────────────────────────────────────
echo
echo -e "${BOLD}── Installation complete ──${NC}"
echo
echo "  Plugin installed : $PLUGIN_TARGET"
echo "  Vault directory  : $VAULT_DIR"
echo "  Master key file  : $ENV_FILE"
echo "  Config           : $CONFIG_FILE"
echo
echo -e "${BOLD}Next steps:${NC}"
echo
echo "  1. Load environment variables into your current shell:"
echo "       source $ENV_FILE"
echo
echo "  2. Restart OpenClaw to load the plugin."
echo
echo "  3. Confirm the plugin loaded — look for this in OpenClaw logs:"
echo "       OpenClaw ModGuard plugin registered"
echo
if [[ -z "$OPENCLAW_SOURCE" ]]; then
  echo -e "  ${YELLOW}Note:${NC} Bundle patching was used (Strategy B). If OpenClaw rebuilds its"
  echo "  bundles (e.g. after an update), re-run this installer with:"
  echo "       --openclaw-source-dir <path-to-openclaw-source>"
  echo "  to apply a durable source-level patch instead."
  echo
fi
echo "  To uninstall:"
echo "       ./uninstall.sh"
echo "  (or manually: rm -rf $PLUGIN_TARGET and remove modguard from $CONFIG_FILE)"
echo
