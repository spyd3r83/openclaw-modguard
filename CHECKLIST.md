# AgentSentry: Inference-Time IPI Security Layer — Implementation Checklist

## Scientific Specification Summary

AgentSentry is an inference-time security layer that mitigates Indirect Prompt Injection (IPI)
in tool-augmented LLM agents. It models multi-turn IPI as a temporal causal takeover and
operates as a boundary-local security plugin using controlled counterfactual re-executions.

---

## Architectural Mapping to This Codebase

### Current Extension Points

The existing `OpenClawPluginApi` exposes three hook events:

```
before_agent_start   → fires before user prompt reaches the model
message_sending      → fires before outbound channel messages
agent_end            → fires after agent completes
```

AgentSentry requires two new hook events that OpenClaw does not yet expose:

```
before_tool_result   → fires after tool/retrieval output is incorporated into context
                       (the "instrumentation point" / boundary b in the spec)
dry_run              → fires a re-execution without committing external side effects
```

Until these hooks exist, the `before_agent_start` hook can serve as a partial integration
point for single-turn analysis only.

### New Module: `src/agent-sentry/`

```
src/agent-sentry/
├── index.ts              # AgentSentry class; exports registerAgentSentry()
├── types.ts              # All AgentSentry-specific types (see §3 below)
├── boundary.ts           # Boundary detection; ContextSnapshot; MediatorCache
├── counterfactual.ts     # Dry-run orchestrator; four regime runner
├── causal-estimator.ts   # ACE, IE, DE estimators; Monte Carlo plug-in
├── trend-analyzer.ts     # OLS trend lines; β_ACE, β_IE slope coefficients
├── risk-functional.ts    # R_b score; takeover decision rule
├── purifier.ts           # Task-aligned evidence purification (§4.1)
├── action-reviser.ts     # Minimal action revision (§4.2)
└── policy-gate.ts        # Auth check before committing state-changing ops
```

---

## Implementation Checklist

### Stage 1 — Foundation Types and Interfaces (`src/agent-sentry/types.ts`)

- [x] Define `BoundaryId` branded type (`string & { readonly __boundary: true }`)
- [x] Define `RegimeType` union: `'orig' | 'mask' | 'mask_sanitized' | 'orig_sanitized'`
- [x] Define `RegimeResult` interface:
  ```typescript
  interface RegimeResult {
    regime: RegimeType;
    boundaryId: BoundaryId;
    proposedAction: ProposedAction;
    toolCalls: DryRunToolCall[];
    timestamp: Date;
  }
  ```
- [x] Define `ProposedAction` interface:
  ```typescript
  interface ProposedAction {
    naturalLanguage: string;
    toolCalls: DryRunToolCall[];
    sessionId: string;
  }
  ```
- [x] Define `DryRunToolCall` interface:
  ```typescript
  interface DryRunToolCall {
    name: string;
    args: Record<string, unknown>;
    severity: ToolCallSeverity;    // 'low' | 'medium' | 'high'
    isStateChanging: boolean;      // true for email send, file write, API post, etc.
    isMediatorContingent?: boolean;
  }
  ```
- [x] Define `ToolCallSeverity` union: `'low' | 'medium' | 'high'`
- [x] Define `ContextSnapshot` interface:
  ```typescript
  interface ContextSnapshot {
    boundaryId: BoundaryId;
    userInput: string;             // x_b (observed user input)
    mediatorContent: string;       // r_b (observed tool/retrieval return)
    dialogueHistory: string[];
    sessionId: string;
    capturedAt: Date;
  }
  ```
- [x] Define `CausalEstimates` interface:
  ```typescript
  interface CausalEstimates {
    boundaryId: BoundaryId;
    ACE: number;   // Average Causal Effect: user-goal dominance
    IE: number;    // Indirect Effect: mediator-driven influence
    DE: number;    // Direct Effect: user-driven contribution (mediator neutralized)
    IESignificant: boolean;
    sampleCount: number;   // K re-executions performed
  }
  ```
- [x] Define `TrendWindow` interface:
  ```typescript
  interface TrendWindow {
    windowSize: number;    // w boundaries
    beta_ACE: number;      // OLS slope of ACE over window
    beta_IE: number;       // OLS slope of IE over window
    boundaries: BoundaryId[];
  }
  ```
