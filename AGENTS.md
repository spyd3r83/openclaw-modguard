# AGENTS.md - Development Guide for OpenClaw ModGuard

## Project Overview

OpenClaw ModGuard is a PII/Sensitive Data Masking plugin for OpenClaw. It detects and masks sensitive information before it reaches AI models, storing encrypted values in a vault for reversible detokenization.

## Core Constraints

- Plugin source: This repository root
- OpenClaw installation: Set via `OPENCLAW_DIR` environment variable
- Dev environment: `./dev/` directory
- Package manager: **pnpm 10.x** required
- Node.js: **22.x** required

## Dev Environment

### Setup
```bash
cd dev
./setup.sh
```

### Ports (separate from production)
- Gateway: `28789` (production uses `18789`)
- Bridge: `28790` (production uses `18790`)

### Commands
```bash
# View logs
docker compose -f dev/docker-compose.yml logs -f openclaw-gateway

# List plugins
docker compose -f dev/docker-compose.yml run --rm openclaw-cli plugins list

# Stop
docker compose -f dev/docker-compose.yml down

# Restart after code changes
pnpm build && docker compose -f dev/docker-compose.yml restart openclaw-gateway
```

## Plugin Structure (Critical)

### Required Files

```
openclaw-modguard/
├── openclaw.plugin.json    # Plugin manifest (MUST match plugin ID)
├── package.json            # With openclaw.extensions pointing to dist/
├── dist/                   # Compiled JS output (required for external plugins)
│   └── index.js            # Plugin entry point
└── src/
    └── index.ts            # Source with default export
```

### openclaw.plugin.json (Critical)
```json
{
  "id": "modguard",
  "configSchema": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "vaultPath": { "type": "string" },
      "masterKey": { "type": "string" }
    }
  }
}
```

**Important:** The `configSchema.properties` MUST include all config fields the plugin expects. With `additionalProperties: false`, any unlisted properties will be rejected.

### package.json (Critical)
```json
{
  "openclaw": {
    "extensions": ["./dist/index.js"]
  },
  "pnpm": {
    "onlyBuiltDependencies": ["better-sqlite3"]
  }
}
```

**Important:**
- `extensions` must point to compiled JS, not TypeScript source
- Native modules (better-sqlite3) require explicit build permission in pnpm 10.x

### Plugin Export Pattern
```typescript
// src/index.ts
const guardPlugin = {
  id: 'modguard',  // Must match openclaw.plugin.json
  name: 'OpenClaw ModGuard',
  version: '0.1.0',
  description: 'Secure PII masking plugin',
  configSchema: { /* ... */ },
  register(api: OpenClawPluginApi): void {
    // Register commands, hooks, etc.
  }
};

export default guardPlugin;
```

### Command Registration
```typescript
// Command names must:
// - Start with a letter
// - Contain only letters, numbers, hyphens, underscores
// - NO leading slash, NO angle brackets

// WRONG:
api.registerCommand({ name: '/modguard-status', ... });
api.registerCommand({ name: 'modguard-detect <text>', ... });

// CORRECT:
api.registerCommand({ name: 'modguard-status', ... });
api.registerCommand({ name: 'modguard-detect', ... });
```

## Hooks

ModGuard automatically hooks into OpenClaw's lifecycle events when the plugin is loaded. No additional configuration is required.

### Available Hooks

#### `before_agent_start`
- **Purpose**: Detect and mask PII in user messages before they reach the model
- **Behavior**:
  - Extracts user message from `prompt` field
  - Uses Detector to find sensitive patterns
  - Tokenizes detected PII values
  - Stores tokens in SessionManager for later unmasking
  - Returns masked version as `prependContext`
- **Implementation**: `src/hooks/before-agent-start.ts`

#### `message_sending`
- **Purpose**: Restore original PII values in outbound channel messages
- **Behavior**:
  - Finds all tokens in message content
  - Uses SessionManager + Vault to detokenize
  - Returns unmasked content
  - Only applies to external channel messages (Discord, Telegram, etc.)
- **Implementation**: `src/hooks/message-sending.ts`

#### `agent_end`
- **Purpose**: Clean up session context after agent completes
- **Behavior**:
  - Clears session from SessionManager
  - Clears session from Tokenizer
  - Releases memory
- **Implementation**: `src/hooks/agent-end.ts`

### Session Management

The `SessionManager` class (src/session-manager.ts) tracks masked tokens across multi-turn conversations:

- **TTL-based cleanup**: Sessions expire after 30 minutes of inactivity (configurable)
- **Max sessions**: Automatically evicts oldest session when 1000 active sessions reached
- **Token storage**: Maps tokens to original values for each session
- **Automatic registration**: All hooks registered automatically via `registerHooks()`

### Known Limitations

1. **prependContext doesn't replace original message**
   - OpenClaw's `before_agent_start` hook only allows injecting context, not modifying the original message
   - The model may see both the original user message (with PII) and the masked version (via prependContext)
   - This is a limitation of the current OpenClaw architecture

2. **Direct API/CLI responses contain tokens**
   - The `message_sending` hook only intercepts external channel messages
   - Direct API and CLI responses will show tokens (e.g., `EMAIL_a1b2c3d4`) instead of original values
   - Users must use channels (Discord, Telegram) for full unmasking functionality

3. **Future enhancement**
   - To support full end-to-end masking, OpenClaw would need new hooks:
     - `before_model_input`: Allow modifying/replacing the actual message sent to the model
     - `after_model_output`: Allow modifying model response before returning

## Build Commands

```bash
pnpm build          # Compile TypeScript to dist/
pnpm test           # Run Vitest tests
pnpm test:coverage  # Coverage report (80% threshold)
pnpm test:e2e       # End-to-end tests
pnpm lint           # Oxlint
```

