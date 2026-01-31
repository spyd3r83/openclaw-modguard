# OpenClaw Guard - Bug Report

This document tracks issues discovered during development and testing of the openclaw-guard plugin.

---

## Critical Issues

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
Commands were registered with names like `/guard-status` and `/guard-detect <text>`. OpenClaw requires command names to start with a letter and contain only letters, numbers, hyphens, and underscores.

**Fix:**
Changed to `guard-status` and `guard-detect` (no leading slash, no angle brackets).

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

### BUG-007: ESM import issues with better-sqlite3 and yargs
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

## Warnings

### WARN-001: Plugin ID mismatch warning
**Status:** Open
**Severity:** Low

**Description:**
OpenClaw logs repeated warnings:
```
plugin guard: plugin id mismatch (manifest uses "guard", entry hints "openclaw-guard")
```

This appears to be a warning about the package name (`openclaw-guard`) not matching the plugin ID (`guard`). It's cosmetic but noisy.

**Potential fix:**
Either rename the package to `@openclaw/guard` or update the manifest ID to match.

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
| WARN-001 | Open | Low | Plugin ID mismatch warning |
| WARN-002 | Fixed | Low | Unused masterKey variables |

---

*Last updated: 2026-01-31*