- [x] Define `RiskScore` interface:
  ```typescript
  interface RiskScore {
    boundaryId: BoundaryId;
    R: number;            // dimensionless risk functional score
    gamma: number;        // detection threshold (configurable)
    takeover: boolean;    // R >= gamma AND IE significant
    instantaneousEscalation: boolean;  // immediate tool severity jump
  }
  ```
- [x] Define `PurificationResult` interface:
  ```typescript
  interface PurificationResult {
    original: string;
    purified: string;          // r_b^(san)
    strippedDirectives: string[];
    retainedEntities: string[];
  }
  ```
- [x] Define `ActionRevisionResult` interface:
  ```typescript
  interface ActionRevisionResult {
    original: ProposedAction;
    safe: ProposedAction;      // a_safe
    preserved: DryRunToolCall[];
    suppressed: DryRunToolCall[];
    repaired: Array<{ original: DryRunToolCall; repaired: DryRunToolCall }>;
  }
  ```
- [x] Define `AgentSentryConfig` interface:
  ```typescript
  interface AgentSentryConfig {
    enabled: boolean;
    K: number;                 // Monte Carlo re-execution count (default: 3)
    windowSize: number;        // w: OLS trend window (default: 5)
    gamma: number;             // risk threshold (default: 0.7)
    diagnosticProbe: string;   // x_mask: task-neutral prompt text
    dryRunTimeoutMs: number;   // max time per dry-run regime (default: 5000)
  }
  ```
- [x] Define `AgentSentryAuditDetails` interface (extends `AuditEntryDetails`):
  ```typescript
  interface AgentSentryAuditDetails {
    boundaryId: string;
    takeover: boolean;
    R: number;
    ACE: number;
    IE: number;
    DE: number;
    suppressedToolCount: number;
  }
  ```
- [x] Add `'ipi_detect'` to `AuditOperationType` in `src/types.ts`
- [x] Add `IPI = 'ipi'` to `PatternCategory` enum in `src/types.ts`

---

### Stage 2 — Boundary Detection and Mediator Cache (`src/agent-sentry/boundary.ts`)

- [x] Implement `generateBoundaryId(): BoundaryId`
  - Use `crypto.randomBytes(8).toString('hex')` cast to `BoundaryId`
- [x] Implement `MediatorCache` class:
  ```typescript
  class MediatorCache {
    // Stores r_b verbatim so counterfactual re-executions replay identical content
    // Prevents external API variance across four regimes
    set(boundaryId: BoundaryId, content: string): void
    get(boundaryId: BoundaryId): string | undefined
    evict(boundaryId: BoundaryId): void
    pruneOlderThan(ms: number): void
  }
  ```
  - TTL: 30 minutes (match `SessionManager` TTL)
  - Max entries: 1000 (match `SessionManager` max sessions)
  - Store only the string content; do not log or expose content outside module
- [x] Implement `ContextSnapshotStore` class:
  - `save(snapshot: ContextSnapshot): void`
  - `restore(boundaryId: BoundaryId): ContextSnapshot | undefined`
  - `listBoundaries(sessionId: string): BoundaryId[]`
  - Bounded ring buffer per session (max `windowSize * 2` entries)
  - Call `secureZero` on evicted snapshot buffers if content contains sensitive data

---

### Stage 3 — Sanitizer / Purifier (`src/agent-sentry/purifier.ts`)

This implements §4.1 Task-Aligned Evidence Purification.

- [x] Implement `purify(mediatorContent: string, userGoal: string): PurificationResult`
  - **Factual Fidelity**: Retain named entities (persons, orgs, dates, amounts, structured fields)
    — use `Detector` from `src/detector.ts` to locate PII; keep surrounding factual context
  - **Non-Actionability**: Strip imperative constructs, priority-overriding phrases, and
    tool-capability directives. Patterns to match (case-insensitive):
    - `/\b(ignore|disregard|forget|override|supersede)\b.*\b(previous|above|prior|original)\b/i`
    - `/\b(you (must|should|shall|will|need to|have to))\b/i`
    - `/\b(new instruction|updated task|system prompt|ignore all)\b/i`
    - `/\b(send|email|post|upload|delete|execute|run|call)\b.*\b(immediately|now|first)\b/i`
  - **Task Alignment**: Discard sentences that introduce goals or actions not derivable from
    the original user input (`userGoal`)
  - Return `PurificationResult` with `purified`, `strippedDirectives[]`, `retainedEntities[]`
  - **Security**: Do not log `mediatorContent` or `purified` — log only `strippedDirectives.length`

