# Installation Guide

## Prerequisites

Before installing OpenClaw ModGuard, ensure you have:

- **OpenClaw**: >= 2026.1.29 (installed and running)
- **Node.js**: >= 22.0.0
- **pnpm**: >= 10.0.0 (recommended) or npm >= 10.0.0

Check your versions:
```bash
openclaw --version   # Should be >= 2026.1.29
node --version       # Should be >= v22.0.0
pnpm --version       # Should be >= 10.0.0
```

## Installation

### Install from Source

**Step 1: Clone and Build**
```bash
# Clone the repository
git clone https://github.com/spyd3r83/openclaw-modguard.git
cd openclaw-modguard

# Install dependencies
pnpm install

# Build the plugin
pnpm build
```

**Step 2: Install into OpenClaw**

There are two ways to install the plugin into OpenClaw:

**Method A: Copy to OpenClaw Plugins Directory (Recommended)**
```bash
# Set OPENCLAW_DIR to your OpenClaw installation
export OPENCLAW_DIR=/path/to/your/openclaw

# Copy plugin to OpenClaw's plugins directory
mkdir -p $OPENCLAW_DIR/plugins/openclaw-modguard
cp -r dist openclaw.plugin.json package.json node_modules $OPENCLAW_DIR/plugins/openclaw-modguard/

# Restart OpenClaw
# (See your OpenClaw setup for restart instructions)
```

**Method B: Reference Plugin Path in Config**

Add to your OpenClaw configuration (e.g., `~/.openclaw/config.yaml`):
```yaml
plugins:
  - path: /absolute/path/to/openclaw-modguard
```

Then restart OpenClaw.

## Verify Installation

After installation, verify the plugin is loaded:

```bash
# List installed plugins (should show "modguard")
openclaw plugins list

# Check ModGuard status
openclaw modguard status

# Test detection
openclaw modguard detect "My email is test@example.com"
```

Expected output:
```
✓ ModGuard Status: Active
✓ Vault: Initialized
✓ Patterns loaded: 9 patterns across 3 categories
```

## Configure the Plugin

### Step 1: Set Master Key (Required)

**IMPORTANT**: The master key encrypts all sensitive data in the vault. Keep it secure!

```bash
# Option A: Environment variable (recommended)
export MODGUARD_MASTER_KEY="your-secure-random-key-min-32-chars"

# Option B: Add to your shell profile (~/.bashrc, ~/.zshrc)
echo 'export MODGUARD_MASTER_KEY="your-secure-random-key"' >> ~/.bashrc
source ~/.bashrc
```

**Generate a secure master key:**
```bash
# Linux/macOS
openssl rand -base64 32

# Or use Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### Step 2: Configure Plugin Settings

Add ModGuard configuration to OpenClaw's config file (`~/.openclaw/config.yaml`):

```yaml
plugins:
  modguard:
    vaultPath: ~/.openclaw/modguard/vault.db
    masterKey: ${MODGUARD_MASTER_KEY}  # References env variable
    policy:
      failClosed: true
      rules:
        - name: mask-pii
          action: mask
          priority: 100
          conditions:
            - type: category
              operator: "=="
              value: pii
            - type: confidence
              operator: ">="
              value: 0.8
```

**Minimal configuration** (uses defaults):
```yaml
plugins:
  modguard:
    masterKey: ${MODGUARD_MASTER_KEY}
```

### Step 3: Restart OpenClaw

```bash
# Restart OpenClaw to load the plugin
# (Specific command depends on your OpenClaw setup)
systemctl restart openclaw  # If using systemd
# or
docker compose restart      # If using Docker
```

## Dependencies (for Development)

If building from source, you need:

### Native Module Build Tools

The `better-sqlite3` package requires native compilation:

**Linux:**
```bash
sudo apt-get install build-essential python3
```

**macOS:**
```bash
xcode-select --install
```

**Windows:**
```powershell
npm install -g windows-build-tools
```

## Troubleshooting Installation

### Native Module Errors

If you see errors about `better-sqlite3` bindings:

```bash
# Rebuild native modules
cd /path/to/openclaw-modguard
pnpm rebuild better-sqlite3
pnpm build

# Copy updated files to OpenClaw
cp -r dist node_modules $OPENCLAW_DIR/plugins/openclaw-modguard/
```

### Permission Errors

If you see permission errors:

```bash
# Ensure proper ownership
sudo chown -R $(whoami) ~/.openclaw
chmod 700 ~/.openclaw
chmod 600 ~/.openclaw/modguard/vault.db
```

### Node.js Version

Ensure you're using Node.js 22 or higher:

```bash
node --version
# Should show v22.x.x or higher
```

### Plugin Not Loading

If OpenClaw doesn't recognize the plugin:

```bash
# Verify files are in the right place
ls -la $OPENCLAW_DIR/plugins/openclaw-modguard/
# Should see: dist/, openclaw.plugin.json, package.json, node_modules/

# Check OpenClaw logs for errors
tail -f ~/.openclaw/logs/openclaw.log

# Verify plugin manifest
cat $OPENCLAW_DIR/plugins/openclaw-modguard/openclaw.plugin.json
```

## Docker Installation

For containerized environments:

```dockerfile
FROM node:22-slim

# Install build dependencies for native modules
RUN apt-get update && apt-get install -y \
    build-essential \
    python3 \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install pnpm
RUN npm install -g pnpm

# Clone and build plugin
WORKDIR /opt
RUN git clone https://github.com/spyd3r83/openclaw-modguard.git
WORKDIR /opt/openclaw-modguard
RUN pnpm install && pnpm build

# Set environment variables
ENV MODGUARD_VAULT_PATH=/data/vault.db
ENV MODGUARD_MASTER_KEY=

# Create data directory
RUN mkdir -p /data && chmod 700 /data

VOLUME ["/data"]
```

## Upgrading

To upgrade to the latest version:

```bash
cd /path/to/openclaw-modguard
git pull origin main
pnpm install
pnpm build

# Copy updated files to OpenClaw plugins directory
export OPENCLAW_DIR=/path/to/your/openclaw
cp -r dist openclaw.plugin.json package.json node_modules $OPENCLAW_DIR/plugins/openclaw-modguard/

# Restart OpenClaw
```

## Uninstalling

```bash
# Remove from OpenClaw plugins directory
rm -rf $OPENCLAW_DIR/plugins/openclaw-modguard

# Or remove plugin path from OpenClaw config
# Edit ~/.openclaw/config.yaml and remove the modguard entry

# Restart OpenClaw
```

Note: The vault database is not removed during uninstallation. To completely remove all data:

```bash
rm -rf ~/.openclaw/modguard
```
