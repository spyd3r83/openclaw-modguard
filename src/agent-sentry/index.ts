import type { Vault } from '../vault.js';
import type { Policy } from '../policy.js';
import { AuditLogger } from '../audit.js';
import { MediatorCache, ContextSnapshotStore } from './boundary.js';
import { Purifier } from './purifier.js';
import { CounterfactualOrchestrator } from './counterfactual.js';
import type { DryRunEngine } from './counterfactual.js';
import { estimateCausalEffects } from './causal-estimator.js';
import { BoundaryHistory, analyzeTrend } from './trend-analyzer.js';
import { computeRisk } from './risk-functional.js';
import { PolicyGate } from './policy-gate.js';
import { reviseAction } from './action-reviser.js';
import type {
  AgentSentryConfig,
  AgentSentryDecision,
  ContextSnapshot,
  RegimeResult,
  RegimeType,
} from './types.js';

export const defaultAgentSentryConfig: AgentSentryConfig = {
  enabled: true,
  K: 3,
  windowSize: 5,
  gamma: 0.7,
  diagnosticProbe: 'Summarize the content available to you and propose a next step based solely on that content.',
  dryRunTimeoutMs: 5000,
};

/**
 * AgentSentry: Inference-time IPI security layer.
 *
 * Analyzes tool returns for signs of indirect prompt injection using
 * causal counterfactual analysis across four intervention regimes.
 */
export class AgentSentry {
  private readonly purifier: Purifier;
  private readonly mediatorCache: MediatorCache;
  private readonly snapshotStore: ContextSnapshotStore;
  private readonly boundaryHistory: BoundaryHistory;
  private readonly orchestrator: CounterfactualOrchestrator;
  private readonly policyGate: PolicyGate;
  private readonly auditLogger: AuditLogger | null;

  constructor(
    private readonly config: AgentSentryConfig,
    engine: DryRunEngine,
    _vault: Vault,
    policy: Policy,
    auditLogger?: AuditLogger,
  ) {
    this.purifier = new Purifier();
    this.mediatorCache = new MediatorCache();
    this.snapshotStore = new ContextSnapshotStore(config.windowSize);
    this.boundaryHistory = new BoundaryHistory(config.windowSize);
    this.orchestrator = new CounterfactualOrchestrator(engine, this.purifier, this.mediatorCache, config);
    this.policyGate = new PolicyGate(policy);
    this.auditLogger = auditLogger ?? null;
  }

  async analyzeToolReturn(snapshot: ContextSnapshot): Promise<AgentSentryDecision> {
    if (!this.config.enabled) {
      return {
        takeover: false,
        riskScore: { boundaryId: snapshot.boundaryId, R: 0, gamma: this.config.gamma, takeover: false, instantaneousEscalation: false },
        authorized: true,
        boundaryId: snapshot.boundaryId,
      };
    }

    // Cache mediator content for verbatim replay across regimes
    this.mediatorCache.set(snapshot.boundaryId, snapshot.mediatorContent);
    this.snapshotStore.save(snapshot);

    // Run K rounds of all four regimes
    const allRegimes = new Map<RegimeType, RegimeResult[]>();
    for (let k = 0; k < this.config.K; k++) {
      const regimeMap = await this.orchestrator.runAllRegimes(snapshot);
      for (const [regime, result] of regimeMap) {
        const existing = allRegimes.get(regime) ?? [];
        existing.push(result);
        allRegimes.set(regime, existing);
      }
    }

    // Causal estimation
    const estimates = estimateCausalEffects(allRegimes);
    this.boundaryHistory.push(snapshot.sessionId, estimates);

    // Trend analysis
    const history = this.boundaryHistory.getWindow(snapshot.sessionId);
    const trend = analyzeTrend(history, this.config.windowSize);

    // Risk score
    const origRegimes = allRegimes.get('orig');
    const origSanRegimes = allRegimes.get('orig_sanitized');
    const riskScore = computeRisk(estimates, trend, this.config.gamma, origRegimes, origSanRegimes);

    let safeAction = undefined;
    let authorized = true;

    if (riskScore.takeover) {
      // Purify and revise action
      const origResult = allRegimes.get('orig')?.[0];
      if (origResult) {
        const revisionResult = reviseAction(origResult.proposedAction, allRegimes, snapshot);
        safeAction = revisionResult;

        // Policy gate on safe action
        const gateDecision = this.policyGate.authorize(revisionResult.safe, snapshot);
        authorized = gateDecision.authorized;
      }
    }

    // Audit log — no PII, no content; only boundaryId, sessionId, boolean flags, and numeric scores
    if (this.auditLogger) {
      await this.auditLogger.log({
        operation: 'ipi_detect',
        sessionId: snapshot.sessionId,
        level: riskScore.takeover ? 'warn' : 'info',
        success: true,
        details: {
          boundaryId: snapshot.boundaryId,
          sessionId: snapshot.sessionId,
          takeover: riskScore.takeover,
          R: riskScore.R,
          ACE: estimates.ACE,
          IE: estimates.IE,
          DE: estimates.DE,
          beta_ACE: trend.beta_ACE,
          beta_IE: trend.beta_IE,
          suppressedToolCount: safeAction?.suppressed.length ?? 0,
          repairedToolCount: safeAction?.repaired.length ?? 0,
          authorized,
        },
      });
    }

    return {
      takeover: riskScore.takeover,
      riskScore,
      safeAction,
      authorized,
      boundaryId: snapshot.boundaryId,
    };
  }
}

