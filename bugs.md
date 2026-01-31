# OpenClaw Guard - Bug Report

This document tracks issues discovered during development and testing of the openclaw-guard plugin.

---

## Critical Issues

### BUG-000: Vault retrieve generated new random salt instead of using stored salt
**Status:** Fixed
**Severity:** Critical
**File:** `src/vault.ts`, `src/backup.ts`, `test/backup.test.ts`

**Description:**
The `retrieve()` method generated a new random salt for decryption instead of using the salt that was stored during encryption. This made all decryption operations fail with "Failed to decrypt data" errors. Additionally:
- Database schema was missing the `salt` column
- `store()` method didn't save the salt to the database
- `backup.ts` wasn't handling salt in backup/restore operations

**Impact:**
- All vault retrieval operations failed
- 174+ tests failed due to encryption/decryption errors
- Backup/restore functionality was broken

**Fix:**
- Added `salt BLOB NOT NULL` column to database schema
- Modified `store()` to save salt to database
- Modified `retrieve()` to fetch salt from database and use for decryption
- Updated `BackupEntry` interface to include salt
- Updated `vaultBackup()` to include salt in backup
- Updated `vaultRestore()` to restore salt from backup
- Updated test fixtures to create vaults with salt column

**Root cause:**
The salt was generated during encryption but never persisted, violating AES-GCM's requirement that the same salt be used for key derivation during decryption.

---

### BUG-001: tsconfig.json had `noEmit: true` preventing build output
**Status:** Fixed
**Severity:** Critical
**File:** `tsconfig.json`

**Description:**
The TypeScript configuration had `noEmit: true` which prevented `pnpm build` from generating any output files in the `dist/` directory. This made the plugin unloadable.

**Fix:**
Removed `noEmit: true` and `noEmitOnError: true`, added proper declaration generation:
```json
{
  "declaration": true,
  "declarationMap": true,
  "sourceMap": true
}
```

---

### BUG-002: Plugin manifest configSchema was empty
**Status:** Fixed
**Severity:** Critical
**File:** `openclaw.plugin.json`

**Description:**
The `configSchema.properties` was an empty object `{}` but the plugin code expects `vaultPath` and `masterKey` configuration. With `additionalProperties: false`, any config values were rejected.

**Fix:**
Added proper schema properties:
```json
{
  "properties": {
    "vaultPath": { "type": "string" },
    "masterKey": { "type": "string" }
  }
}
```

---

### BUG-003: Package.json openclaw.extensions pointed to TypeScript source
**Status:** Fixed
**Severity:** Critical
**File:** `package.json`

**Description:**
The `openclaw.extensions` field pointed to `./index.ts` but for external plugins loaded at runtime, the compiled JavaScript is needed.

**Fix:**
Changed to `./dist/index.js`.

---

### BUG-004: Invalid command names in CLI registration
**Status:** Fixed
**Severity:** High
**Files:** `src/cli/status.ts`, `src/cli/detect.ts`

**Description:**
Commands were registered with names like `/modguard-status` and `/modguard-detect <text>`. OpenClaw requires command names to start with a letter and contain only letters, numbers, hyphens, and underscores.

**Fix:**
Changed to `modguard-status` and `modguard-detect` (no leading slash, no angle brackets).

---

## Build Issues

### BUG-005: pnpm doesn't build better-sqlite3 by default
**Status:** Fixed
**Severity:** Medium
**File:** `package.json`

**Description:**
pnpm 10.x ignores build scripts by default for security. The `better-sqlite3` native module was not being compiled.

**Fix:**
Added pnpm configuration to package.json:
```json
{
  "pnpm": {
    "onlyBuiltDependencies": ["better-sqlite3"]
  }
}
```

---

### BUG-006: TypeScript errors - missing type annotations
**Status:** Fixed
**Severity:** Medium
**Files:** `src/cli/audit.ts`, `src/cli/index.ts`, `src/policy.ts`, `src/policy-loader.ts`, `src/backup.ts`

**Description:**
Multiple TypeScript strict mode errors:
- Missing `yargs` parameter type annotations in CLI files
- `PolicyContext` interface missing `originalContent` property
- `PolicyDecision` interface missing `matchedRule` property
- `integrityCheck` variable needed type assertion in backup.ts
- Array type assertion needed in policy-loader.ts

**Fix:**
Added explicit type annotations and interface properties.

---

## Test Failures

### BUG-007: Token regex didn't support multi-word categories
**Status:** Fixed
**Severity:** High
**File:** `src/tokenizer.ts`