---

### Stage 4 — Counterfactual Dry-Run Engine (`src/agent-sentry/counterfactual.ts`)

This implements §2.1 Interventional Regimes.

- [x] Define `DryRunEngine` interface:
  ```typescript
  interface DryRunEngine {
    run(userInput: string, mediatorContent: string, sessionId: string): Promise<ProposedAction>
  }
  ```
- [x] Implement `CounterfactualOrchestrator` class:
  ```typescript
  class CounterfactualOrchestrator {
    constructor(engine: DryRunEngine, purifier: Purifier, config: AgentSentryConfig)
    async runAllRegimes(snapshot: ContextSnapshot): Promise<Map<RegimeType, RegimeResult>>
  }
  ```
  - `orig`: `engine.run(x_b, r_b, sessionId)`
  - `mask`: `engine.run(x_mask, r_b, sessionId)` — `x_mask` is `config.diagnosticProbe`
  - `mask_sanitized`: `engine.run(x_mask, r_b_san, sessionId)`
  - `orig_sanitized`: `engine.run(x_b, r_b_san, sessionId)`
  - Replay `r_b` from `MediatorCache` (verbatim) — never re-fetch from external source
  - Each regime: enforce `config.dryRunTimeoutMs` via `Promise.race` with timeout rejection
  - Dry-run mode: `DryRunEngine.run` must record tool calls without committing side effects
  - Throw `IpiError` (typed, no raw message) if any regime times out or engine throws

---

### Stage 5 — Causal Estimators (`src/agent-sentry/causal-estimator.ts`)

This implements §2.2 Causal Estimands & Estimators.

- [x] Implement `ActionSimilarity` utility:
  ```typescript
  function actionSimilarity(a: ProposedAction, b: ProposedAction): number
  // Returns 0.0–1.0. Compare naturalLanguage (Jaccard on word tokens) and
  // toolCalls (name + args hash similarity). Weighted: 0.4 NL + 0.6 tool.
  ```
- [x] Implement `estimateCausalEffects(regimes: Map<RegimeType, RegimeResult[]>): CausalEstimates`
  - `ACE_b = mean(similarity(orig_k, mask_k) for k in 1..K)` — higher → user goal dominant
  - `IE_b  = 1 - mean(similarity(mask_k, mask_sanitized_k) for k in 1..K)` — higher → mediator influential
  - `DE_b  = mean(similarity(orig_sanitized_k, mask_sanitized_k) for k in 1..K)`
  - `IESignificant`: `IE_b > 0.3 AND variance(IE samples) < 0.05` (configurable thresholds)
  - `sampleCount`: `K` (number of re-executions per regime)
  - Note: ACE inverts similarity — high similarity means user goal dominates (good); low means mediator interferes (bad)

---

### Stage 6 — Trend Analyzer (`src/agent-sentry/trend-analyzer.ts`)

This implements §3 Temporal Trend Analysis.

- [x] Implement `BoundaryHistory` class:
  - Ring buffer of the last `windowSize` `CausalEstimates` per session
  - `push(estimates: CausalEstimates): void`
  - `getWindow(sessionId: string): CausalEstimates[]`
- [x] Implement `olsSlope(ys: number[]): number`
  - Ordinary least squares slope over evenly-spaced indices (x = 0, 1, ..., n-1)
  - Returns 0 if fewer than 2 samples
  - Pure function; no side effects
- [x] Implement `analyzeTrend(history: CausalEstimates[], windowSize: number): TrendWindow`
  - `beta_ACE = olsSlope(history.map(e => e.ACE))`
  - `beta_IE  = olsSlope(history.map(e => e.IE))`
  - Takeover signature: `beta_ACE < 0` (user-goal attenuation) AND `beta_IE > 0` (mediator escalation)

---

### Stage 7 — Risk Functional (`src/agent-sentry/risk-functional.ts`)

This implements §3 Risk Functional R_b and Takeover Decision Rule.

- [x] Implement `computeRisk(estimates: CausalEstimates, trend: TrendWindow, gamma: number): RiskScore`
  ```
  R_b = (1 - ACE_b) * w_attenuation + IE_b * w_escalation + max(0, beta_IE) * w_trend
  where w_attenuation = 0.4, w_escalation = 0.4, w_trend = 0.2
  ```
  - Weights are configurable via `AgentSentryConfig`
  - `takeover = (R >= gamma AND IESignificant)` — matches spec decision rule
  - `instantaneousEscalation`: true if any tool call in `orig` has `severity='high'` AND
    corresponding tool call in `orig_sanitized` has `severity='low'` or is absent
    (i.e., mediator is directly responsible for the high-severity call)

