import type { Vault } from '../vault.js';
import type { Policy } from '../policy.js';
import { AuditLogger } from '../audit.js';
import { generateBoundaryId, MediatorCache, ContextSnapshotStore } from './boundary.js';
import { Purifier } from './purifier.js';
import { CounterfactualOrchestrator } from './counterfactual.js';
import type { DryRunEngine } from './counterfactual.js';
import { estimateCausalEffects } from './causal-estimator.js';
import { BoundaryHistory, analyzeTrend } from './trend-analyzer.js';
import { computeRisk } from './risk-functional.js';
import { PolicyGate } from './policy-gate.js';
import { reviseAction } from './action-reviser.js';
import { IpiError } from '../errors.js';
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

/**
 * Register AgentSentry hooks with the OpenClaw plugin API.
 * Uses before_agent_start as an adapter until before_tool_result is available.
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

  // Adapter: before_agent_start intercepts messages that contain tool return content.
  // Full integration requires before_tool_result hook (not yet in OpenClaw).
  api.on('before_agent_start', async (ctx: unknown) => {
    const context = ctx as { prompt?: string; messages?: unknown[]; sessionId?: string };

    // Only run if there are messages (indicating a multi-turn conversation with tool returns)
    if (!context.messages || context.messages.length === 0) return;

    const boundaryId = generateBoundaryId();
    const sessionId = context.sessionId ?? 'unknown';

    // Extract any tool return content from messages
    const toolMessages = (context.messages as Array<{ role?: string; content?: string }>)
      .filter(m => m.role === 'tool' && typeof m.content === 'string');

    if (toolMessages.length === 0) return;

    // Analyze the last tool return
    const lastToolMsg = toolMessages[toolMessages.length - 1];
    if (!lastToolMsg.content) return;

    const snapshot: ContextSnapshot = {
      boundaryId,
      userInput: context.prompt ?? '',
      mediatorContent: lastToolMsg.content,
      dialogueHistory: [],
      sessionId,
      capturedAt: new Date(),
    };

    try {
      const decision = await agentSentry.analyzeToolReturn(snapshot);
      if (decision.takeover) {
        // Log only — do not modify prompt in before_agent_start (limitation of hook)
        api.logger.warn(`AgentSentry: IPI takeover detected (R=${decision.riskScore.R.toFixed(3)}, boundaryId=${boundaryId})`);
      }
    } catch (err) {
      if (err instanceof IpiError) {
        api.logger.error(`AgentSentry analysis failed: ${err.name}`);
      } else {
        api.logger.error('AgentSentry analysis failed');
      }
    }
  });

  api.logger.info('AgentSentry registered (before_agent_start adapter mode)');
}