**Description:**
The token validation regex `/^([A-Z]+)_([0-9a-f]{8})$/i` only matched single-word prefixes like `EMAIL`, `PHONE`, `SSN`. It didn't match multi-word prefixes like `CREDIT_CARD`, `API_KEY`, `BEARER_TOKEN`, `PEM_BLOCK`, `IPV4`, `IPV6`.

**Impact:**
- Token validation failed for all extended pattern types
- 6+ test failures for invalid token format expectations

**Fix:**
Changed regex to `/^([A-Z0-9_]+)_([0-9a-f]{8})$/i` to allow underscores and digits in the token prefix.

**Root cause:**
Original `[A-Z]+` character class only matched uppercase letters, not underscores or digits needed for multi-word categories like `CREDIT_CARD` and `IPV4`.

---

### BUG-008: Tokenizer stored wrong category in vault
**Status:** Fixed
**Severity:** High
**File:** `src/tokenizer.ts`

**Description:**
The `tokenize()` method called `getCategoryForPattern(category)` to get the PatternCategory ('pii', 'secrets', 'network'), then stored tokens with that category. But `detokenize()` retrieved tokens using the PatternType ('email', 'phone', etc.) extracted from the token prefix. This mismatch caused all vault lookups to fail.

**Impact:**
- Tokenization worked but detokenization always failed with "Token not found in vault"
- Vault integration tests all failed
- Batch round-trip operations failed

**Fix:**
Modified `tokenize()` to store with the original `category: PatternType` instead of `categoryType: PatternCategory`.

**Root cause:**
Vault operations should use consistent category type. The token format uses PatternType as prefix (e.g., `EMAIL_`), so vault should use same type for lookups.

---

### BUG-009: ESM import issues with better-sqlite3 and yargs
**Status:** Open
**Severity:** High
**Files:** Tests importing `better-sqlite3` or `yargs`

**Description:**
When running tests via vitest, ESM imports fail:
- `Database is not a constructor` for better-sqlite3
- `yargs is not a function` for yargs

This is a common Node.js ESM/CJS interop issue. The modules export differently when loaded via ESM vs CJS.

**Workaround:**
The plugin works correctly when loaded by OpenClaw (which handles module loading differently). Tests need updated import syntax.

---

### BUG-008: Vault cannot chmod in-memory database
**Status:** Fixed
**Severity:** Medium
**File:** `src/vault.ts:38`

**Description:**
When using `:memory:` as the vault path for testing, the code tries to `fs.chmodSync(':memory:', 0o600)` which fails with `ENOENT`.

**Fix:**
Skip chmod for in-memory databases:
```typescript
if (vaultPath !== ':memory:') {
  fs.chmodSync(vaultPath, 0o600);
}
```

---

### BUG-009: Policy test syntax error
**Status:** Open
**Severity:** Low
**File:** `test/policy.test.ts:795`

**Description:**
Syntax error in policy tests: `Expected "]" but found "}"`.

---

### BUG-010: Detector accuracy test thresholds too strict
**Status:** Open
**Severity:** Low
**File:** `test/detector.accuracy.test.ts`

**Description:**
Multiple accuracy tests have thresholds that are not being met:
- Phone detection: expected >= 60, got 37
- SSN detection: expected >= 60, got 46
- Credit card detection: expected >= 60, got 54
- API key detection: expected >= 60, got 42
- Bearer token detection: expected >= 60, got 49
- PEM detection: expected >= 60, got 45
- IPv4 detection: expected >= 60, got 57

Either the regex patterns need improvement or the test thresholds need adjustment.

---

### BUG-011: Token detokenize truncated multi-word category prefixes
**Status:** Fixed
**Severity:** Critical
**File:** `src/tokenizer.ts:197`

**Description:**
The `detokenize()` method used `token.split('_')` to extract the category prefix, which split on ALL underscores. For multi-word categories like `CREDIT_CARD_abc123`, this resulted in `['CREDIT', 'CARD', 'abc123']` and only took `'CREDIT'` as the category, causing all vault lookups to fail with "Unknown pattern type".

**Impact:**
- All detokenization operations for extended patterns (credit cards, API keys, bearer tokens, PEM blocks) failed
- 136+ test failures
- Tokenization worked but detokenization always failed

**Fix:**
Changed to use TOKEN_REGEX to extract category prefix correctly:
```typescript
const match = TOKEN_REGEX.exec(token);
if (!match) {
  throw new DetokenizationError('Invalid token format', { token, session });
}
const category = match[1].toLowerCase() as PatternType;
```

**Root cause:**
The token format uses `{CATEGORY}_{HEX_SUFFIX}` where CATEGORY can contain underscores (e.g., `CREDIT_CARD`, `BEARER_TOKEN`). The regex `/^([A-Z0-9_]+)_([0-9a-f]{8})$/i` correctly captures this, but the code was using simple split instead.