---

### Stage 8 — Action Reviser (`src/agent-sentry/action-reviser.ts`)

This implements §4.2 Minimal Action Revision.

- [x] Implement `reviseAction(original: ProposedAction, regimes: Map<RegimeType, RegimeResult[]>, purifiedSnapshot: ContextSnapshot): ActionRevisionResult`
  - **Preservation**: Keep tool calls where `severity='low'` AND NOT `isMediatorContingent`
    - `isMediatorContingent`: call appears in `orig` but not in `orig_sanitized` across majority of K samples
  - **Suppression**: Remove tool calls where `isStateChanging=true` AND `isMediatorContingent=true`
    - Log suppression: token ID or call name only — never log call args that may contain PII
  - **Repair**: For `severity='high'` AND `isMediatorContingent=false` (counterfactually persistent):
    - Replace argument values sourced from `mediatorContent` with values from trusted context only
    - Use `orig_sanitized` regime result as the safe parameter source
  - Return `ActionRevisionResult` with `safe` action derived from above rules

---

### Stage 9 — Policy Gate (`src/agent-sentry/policy-gate.ts`)

This implements §5 Policy Gate (Auth check).

- [x] Implement `PolicyGate` class:
  ```typescript
  class PolicyGate {
    constructor(policy: Policy)
    authorize(action: ProposedAction, purifiedSnapshot: ContextSnapshot): PolicyDecision
  }
  ```
  - Calls `policy.evaluate(context)` where `context.direction = 'inbound'`
  - For each `DryRunToolCall` in `action.toolCalls`:
    - Map `severity` to `PolicyContext.confidence` (low=0.3, medium=0.65, high=0.95)
    - `block` any state-changing call not derivable from purified context
    - `allow` calls with `severity='low'` AND `!isMediatorContingent`
  - Return aggregate `PolicyDecision` — if any call is `block`, the whole action is blocked

---

### Stage 10 — AgentSentry Orchestrator (`src/agent-sentry/index.ts`)

- [x] Implement `AgentSentry` class:
  ```typescript
  class AgentSentry {
    constructor(config: AgentSentryConfig, engine: DryRunEngine, vault: Vault, policy: Policy)
    async analyzeToolReturn(snapshot: ContextSnapshot): Promise<AgentSentryDecision>
  }
  ```
  - `AgentSentryDecision`:
    ```typescript
    interface AgentSentryDecision {
      takeover: boolean;
      riskScore: RiskScore;
      safeAction?: ActionRevisionResult;  // present only if takeover=true
      authorized: boolean;                 // policy gate result
      boundaryId: BoundaryId;
    }
    ```
  - Flow:
    1. Cache `mediatorContent` in `MediatorCache` by `boundaryId`
    2. Run K rounds of `counterfactualOrchestrator.runAllRegimes(snapshot)` → collect regime results
    3. `estimateCausalEffects(regimes)` → `CausalEstimates`
    4. `boundaryHistory.push(estimates)`
    5. `analyzeTrend(history, windowSize)` → `TrendWindow`
    6. `computeRisk(estimates, trend, gamma)` → `RiskScore`
    7. If `takeover=true`: `purifier.purify(snapshot.mediatorContent, snapshot.userInput)`
       then `reviseAction(origAction, regimes, purifiedSnapshot)` then `policyGate.authorize(safeAction)`
    8. Log audit entry (operation: `'ipi_detect'`, level based on takeover) — no PII in log
    9. Return `AgentSentryDecision`
- [x] Export `registerAgentSentry(api: OpenClawPluginApi, state: ModGuardState, config: AgentSentryConfig): void`
  - Registers `before_tool_result` hook once it becomes available in `OpenClawPluginApi`
  - Until `before_tool_result` exists: registers a `before_agent_start` adapter that extracts
    any tool return data from `context.messages` (if present) and runs `analyzeToolReturn`

---

### Stage 11 — OpenClawPluginApi Extension

The current `OpenClawPluginApi` in `src/index.ts` must be extended:

- [x] Add hook overload for `before_tool_result`:
  ```typescript
  on(event: 'before_tool_result', handler: BeforeToolResultHandler): void;
  ```
