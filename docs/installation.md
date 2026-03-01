# Installation Guide

## Prerequisites

- **OpenClaw** >= 2026.1.29 (installed and running at least once so `~/.openclaw/` exists)
- **Node.js** >= 22.0.0
- **pnpm** >= 10.0.0
- **openssl** (for master key generation — available on Linux/macOS by default)

Check your versions:
```bash
node --version    # >= v22.0.0
pnpm --version    # >= 10.0.0
```

## Quick Install (recommended)

Clone the repo and run the installer:

```bash
git clone https://github.com/spyd3r83/openclaw-modguard.git
cd openclaw-modguard
./install.sh
```

The script will:
1. Check prerequisites
2. Run `pnpm install && pnpm build`
3. Copy plugin files to `~/.openclaw/extensions/modguard/`
4. Generate a 64-hex master key and write it to `~/.openclaw/.env`
5. Patch `~/.openclaw/openclaw.json` with the load path and plugin entry
6. Add `source ~/.openclaw/.env` to your shell profile

Then restart OpenClaw and look for this line in the logs:
```
OpenClaw ModGuard plugin registered
```

### Custom OpenClaw directory

If your OpenClaw config is not in `~/.openclaw`:

```bash
./install.sh --openclaw-dir /path/to/openclaw-config
```

Or set the env var first:
```bash
export OPENCLAW_DIR=/path/to/openclaw-config
./install.sh
```

---

## Manual Install

If you prefer to do each step by hand:

### 1. Build

```bash
git clone https://github.com/spyd3r83/openclaw-modguard.git
cd openclaw-modguard
pnpm install
pnpm build
```

### 2. Copy plugin files

```bash
PLUGIN_TARGET=~/.openclaw/extensions/modguard
mkdir -p "$PLUGIN_TARGET"
cp -r dist openclaw.plugin.json package.json node_modules "$PLUGIN_TARGET/"
chmod 750 "$PLUGIN_TARGET"
```

### 3. Generate a master key

The vault requires a 64-character hex key (32 bytes):

```bash
openssl rand -hex 32
# Example output: a3f8c2d19e4b7065f1a2b3c4d5e6f7081234567890abcdef1234567890abcdef
```

Add it to your environment. The recommended approach is a persistent env file:

```bash
echo "MODGUARD_MASTER_KEY=\"$(openssl rand -hex 32)\"" >> ~/.openclaw/.env
chmod 600 ~/.openclaw/.env
# Then add to your shell profile:
echo '[ -f ~/.openclaw/.env ] && source ~/.openclaw/.env' >> ~/.bashrc
source ~/.bashrc
```

**Keep this key safe.** Losing it means losing access to all data in the vault.

### 4. Patch openclaw.json

OpenClaw's config file is `~/.openclaw/openclaw.json` (JSON format). Add the plugin load path and entry:

```json
{
  "plugins": {
    "load": {
      "paths": [
        "/home/YOUR_USER/.openclaw/extensions/modguard"
      ]
    },
    "entries": {
      "modguard": {
        "enabled": true,
        "config": {
          "vaultPath": "/home/YOUR_USER/.openclaw/modguard/vault.db",
          "masterKey": "${MODGUARD_MASTER_KEY}"
        }
      }
    }
  }
}
```

Replace `YOUR_USER` with your actual username, or use the full absolute path from `echo $HOME`.

### 5. Create vault directory

```bash
mkdir -p ~/.openclaw/modguard
chmod 700 ~/.openclaw/modguard
```

### 6. Restart OpenClaw

Restart OpenClaw (the specific command depends on your setup — Docker, systemd, etc.).

### 7. Verify

Check the logs for:
```
OpenClaw ModGuard plugin registered
```

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `MODGUARD_MASTER_KEY` | **Yes** | 64-char hex key for vault encryption. Min 64 chars. |
| `MODGUARD_VAULT_PATH` | No | Override vault DB path. Defaults to value in `openclaw.json` config. |

The plugin reads these from environment variables at startup. The `masterKey` value in `openclaw.json` should be `"${MODGUARD_MASTER_KEY}"` — OpenClaw expands env var references in config values.

---

## Upgrading

```bash
cd /path/to/openclaw-modguard
git pull origin main
./install.sh
```

The installer is idempotent — it will rebuild, overwrite the plugin files, and skip key generation if a valid key already exists in `~/.openclaw/.env`.

Then restart OpenClaw.

---

## Uninstalling

```bash
# Remove plugin files
rm -rf ~/.openclaw/extensions/modguard

# Edit ~/.openclaw/openclaw.json and remove:
#   - the path from plugins.load.paths
#   - the "modguard" entry from plugins.entries

# Restart OpenClaw
```

The vault database is not removed automatically. To delete all vault data:

```bash
rm -rf ~/.openclaw/modguard
```

---

## Troubleshooting

### Plugin not loading

Check that these files exist:
```bash
ls ~/.openclaw/extensions/modguard/
# Should show: dist/  node_modules/  openclaw.plugin.json  package.json
```

And that `openclaw.json` has the correct path:
```bash
grep -A5 '"load"' ~/.openclaw/openclaw.json
```

### "Master key must be at least 32 bytes" error

Your `MODGUARD_MASTER_KEY` is too short (must be >= 64 hex characters). Regenerate:
```bash
openssl rand -hex 32
```
and update `~/.openclaw/.env`.

### "PATH_NOT_WRITABLE" vault error

Ensure the vault directory exists and is writable:
```bash
mkdir -p ~/.openclaw/modguard
chmod 700 ~/.openclaw/modguard
```

### Native module errors (better-sqlite3)

The `better-sqlite3` module must be compiled for your Node.js version and architecture. If you see binding errors:

```bash
cd /path/to/openclaw-modguard
pnpm rebuild better-sqlite3
./install.sh  # Re-copy updated node_modules
```

Requires build tools:
- **Linux**: `sudo apt-get install build-essential python3`
- **macOS**: `xcode-select --install`

### Node.js version

```bash
node --version  # Must be v22.x.x or higher
```