---

### BUG-012: Test master keys too short for Vault validation
**Status:** Fixed
**Severity:** High
**Files:** `test/vault.test.ts`, `test/tokenizer.test.ts`, `test/cli.test.ts`, `test/streaming.test.ts`, `test/masking-roundtrip.e2e.test.ts`, `dev/docker-compose.yml`

**Description:**
Multiple test files used master keys shorter than the required 64 hex characters:
- `'test-master-key-12345678'` (26 chars)
- `'test-master-key-123456'` (21 chars)
- `'test-master-key'` (14 chars)
- `'test-key-' + Date.now()` (variable, usually <64)
- `'dev-guard-master-key-32bytes!'` (32 chars)

The Vault constructor validates: `if (masterKey.length < 64) throw VaultError(...)`.

**Impact:**
- All vault operations failed in test environment
- Vault constructor threw "Master key must be at least 32 bytes (64 hex chars)" on initialization
- 136+ test failures

**Fix:**
Updated all test files and dev config to use 64-character hex key:
```typescript
'0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
```

**Root cause:**
Vault was updated to enforce 64-char minimum but test fixtures weren't updated to match.

---

### BUG-013: Tokenizer performance ~40ms per operation (target <1ms)
**Status:** Open
**Severity:** High
**Files:** `src/tokenizer.ts`, `src/vault.ts`

**Description:**
Tokenizer operations are taking ~40-45ms each, far exceeding the target of <1ms:
- Single tokenize: ~44ms (target <5ms)
- Single detokenize: ~40ms (target <5ms)
- Average over iterations: ~40ms (target <1ms)
- Batch of 100: ~4000ms (target <500ms)
- Batch of 1000: timeouts (target 10s)

**Impact:**
- 83+ performance test failures
- Production will be unusable at current speed
- Database operations likely the bottleneck

**Potential causes:**
- SQLite vault operations not optimized
- PBKDF2 key derivation (100k iterations) on every operation
- No connection pooling or prepared statement caching
- Synchronous database operations blocking event loop

**Root cause:**
Vault constructor uses synchronous `new Database()` and synchronous encryption operations. Each tokenize/detokenize triggers database I/O + crypto operations.

---

## Warnings

### WARN-001: Plugin ID mismatch warning
**Status:** Open
**Severity:** Low

**Description:**
OpenClaw logs repeated warnings:
```
plugin modguard: plugin id mismatch (manifest uses "modguard", entry hints "openclaw-modguard")
```

This appears to be a warning about the package name (`openclaw-modguard`) not matching the plugin ID (`modguard`). It's cosmetic but noisy.

**Potential fix:**
Either rename the package to `@openclaw/modguard` or update the manifest ID to match.

---

### WARN-002: Unused masterKey variables in backup.ts
**Status:** Fixed
**Severity:** Low
**File:** `src/backup.ts:240, 368`

**Description:**
The `masterKey` parameter is declared but never read in two functions.

**Fix:**
Prefixed with underscore to indicate intentionally unused: `_masterKey`.

---

## Environment Issues

### ENV-001: Docker plugin loading requires compiled output
**Status:** Documented
**Severity:** Info

**Description:**
Unlike bundled OpenClaw plugins (which are TypeScript and transpiled together with OpenClaw), external plugins must provide compiled JavaScript. The Docker container doesn't have the plugin's TypeScript dependencies.

---

## Summary

| ID | Status | Severity | Summary |
|----|--------|----------|---------|
| BUG-001 | Fixed | Critical | noEmit prevented build output |
| BUG-002 | Fixed | Critical | Empty configSchema rejected config |
| BUG-003 | Fixed | Critical | Wrong extension entry point |
| BUG-004 | Fixed | High | Invalid command names |
| BUG-005 | Fixed | Medium | Native module not building |
| BUG-006 | Fixed | Medium | Missing TypeScript types |
| BUG-007 | Open | High | ESM import issues in tests |
| BUG-008 | Fixed | Medium | chmod on :memory: fails |
| BUG-009 | Open | Low | Policy test syntax error |
| BUG-010 | Open | Low | Detector accuracy thresholds |
| BUG-011 | Fixed | Critical | Token detokenize truncated multi-word categories |
| BUG-012 | Fixed | High | Test master keys too short (<64 hex chars) |
| BUG-013 | Open | High | Tokenizer performance ~40ms per operation (target <1ms) |
| WARN-001 | Open | Low | Plugin ID mismatch warning |
| WARN-002 | Fixed | Low | Unused masterKey variables |

---

*Last updated: 2026-01-31*
