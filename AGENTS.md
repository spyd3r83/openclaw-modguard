# AGENTS.md - Development Guide for Agentic Coding

## Core Constraints

- Code development in `./`
- Docker Compose services managed in `docker/` subdirectory
- Plane MCP server deployment via Docker

## Mindset & Principles

- **Think first, then act** - Understand the problem before writing code
- **Keep it simple** - Simplicity is not optional; avoid unnecessary files and complexity
- **Structure over strings** - Use enums and types instead of magic strings
- **Fail fast** - Validate configuration at startup; crash immediately on missing config
- **One responsibility** - Functions should do one thing well
- **Test relentlessly** - If it isn't tested, it doesn't exist
- **Document honestly** - Write READMEs that actually work; document edge cases
- **Security by design** - Validate all input; least privilege everywhere
- **External services fail** - All external integrations will fail; plan for it
- **Hope is not a strategy** - Add timeouts, retries, and fallbacks for external calls
- **All I/O is async** - Treat all network/disk operations as asynchronous
- **Group related logic** - Cohesive functions are easier to test and maintain

## Build Commands

- `pnpm build` - Compile TypeScript to dist/ (runs tsc, builds A2UI bundle, copies hook metadata)
- `pnpm ui:build` - Build the web UI (auto-installs UI deps on first run)

## Type Check

- `npx tsc --noEmit` - Type check without emitting files

## Lint & Format

- `pnpm lint` - Run Oxlint linter with type-aware checks (unicorn, typescript, oxc plugins)
- `pnpm lint:fix` - Auto-fix lint issues and reformat with oxfmt
- `pnpm format` - Check formatting with Oxfmt
- `pnpm format:fix` - Auto-format code with Oxfmt
- `pnpm lint:all` - Lint TypeScript and Swift (`pnpm lint && pnpm lint:swift`)
- `pnpm format:all` - Format TypeScript and Swift (`pnpm format && pnpm format:swift`)

## Test Commands

- `pnpm test` - Run all Vitest tests (parallel, max 16 workers locally, 3 in CI)
- `pnpm test:coverage` - Run tests with V8 coverage report (70% lines/funcs/statements, 55% branches)
- `pnpm test:watch` - Watch mode for continuous testing
- `pnpm test:e2e` - Run end-to-end tests
- `pnpm test:live` - Run live tests with real API keys (requires CLAWDBOT_LIVE_TEST=1)
- `npx vitest run <path/to/test.test.ts>` - Run single test file
- `npx vitest run -t <test-name>` - Run tests matching name pattern

**Single test example:**
`npx vitest run src/utils.test.ts`

**Test by name:**
`npx vitest run -t "normalizePath should add leading slash"`

## Development

- `pnpm dev` - Run CLI in development mode
- `pnpm openclaw <cmd>` - Run OpenClaw CLI command
- `pnpm gateway:dev` - Start gateway in dev mode (skips channels)
- `pnpm gateway:watch` - Watch mode for gateway with auto-reload on TS changes

## Code Style Guidelines

### Language & Types
- **TypeScript (ESM)** with strict mode - Node ≥22 required
- Use `interface` for object shapes, `type` for unions/primitives
- Avoid `any` and implicit any - use `unknown` for untyped data
- Prefer utility types: `Pick<T, K>`, `Partial<T>`, `Omit<T, K>`, `Record<K, V>`, `ReturnType<T>`
- Type guards: `const isFoo = (x: unknown): x is Foo => ...`
- Async functions always return promises, no callback patterns

### Imports
- Named imports preferred: `import { foo } from 'module'` over `import * as bar`
- Type-only imports: `import type { Foo } from 'module'` for types only
- Group imports: external dependencies first, then internal modules (`src/...`), then relative imports
- Node built-ins: use `node:` prefix: `import fs from "node:fs"`

### Formatting (Oxfmt)
- Indentation: 2 spaces, no tabs
- Semicolons: required
- Quotes: single quotes, use double for JSX or strings containing single quotes
- Trailing commas: required in multi-line arrays/objects/functions
- Line length: ~100-120 characters soft limit
- Max file lines: aim under 500 LOC, run `pnpm check:loc` to verify

### Naming Conventions
- **PascalCase**: Classes, interfaces, types, enums, React components
- **camelCase**: variables, functions, methods, properties, object keys
- **UPPER_SNAKE_CASE**: immutable constants, environment variables
- **kebab-case**: file names, folder names (except component dirs can use PascalCase)
- Private class members: underscore prefix (`_privateMethod`)
- Boolean getters: `get isValid()` (not `get valid()`)
- Event handlers: `handleXxx` (button click, form submit), `onXxx` (props)

### Error Handling
- Prefer async/await with try/catch over promise chaining
- Define typed error classes: `class MyError extends Error { constructor(...) }`
- Always log errors with context: relevant variables, operation being performed
- Never silently swallow errors - at minimum, console.error or throw wrapped error
- Use `throw new Error(...)` with descriptive messages

### Comments & Documentation
- JSDoc for public APIs: `/** @param foo - The foo value */ `
- Brief inline comments for non-obvious logic or workarounds
- TODO comments should include issue reference when possible

## Test Organization

- Unit tests: colocated `*.test.ts` next to source file in `src/`
- E2E tests: `*.e2e.test.ts` naming convention
- Live tests: `*.live.test.ts` (requires real API keys)
- Test config files: `vitest.config.ts` (unit), `vitest.e2e.config.ts`, `vitest.live.config.ts`
- Setup: `test/setup.ts` runs before all test suites

## Project Structure

- `src/` - Main source code (CLI, commands, gateway, agents, channels)
- `test/` - Test utilities, fixtures, setup files
- `dist/` - Compiled output (not committed to git)
- `extensions/` - Plugin packages (workspace packages)
- `apps/` - Native applications (iOS, Android, macOS)
- `ui/` - Web UI (React/Vite)
- `scripts/` - Build and utility scripts

## Important Notes

- Package manager: **pnpm 10.23.0** required
- TypeScript: strict mode enabled in tsconfig.json
- Oxlint plugins: unicorn, typescript, oxc (correctness category as error)
- Don't create files for one-time operations or hypothetical future requirements
- Three similar lines of code is better than a premature abstraction
- Only add features explicitly requested; avoid "helpful" improvements
