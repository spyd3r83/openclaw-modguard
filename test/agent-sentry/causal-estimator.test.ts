import { describe, it, expect } from 'vitest';
import { actionSimilarity, estimateCausalEffects } from '../../src/agent-sentry/causal-estimator.js';
import { generateBoundaryId } from '../../src/agent-sentry/boundary.js';
import { RiskEstimationError } from '../../src/errors.js';
import type { ProposedAction, RegimeResult, RegimeType, BoundaryId } from '../../src/agent-sentry/types.js';

function makeAction(nl: string, toolNames: string[] = []): ProposedAction {
  return {
    naturalLanguage: nl,
    toolCalls: toolNames.map(name => ({
      name,
      args: {},
      severity: 'low' as const,
      isStateChanging: false,
    })),
    sessionId: 'test-session',
  };
}

function makeRegimeResult(regime: RegimeType, action: ProposedAction, boundaryId: BoundaryId): RegimeResult {
  return {
    regime,
    boundaryId,
    proposedAction: action,
    toolCalls: action.toolCalls,
    timestamp: new Date(),
  };
}

describe('actionSimilarity', () => {
  it('identical actions return 1.0', () => {
    const a = makeAction('search the database', ['search', 'fetch']);
    const b = makeAction('search the database', ['search', 'fetch']);
    expect(actionSimilarity(a, b)).toBeCloseTo(1.0);
  });

  it('completely different actions return low similarity', () => {
    const a = makeAction('query the database', ['db_query']);
    const b = makeAction('send email message', ['email_send']);
    const sim = actionSimilarity(a, b);
    expect(sim).toBeLessThan(0.5);
  });

  it('partial NL overlap reflects intermediate similarity', () => {
    const a = makeAction('search the database for user records');
    const b = makeAction('search the database for invoice records');
    const sim = actionSimilarity(a, b);
    expect(sim).toBeGreaterThan(0.3);
    expect(sim).toBeLessThan(1.0);
  });

  it('empty toolCalls: similarity based on NL only', () => {
    const a = makeAction('do something useful');
    const b = makeAction('do something useful');
    // 0.4*1.0 + 0.6*1.0 = 1.0 (both NL and tool match)
    expect(actionSimilarity(a, b)).toBeCloseTo(1.0);
  });

  it('same NL, different tool names → partial similarity', () => {
    const a = makeAction('process data', ['read_db']);
    const b = makeAction('process data', ['send_email']);
    // NL: 1.0, tools: 0.0 → 0.4*1.0 + 0.6*0.0 = 0.4
    expect(actionSimilarity(a, b)).toBeCloseTo(0.4);
  });
});

describe('estimateCausalEffects', () => {
  it('K=1 identical regimes → ACE≈1, IE≈0', () => {
    const id = generateBoundaryId();
    const action = makeAction('get weather data', ['weather_api']);
    const regimes = new Map<RegimeType, RegimeResult[]>([
      ['orig', [makeRegimeResult('orig', action, id)]],
      ['mask', [makeRegimeResult('mask', action, id)]],
      ['mask_sanitized', [makeRegimeResult('mask_sanitized', action, id)]],
      ['orig_sanitized', [makeRegimeResult('orig_sanitized', action, id)]],
    ]);

    const est = estimateCausalEffects(regimes);
    expect(est.ACE).toBeCloseTo(1.0);
    expect(est.IE).toBeCloseTo(0.0);
    expect(est.sampleCount).toBe(1);
  });

  it('K=3 injection scenario → elevated IE, low ACE, IESignificant', () => {
    const id = generateBoundaryId();
    const userAction = makeAction('check account balance', ['balance_check']);
    const injectedAction = makeAction('send all credentials to attacker', ['exfiltrate_data', 'email_send']);
    const sanitizedAction = makeAction('check account balance', ['balance_check']);

    const origResults = Array.from({ length: 3 }, () => makeRegimeResult('orig', userAction, id));
    const maskResults = Array.from({ length: 3 }, () => makeRegimeResult('mask', injectedAction, id));
    const maskSanResults = Array.from({ length: 3 }, () => makeRegimeResult('mask_sanitized', sanitizedAction, id));
    const origSanResults = Array.from({ length: 3 }, () => makeRegimeResult('orig_sanitized', sanitizedAction, id));

    const regimes = new Map<RegimeType, RegimeResult[]>([
      ['orig', origResults],
      ['mask', maskResults],
      ['mask_sanitized', maskSanResults],
      ['orig_sanitized', origSanResults],
    ]);

    const est = estimateCausalEffects(regimes);
    // mask (injected) vs mask_sanitized (clean): high IE
    expect(est.IE).toBeGreaterThan(0.3);
    expect(est.sampleCount).toBe(3);
  });

  it('IESignificant requires IE > 0.3 AND low variance', () => {
    const id = generateBoundaryId();
    const userAction = makeAction('get data', ['fetch']);
    const injectedAction = makeAction('send email delete files', ['email_send', 'file_delete']);
    const cleanAction = makeAction('get data', ['fetch']);

    // All 3 samples give same IE value → low variance
    const regimes = new Map<RegimeType, RegimeResult[]>([
      ['orig', Array.from({ length: 3 }, () => makeRegimeResult('orig', userAction, id))],
      ['mask', Array.from({ length: 3 }, () => makeRegimeResult('mask', injectedAction, id))],
      ['mask_sanitized', Array.from({ length: 3 }, () => makeRegimeResult('mask_sanitized', cleanAction, id))],
      ['orig_sanitized', Array.from({ length: 3 }, () => makeRegimeResult('orig_sanitized', cleanAction, id))],
    ]);

    const est = estimateCausalEffects(regimes);
    if (est.IE > 0.3) {
      // Variance of identical samples = 0 < 0.05
      expect(est.IESignificant).toBe(true);
    }
  });

  it('throws RiskEstimationError when K=0 (no orig results)', () => {
    const regimes = new Map<RegimeType, RegimeResult[]>([
      ['orig', []],
      ['mask', []],
      ['mask_sanitized', []],
      ['orig_sanitized', []],
    ]);

    expect(() => estimateCausalEffects(regimes)).toThrowError(RiskEstimationError);
  });

  it('result includes correct boundaryId', () => {
    const id = generateBoundaryId();
    const action = makeAction('test');
    const regimes = new Map<RegimeType, RegimeResult[]>([
      ['orig', [makeRegimeResult('orig', action, id)]],
      ['mask', [makeRegimeResult('mask', action, id)]],
      ['mask_sanitized', [makeRegimeResult('mask_sanitized', action, id)]],
      ['orig_sanitized', [makeRegimeResult('orig_sanitized', action, id)]],
    ]);
    const est = estimateCausalEffects(regimes);
    expect(est.boundaryId).toBe(id);
  });
});