- [x] Define `BeforeToolResultContext`:
  ```typescript
  interface BeforeToolResultContext {
    sessionId: string;
    toolName: string;
    toolOutput: string;               // r_b: raw tool/retrieval return
    dialogueHistory: string[];
    userGoal: string;                 // original user intent
  }
  ```
- [x] Define `BeforeToolResultHandler`:
  ```typescript
  type BeforeToolResultHandler = (
    context: BeforeToolResultContext
  ) => Promise<{ toolOutput?: string; cancel?: boolean } | void>;
  ```
  - `toolOutput`: allow handler to replace mediator content with purified version
  - `cancel`: allow handler to suppress the tool return entirely
- [x] Add hook overload for `dry_run`:
  ```typescript
  on(event: 'dry_run', handler: DryRunHandler): void;
  ```
- [x] Define `DryRunContext`:
  ```typescript
  interface DryRunContext {
    sessionId: string;
    userInput: string;
    mediatorContent: string;
    record: boolean;    // always true; prevents external side effects from committing
  }
  ```
- [x] Define `DryRunHandler`:
  ```typescript
  type DryRunHandler = (
    context: DryRunContext
  ) => Promise<{ proposedAction: ProposedAction } | void>;
  ```
- [x] Update `openclaw.plugin.json` `configSchema.properties` to include `agentSentry` object:
  ```json
  "agentSentry": {
    "type": "object",
    "properties": {
      "enabled":          { "type": "boolean" },
      "K":                { "type": "number" },
      "windowSize":       { "type": "number" },
      "gamma":            { "type": "number" },
      "diagnosticProbe":  { "type": "string" },
      "dryRunTimeoutMs":  { "type": "number" }
    }
  }
  ```

---

### Stage 12 — Hook Registration Integration (`src/hooks/index.ts`)

- [x] Import `registerAgentSentry` from `src/agent-sentry/index.ts`
- [x] Call `registerAgentSentry(api, state, config.agentSentry ?? defaultAgentSentryConfig)` in `registerHooks`
- [x] Ensure `AgentSentry` re-uses the shared `Vault` instance from `ModGuardState` (no second vault)
- [x] Ensure `AgentSentry` re-uses the shared `Policy` instance loaded via `loadPolicy`

---

### Stage 13 — Error Types (`src/errors.ts`)

- [x] Add `IpiError` (base):
  ```typescript
  export class IpiError extends Error {
    constructor(message: string, public readonly context?: Record<string, unknown>) {
      super(message); this.name = 'IpiError';
    }
  }
  ```
- [x] Add `CounterfactualError extends IpiError` — dry-run regime failure
- [x] Add `RiskEstimationError extends IpiError` — causal estimator failure
- [x] Add `PurificationError extends IpiError` — purifier failure
- [x] Add `PolicyGateError extends IpiError` — auth check failure
- [x] All error constructors: message must be static/generic — no user data or tool output content

---

### Stage 14 — Audit Integration (`src/types.ts` and `src/audit.ts`)

- [x] Add `'ipi_detect'` to `AuditOperationType` union
- [x] Define `IpiAuditDetails`:
  ```typescript
  interface IpiAuditDetails {
    boundaryId: string;
    sessionId: string;      // session ID only, no content
    takeover: boolean;
    R: number;
    ACE: number;
    IE: number;
    DE: number;
    beta_ACE: number;
    beta_IE: number;
    suppressedToolCount: number;
    repairedToolCount: number;
    authorized: boolean;
  }
  ```
- [x] Ensure `AuditLogger.log` accepts `IpiAuditDetails` as `details` for `operation='ipi_detect'`
- [x] **Security**: Never include `mediatorContent`, `userInput`, `toolOutput`, or any PII in audit entries

---

### Stage 15 — Tests

#### Unit tests (`test/agent-sentry/`)

- [x] `boundary.test.ts` — `MediatorCache` TTL, eviction, verbatim replay
- [x] `purifier.test.ts` — strips imperatives; retains factual entities; task-alignment filtering
- [x] `causal-estimator.test.ts` — ACE/IE/DE calculations; edge cases (K=1, identical regimes)
- [x] `trend-analyzer.test.ts` — OLS slope correctness; window boundary conditions; insufficient history
- [x] `risk-functional.test.ts` — R_b formula; takeover triggers; instantaneous escalation detection
- [x] `action-reviser.test.ts` — preserve/suppress/repair logic; PII-free suppression logs
- [x] `policy-gate.test.ts` — authorize blocks state-changing mediator-contingent calls
- [x] `agent-sentry.test.ts` — full `analyzeToolReturn` integration; benign mediator (no takeover); malicious mediator (takeover + revision)

