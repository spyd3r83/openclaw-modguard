#!/usr/bin/env bash
set -euo pipefail

# OpenClaw Guard Development Environment Setup
# This creates an isolated dev instance mirroring production

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
OPENCLAW_DIR="$OPENCLAW_DIR"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing dependency: $1" >&2
    exit 1
  fi
}

require_cmd docker
if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose not available (try: docker compose version)" >&2
  exit 1
fi

# Verify OpenClaw installation exists
if [[ ! -d "$OPENCLAW_DIR" ]]; then
  echo "Error: OpenClaw not found at $OPENCLAW_DIR" >&2
  exit 1
fi

# Dev environment paths - completely separate from production
export OPENCLAW_DEV_CONFIG_DIR="${OPENCLAW_DEV_CONFIG_DIR:-$PROJECT_ROOT/dev/.openclaw}"
export OPENCLAW_DEV_WORKSPACE_DIR="${OPENCLAW_DEV_WORKSPACE_DIR:-$PROJECT_ROOT/dev/.openclaw/workspace}"
export OPENCLAW_GUARD_PLUGIN_DIR="$PROJECT_ROOT"

# Use different ports than production (28xxx vs 18xxx)
export OPENCLAW_GATEWAY_PORT="${OPENCLAW_GATEWAY_PORT:-28789}"
export OPENCLAW_BRIDGE_PORT="${OPENCLAW_BRIDGE_PORT:-28790}"
export OPENCLAW_GATEWAY_BIND="${OPENCLAW_GATEWAY_BIND:-lan}"
export OPENCLAW_IMAGE="${OPENCLAW_IMAGE:-openclaw:local}"

# Generate dev gateway token if not set
if [[ -z "${OPENCLAW_GATEWAY_TOKEN:-}" ]]; then
  if command -v openssl >/dev/null 2>&1; then
    OPENCLAW_GATEWAY_TOKEN="$(openssl rand -hex 32)"
  else
    OPENCLAW_GATEWAY_TOKEN="$(python3 -c 'import secrets; print(secrets.token_hex(32))')"
  fi
fi
export OPENCLAW_GATEWAY_TOKEN

# Generate dev guard master key
export GUARD_MASTER_KEY="${GUARD_MASTER_KEY:-$(openssl rand -hex 16)}"

echo "==> OpenClaw Guard Development Setup"
echo ""
echo "OpenClaw installation: $OPENCLAW_DIR"
echo "Dev config: $OPENCLAW_DEV_CONFIG_DIR"
echo "Dev workspace: $OPENCLAW_DEV_WORKSPACE_DIR"
echo "Plugin source: $OPENCLAW_GUARD_PLUGIN_DIR"
echo ""

# Create dev directories
mkdir -p "$OPENCLAW_DEV_CONFIG_DIR"
mkdir -p "$OPENCLAW_DEV_WORKSPACE_DIR"
mkdir -p "$OPENCLAW_DEV_CONFIG_DIR/extensions"

# Write .env file
ENV_FILE="$SCRIPT_DIR/.env"
cat > "$ENV_FILE" << EOF
OPENCLAW_DEV_CONFIG_DIR=$OPENCLAW_DEV_CONFIG_DIR
OPENCLAW_DEV_WORKSPACE_DIR=$OPENCLAW_DEV_WORKSPACE_DIR
OPENCLAW_GUARD_PLUGIN_DIR=$OPENCLAW_GUARD_PLUGIN_DIR
OPENCLAW_GATEWAY_PORT=$OPENCLAW_GATEWAY_PORT
OPENCLAW_BRIDGE_PORT=$OPENCLAW_BRIDGE_PORT
OPENCLAW_GATEWAY_BIND=$OPENCLAW_GATEWAY_BIND
OPENCLAW_GATEWAY_TOKEN=$OPENCLAW_GATEWAY_TOKEN
OPENCLAW_IMAGE=$OPENCLAW_IMAGE
GUARD_MASTER_KEY=$GUARD_MASTER_KEY
EOF
echo "==> Wrote environment to $ENV_FILE"

# Build the plugin first
echo ""
echo "==> Building openclaw-guard plugin"
cd "$PROJECT_ROOT"
if [[ -f "pnpm-lock.yaml" ]]; then
  pnpm install --frozen-lockfile 2>/dev/null || pnpm install
  pnpm build
else
  npm install
  npm run build
fi

# Check if production Docker image exists
if ! docker image inspect "$OPENCLAW_IMAGE" >/dev/null 2>&1; then
  echo ""
  echo "==> Building OpenClaw Docker image"
  cd "$OPENCLAW_DIR"
  docker build -t "$OPENCLAW_IMAGE" -f Dockerfile .
fi

# Create dev openclaw.json config with guard plugin enabled
echo ""
echo "==> Creating dev configuration"
cat > "$OPENCLAW_DEV_CONFIG_DIR/openclaw.json" << EOF
{
  "meta": {
    "lastTouchedVersion": "2026.1.29",
    "lastTouchedAt": "$(date -Iseconds)"
  },
  "gateway": {
    "mode": "local",
    "bind": "lan",
    "auth": {
      "mode": "token",
      "token": "$OPENCLAW_GATEWAY_TOKEN"
    },
    "controlUi": {
      "allowInsecureAuth": true,
      "dangerouslyDisableDeviceAuth": true
    }
  },
  "models": {
    "providers": {
      "ollama": {
        "baseUrl": "http://localhost:11434/v1",
        "apiKey": "ollama-local",
        "api": "openai-completions",
        "models": [
          {
            "id": "glm-4.6:cloud",
            "name": "GLM 4.6 Cloud",
            "reasoning": true,
            "input": ["text"],
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
            "contextWindow": 160000,
            "maxTokens": 160000
          }
        ]
      }
    }
  },
  "agents": {
    "defaults": {
      "compaction": { "mode": "safeguard" },
      "maxConcurrent": 4
    },
    "list": [
      {
        "id": "dev-agent",
        "name": "Dev Agent",
        "workspace": "/home/node/workspace",
        "model": {
          "primary": "ollama/glm-4.6:cloud"
        },
        "tools": {
          "profile": "full"
        }
      }
    ]
  },
  "plugins": {
    "enabled": true,
    "load": {
      "paths": ["/home/node/.openclaw/extensions/guard"]
    },
    "entries": {
      "guard": {
        "enabled": true,
        "config": {
          "vaultPath": "/home/node/.openclaw/guard/vault.db",
          "masterKey": "\${GUARD_MASTER_KEY}"
        }
      }
    }
  }
}
EOF

# Create guard data directory
mkdir -p "$OPENCLAW_DEV_CONFIG_DIR/guard"

echo ""
echo "==> Starting dev gateway"
cd "$SCRIPT_DIR"
docker compose up -d openclaw-gateway

echo ""
echo "=================================================="
echo "OpenClaw Guard Dev Environment Ready"
echo "=================================================="
echo ""
echo "Gateway: http://localhost:$OPENCLAW_GATEWAY_PORT"
echo "Token: $OPENCLAW_GATEWAY_TOKEN"
echo "Config: $OPENCLAW_DEV_CONFIG_DIR"
echo ""
echo "Commands:"
echo "  docker compose -f $SCRIPT_DIR/docker-compose.yml logs -f openclaw-gateway"
echo "  docker compose -f $SCRIPT_DIR/docker-compose.yml run --rm openclaw-cli plugins list"
echo "  docker compose -f $SCRIPT_DIR/docker-compose.yml run --rm openclaw-cli guard status"
echo ""
echo "To stop:"
echo "  docker compose -f $SCRIPT_DIR/docker-compose.yml down"
echo ""