## tsconfig.json (Critical)

```json
{
  "compilerOptions": {
    "strict": true,
    "target": "es2023",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

**Critical:** Do NOT set `noEmit: true` - this prevents build output.

## Known Issues

### ESM Import Issues in Tests
When running vitest, better-sqlite3 and yargs may fail with:
- `Database is not a constructor`
- `yargs is not a function`

**Workaround:** Plugin works correctly when loaded by OpenClaw. Tests need ESM-compatible import patterns.

### In-Memory Database
```typescript
// Skip chmod for in-memory databases
if (vaultPath !== ':memory:') {
  fs.chmodSync(vaultPath, 0o600);
}
```

### Plugin ID Mismatch Warning
OpenClaw warns: `plugin id mismatch (manifest uses "modguard", entry hints "openclaw-modguard")`

This is cosmetic - the plugin loads correctly. To eliminate, either rename package to `@openclaw/modguard` or accept the warning.

## Code Style

### Language & Types
- TypeScript (ESM) with strict mode
- Use `interface` for object shapes, `type` for unions
- Avoid `any` - use `unknown` for untyped data
- Prefix unused parameters with underscore: `_masterKey`

### Imports
```typescript
// Node built-ins with node: prefix
import fs from 'node:fs';
import crypto from 'node:crypto';

// Named imports preferred
import { Vault } from './vault.js';

// Type-only imports
import type { VaultEntry } from './types.js';
```

### Error Handling
```typescript
// Define typed error classes
export class VaultError extends Error {
  constructor(message: string, public readonly context?: Record<string, unknown>) {
    super(message);
    this.name = 'VaultError';
  }
}

// Always include context
throw new VaultError('Failed to decrypt', { token, category });
```

### Naming Conventions
- **PascalCase**: Classes, interfaces, types, enums
- **camelCase**: variables, functions, properties
- **UPPER_SNAKE_CASE**: constants, env vars
- **kebab-case**: file names

## Testing

```bash
# Run all tests
pnpm test

# Run single file
npx vitest run test/vault.test.ts

# Run by pattern
npx vitest run -t "should encrypt"

# Watch mode
pnpm test:watch
```

### Test Organization
- Unit tests: `test/*.test.ts`
- E2E tests: `test/*.e2e.test.ts`
- Accuracy tests: `test/*.accuracy.test.ts`

## Security Considerations

- Vault uses AES-256-GCM encryption
- PBKDF2 key derivation (100,000 iterations)
- Unique salt and IV per entry
- File permissions set to 0o600
- Memory zeroing for sensitive data via `secureZero()`

## Project Files

```
src/
├── index.ts          # Plugin entry point
├── vault.ts          # Encrypted SQLite storage
├── detector.ts       # PII pattern detection
├── tokenizer.ts      # Value-to-token conversion
├── policy.ts         # Rule-based action decisions
├── audit.ts          # JSONL audit logging
├── security.ts       # Crypto utilities
├── backup.ts         # Vault backup/restore
├── errors.ts         # Typed error classes
├── types.ts          # TypeScript interfaces
├── session-manager.ts # Session context tracking
├── hooks/            # OpenClaw lifecycle hooks
│   ├── index.ts      # Hook registration orchestrator
│   ├── before-agent-start.ts  # Masking logic
│   ├── message-sending.ts     # Unmasking logic
│   └── agent-end.ts          # Session cleanup
├── patterns/         # Detection regex patterns
│   ├── pii.ts        # Email, phone, SSN, credit card
│   ├── secrets.ts    # API keys, tokens, PEM blocks
│   └── network.ts    # IPv4, IPv6 addresses
└── cli/              # Standalone CLI commands
    ├── index.ts
    ├── status.ts
    ├── detect.ts
    └── audit.ts
```

## Debugging

### Check if plugin loads
```bash
docker compose -f dev/docker-compose.yml logs openclaw-gateway 2>&1 | grep -i modguard
```

Expected output:
```
OpenClaw ModGuard plugin registered
```

### Check for errors
```bash
docker compose -f dev/docker-compose.yml logs openclaw-gateway 2>&1 | grep -E "failed|error|Error"
```

### Verify dist/ exists
```bash
ls -la dist/index.js
```

If missing, run `pnpm build`.

## Quick Reference

| Task | Command |
|------|---------|
| Build | `pnpm build` |
| Test | `pnpm test` |
| Start dev | `./dev/setup.sh` |
| View logs | `docker compose -f dev/docker-compose.yml logs -f openclaw-gateway` |
| Restart | `pnpm build && docker compose -f dev/docker-compose.yml restart openclaw-gateway` |
| Stop | `docker compose -f dev/docker-compose.yml down` |

## Bug Tracking

See `bugs.md` for known issues and their status.

## Current Status (2026-01-31)

### Test Results
- **454 passing / 61 failing** (515 total)
- Performance tests: All pass after caching key derivation
- Vault tests: All 16 pass
- Tokenizer tests: All 169 pass

### Remaining Work
1. **BUG-014**: Streaming cross-chunk pattern detection (19 tests failing)
2. **BUG-010**: Detector accuracy thresholds (18 tests failing)
3. **WARN-001**: Plugin ID mismatch warning (cosmetic)

### Performance
- Key derivation: ~100ms (one-time at startup)
- Single tokenize/detokenize: ~1-7ms
- Batch of 1000: ~300ms

### Dev Environment
```bash
# Start dev gateway (requires OPENCLAW_DIR)
export OPENCLAW_DIR=/path/to/openclaw
cd dev && ./setup.sh

# Verify plugin registered
docker compose logs openclaw-gateway | grep "ModGuard plugin registered"
```