import { startToolResultAnalysis, awaitAnalysisForSession, clearPendingAnalysis } from '../hooks/tool-result-persist.js';
import type { AfterToolCallEvent } from '../hooks/tool-result-persist.js';

/**
 * Register AgentSentry hooks with the OpenClaw plugin API.
 *
 * Hook strategy:
 *   after_tool_call (async) — fires after each tool call completes. Checked
 *     lazily at call time (not pre-captured at session creation), so it fires
 *     correctly even in embedded agent worker subprocesses. Starts async IPI
 *     analysis, stores the pending promise keyed by sessionKey.
 *
 *   before_tool_call (async) — awaits the pending analysis (with timeout) and
 *     blocks the next tool call if takeover=true. This is the enforcement point:
 *     the model cannot act on injected content.
 *
 *   agent_end (cleanup) — clears pending analysis state for the session.
 *
 * No OpenClaw source patching is required for this integration — all three hooks
 * are natively supported in OpenClaw's plugin API.
 */
export function registerAgentSentry(
  api: {
    logger: { info(msg: string): void; warn(msg: string): void; error(msg: string): void };
    on(event: string, handler: (...args: unknown[]) => unknown): void;
  },
  agentSentry: AgentSentry,
  config: AgentSentryConfig,
): void {
  if (!config.enabled) {
    api.logger.info('AgentSentry disabled via config');
    return;
  }

  // ── after_tool_call (async) ───────────────────────────────────────────────
  // Fires after every tool call completes. Checked lazily at call time so it
  // reliably fires in embedded agent worker subprocesses. We start async IPI
  // analysis here and store the promise — enforcement happens in before_tool_call.
  api.on('after_tool_call', async (event: unknown, ctx: unknown) => {
    const e = event as AfterToolCallEvent;
    const context = ctx as { sessionKey?: string; agentId?: string };
    const sessionKey = context.sessionKey ?? context.agentId ?? 'unknown';

    startToolResultAnalysis(e, sessionKey, agentSentry, api.logger);
    // Return undefined — we do not block here.
    // Enforcement happens in before_tool_call.
  });

  // ── before_tool_call (async) ──────────────────────────────────────────────
  // Fires before each tool call the model tries to make. If the last tool result
  // was flagged as an IPI takeover, block this call to prevent acting on injected
  // instructions.
  api.on('before_tool_call', async (event: unknown, ctx: unknown) => {
    const context = ctx as { sessionKey?: string; agentId?: string; toolName?: string };
    const sessionKey = context.sessionKey ?? context.agentId ?? 'unknown';

    const result = await awaitAnalysisForSession(sessionKey);
    if (!result) return;  // no pending analysis

    if (result.takeover) {
      api.logger.warn(
        `AgentSentry: blocking tool call — IPI detected in prior tool result ` +
        `(R=${result.R.toFixed(3)}, tool=${result.toolName}, boundaryId=${result.boundaryId})`,
      );
      return {
        block: true,
        blockReason:
          'Tool call blocked: the previous tool result contained injection directives. ' +
          'The agent cannot proceed with this action.',
      };
    }
  });

  // ── agent_end (cleanup) ───────────────────────────────────────────────────
  api.on('agent_end', (_event: unknown, ctx: unknown) => {
    const context = ctx as { sessionKey?: string; agentId?: string };
    const sessionKey = context.sessionKey ?? context.agentId ?? 'unknown';
    clearPendingAnalysis(sessionKey);
  });

  api.logger.info('AgentSentry registered (after_tool_call + before_tool_call)');
}
