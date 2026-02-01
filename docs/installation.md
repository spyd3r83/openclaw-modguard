# Installation Guide

## Requirements

- **Node.js**: >= 22.0.0
- **OpenClaw**: >= 2026.1.29
- **Operating System**: Linux, macOS, Windows

## Installation Methods

### From Source

```bash
# Clone the repository
git clone https://github.com/anomalyco/openclaw-guard.git
cd openclaw-guard

# Install dependencies
pnpm install

# Build the plugin
pnpm build

# Link for local development
pnpm link
```

## Dependencies

### Runtime Dependencies

- **better-sqlite3**: SQLite database for vault storage (native module)
- **yargs**: CLI argument parsing

### Native Module Compilation

The `better-sqlite3` package requires native compilation. Ensure you have:

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

## Post-Install Setup

### 1. Initialize the Vault

The vault is automatically initialized on first use. To manually initialize:

```bash
# Set master key (required)
export GUARD_MASTER_KEY="your-secure-master-key"

# Optional: Set custom vault path
export GUARD_VAULT_PATH="~/.openclaw/guard/vault.db"

# Verify installation
openclaw guard status
```

### 2. Configure the Plugin

Create a configuration file at `~/.openclaw/guard/config.json`:

```json
{
  "vaultPath": "~/.openclaw/guard/vault.db",
  "masterKey": "${GUARD_MASTER_KEY}",
  "policy": {
    "failClosed": true,
    "rules": []
  }
}
```

### 3. Verify Installation

```bash
# Check plugin status
openclaw guard status

# Test detection
openclaw guard detect "My email is test@example.com"
```

## Troubleshooting Installation

### Native Module Errors

If you see errors about `better-sqlite3` bindings:

```bash
# Rebuild native modules
npm rebuild better-sqlite3
```

### Permission Errors

If you see permission errors:

```bash
# Ensure proper ownership
sudo chown -R $(whoami) ~/.openclaw
chmod 700 ~/.openclaw
chmod 600 ~/.openclaw/guard/vault.db
```

### Node.js Version

Ensure you're using Node.js 22 or higher:

```bash
node --version
# Should show v22.x.x or higher
```

## Docker Installation

For containerized environments:

```dockerfile
FROM node:22-slim

# Install build dependencies for native modules
RUN apt-get update && apt-get install -y \
    build-essential \
    python3 \
    && rm -rf /var/lib/apt/lists/*

# Install OpenClaw Guard
RUN npm install -g openclaw-guard

# Set environment variables
ENV GUARD_VAULT_PATH=/data/vault.db
ENV GUARD_MASTER_KEY=

# Create data directory
RUN mkdir -p /data && chmod 700 /data

VOLUME ["/data"]
```

## Upgrading

To upgrade to the latest version:

```bash
openclaw plugins update openclaw-guard
```

Or:

```bash
npm update -g openclaw-guard
```

## Uninstalling

```bash
openclaw plugins uninstall openclaw-guard
```

Or:

```bash
npm uninstall -g openclaw-guard
```

Note: The vault database is not removed during uninstallation. To completely remove all data:

```bash
rm -rf ~/.openclaw/guard
```