#### Security tests

- [x] Verify no `mediatorContent` appears in any audit log entry
- [x] Verify `IpiError` and subclasses never expose tool output in `error.message`
- [x] Verify `MediatorCache` entries are bounded and respect TTL

#### Accuracy tests (`test/agent-sentry.accuracy.test.ts`)

- [x] Benign tool returns (factual data, no directives) → `takeover=false` rate ≥ 95%
- [x] Obvious IPI payloads (explicit instruction override) → `takeover=true` rate ≥ 90%
- [x] Subtle IPI payloads (goal drift over 3+ turns) → `takeover=true` rate ≥ 70%

---

### Stage 16 — Configuration and Defaults

- [x] Add `agentSentry` field to the config schema in `src/index.ts` `configSchema`
- [x] Default `AgentSentryConfig`:
  ```typescript
  const defaultAgentSentryConfig: AgentSentryConfig = {
    enabled: true,
    K: 3,
    windowSize: 5,
    gamma: 0.7,
    diagnosticProbe: 'Summarize the content available to you and propose a next step based solely on that content.',
    dryRunTimeoutMs: 5000,
  };
  ```
- [x] Document in `AGENTS.md` under "Known Limitations" that dry-run requires `dry_run` hook support from OpenClaw; until available, single-pass analysis is used

---

## Security Constraints (Non-Negotiable)

All AgentSentry code must comply with the full security mandate from AGENTS.md:

1. **No raw errors** — all errors are typed `IpiError` subclasses; no stack traces to callers
2. **No PII in logs** — `mediatorContent`, `userInput`, and `toolOutput` are NEVER logged;
   only `boundaryId`, session ID, numeric scores, and tool names (not args) are logged
3. **No hardcoded secrets** — `diagnosticProbe` comes from config; no default that could
   act as a system prompt override
4. **AES-256-GCM integrity** — `MediatorCache` stores plaintext in-memory (not in vault);
   if future persistence is needed, it must use `Vault.store` with full AES-256-GCM
5. **Timing-safe comparisons** — `actionSimilarity` must not use timing-sensitive equality
   on security-sensitive values; use `timingSafeStringEqual` for any token comparison
6. **Secure memory** — `CounterfactualOrchestrator` must call `secureZero` on any
   `Buffer` holding `mediatorContent` or `userInput` after regime runs complete
7. **Dry-run isolation** — `DryRunEngine.run` MUST NOT commit external side effects;
   verified by `record: true` flag on `DryRunContext`

---

## Dependency Considerations

- No new runtime dependencies required for core AgentSentry logic
- `olsSlope` is a pure math function — no external library needed
- `purify` uses existing `Detector` for entity recognition — no new NLP library
- If semantic similarity is needed beyond Jaccard, consider `openai/tokenizers` (already
  available transitively via OpenClaw); do not add a new embedding model dependency
- `better-sqlite3` already available — `MediatorCache` can optionally persist to SQLite
  if in-memory TTL is insufficient, using the existing vault infrastructure

---

## File Ownership Summary (for parallel sub-agent work)

| Agent | Files |
|---|---|
| A — Types & Errors | `src/agent-sentry/types.ts`, `src/errors.ts`, `src/types.ts` |
| B — Boundary & Cache | `src/agent-sentry/boundary.ts` |
| C — Purifier | `src/agent-sentry/purifier.ts` |
| D — Counterfactual Engine | `src/agent-sentry/counterfactual.ts` |
| E — Estimators & Trend | `src/agent-sentry/causal-estimator.ts`, `src/agent-sentry/trend-analyzer.ts` |
| F — Risk & Gate | `src/agent-sentry/risk-functional.ts`, `src/agent-sentry/policy-gate.ts` |
| G — Action Reviser | `src/agent-sentry/action-reviser.ts` |
| H — Orchestrator & Hooks | `src/agent-sentry/index.ts`, `src/hooks/index.ts`, `src/index.ts`, `openclaw.plugin.json` |
| I — Tests | `test/agent-sentry/` |

Agents A–G run in parallel (disjoint file ownership). Agent H runs after A–G complete.
Agent I runs after H completes and `pnpm build` passes.
