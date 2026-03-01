import { describe, it, expect } from 'vitest';
import { computeRisk } from '../../src/agent-sentry/risk-functional.js';
import { generateBoundaryId } from '../../src/agent-sentry/boundary.js';
import { RiskEstimationError } from '../../src/errors.js';
import type { CausalEstimates, TrendWindow, RegimeResult, BoundaryId } from '../../src/agent-sentry/types.js';

function makeEstimates(ACE: number, IE: number, IESignificant = false): CausalEstimates {
  return {
    boundaryId: generateBoundaryId(),
    ACE,
    IE,
    DE: 0,
    IESignificant,
    sampleCount: 3,
  };
}

function makeTrend(beta_ACE = 0, beta_IE = 0, boundaryId?: BoundaryId): TrendWindow {
  return {
    windowSize: 5,
    beta_ACE,
    beta_IE,
    boundaries: boundaryId ? [boundaryId] : [],
  };
}

function makeRegimeResult(toolNames: string[], severity: 'low' | 'medium' | 'high' = 'low'): RegimeResult {
  const action = {
    naturalLanguage: 'test action',
    toolCalls: toolNames.map(name => ({
      name,
      args: {},
      severity,
      isStateChanging: false,
    })),
    sessionId: 'test',
  };
  return {
    regime: 'orig',
    boundaryId: generateBoundaryId(),
    proposedAction: action,
    toolCalls: action.toolCalls,
    timestamp: new Date(),
  };
}

describe('computeRisk', () => {
  it('low risk scenario (high ACE, low IE) → R < 0.7, takeover=false', () => {
    const estimates = makeEstimates(0.95, 0.05, false);
    const trend = makeTrend(0.0, 0.0);
    const risk = computeRisk(estimates, trend, 0.7);

    // R = (1-0.95)*0.4 + 0.05*0.4 + 0*0.2 = 0.02 + 0.02 = 0.04
    expect(risk.R).toBeCloseTo(0.04);
    expect(risk.takeover).toBe(false);
  });

  it('high risk scenario (low ACE, high IE, positive beta_IE, IESignificant) → takeover=true', () => {
    const estimates = makeEstimates(0.1, 0.9, true);
    const trend = makeTrend(-0.2, 0.5);
    const risk = computeRisk(estimates, trend, 0.7);

    // R = (1-0.1)*0.4 + 0.9*0.4 + 0.5*0.2 = 0.36 + 0.36 + 0.10 = 0.82
    expect(risk.R).toBeCloseTo(0.82);
    expect(risk.R).toBeGreaterThanOrEqual(0.7);
    expect(risk.takeover).toBe(true);
  });

  it('high R but IESignificant=false → takeover=false', () => {
    const estimates = makeEstimates(0.1, 0.9, false); // IESignificant is false
    const trend = makeTrend(0, 0.5);
    const risk = computeRisk(estimates, trend, 0.7);
    expect(risk.R).toBeGreaterThan(0.7);
    expect(risk.takeover).toBe(false);
  });

  it('throws RiskEstimationError for gamma <= 0', () => {
    const estimates = makeEstimates(0.5, 0.5);
    const trend = makeTrend();
    expect(() => computeRisk(estimates, trend, 0)).toThrowError(RiskEstimationError);
    expect(() => computeRisk(estimates, trend, -0.1)).toThrowError(RiskEstimationError);
  });

  it('throws RiskEstimationError for gamma > 1', () => {
    const estimates = makeEstimates(0.5, 0.5);
    const trend = makeTrend();
    expect(() => computeRisk(estimates, trend, 1.1)).toThrowError(RiskEstimationError);
  });

  it('gamma=1.0 is valid (boundary)', () => {
    const estimates = makeEstimates(0.5, 0.5);
    const trend = makeTrend();
    expect(() => computeRisk(estimates, trend, 1.0)).not.toThrow();
  });

  it('verifies R formula: (1-ACE)*0.4 + IE*0.4 + max(0,beta_IE)*0.2', () => {
    const ACE = 0.6;
    const IE = 0.4;
    const beta_IE = 0.3;
    const estimates = makeEstimates(ACE, IE);
    const trend = makeTrend(0, beta_IE);
    const risk = computeRisk(estimates, trend, 0.7);

    const expected = (1 - ACE) * 0.4 + IE * 0.4 + Math.max(0, beta_IE) * 0.2;
    expect(risk.R).toBeCloseTo(expected);
  });

  it('negative beta_IE clamped to 0 in formula', () => {
    const estimates = makeEstimates(0.5, 0.5);
    const trend = makeTrend(0, -0.5); // negative beta_IE
    const risk = computeRisk(estimates, trend, 0.7);

    // max(0, -0.5) = 0, so R = (1-0.5)*0.4 + 0.5*0.4 + 0 = 0.4
    expect(risk.R).toBeCloseTo(0.4);
  });

  it('instantaneousEscalation: high-severity call absent from orig_sanitized → true', () => {
    const id = generateBoundaryId();
    const origResult = {
      regime: 'orig' as const,
      boundaryId: id,
      proposedAction: { naturalLanguage: 'test', toolCalls: [{ name: 'dangerous_op', args: {}, severity: 'high' as const, isStateChanging: true }], sessionId: 'test' },
      toolCalls: [{ name: 'dangerous_op', args: {}, severity: 'high' as const, isStateChanging: true }],
      timestamp: new Date(),
    };
    // orig_sanitized does NOT have 'dangerous_op'
    const origSanResult = {
      regime: 'orig_sanitized' as const,
      boundaryId: id,
      proposedAction: { naturalLanguage: 'test', toolCalls: [], sessionId: 'test' },
      toolCalls: [],
      timestamp: new Date(),
    };

    const estimates = makeEstimates(0.5, 0.5);
    const trend = makeTrend();
    const risk = computeRisk(estimates, trend, 0.7, [origResult], [origSanResult]);
    expect(risk.instantaneousEscalation).toBe(true);
  });

  it('instantaneousEscalation: high-severity call present in orig_sanitized → false', () => {
    const id = generateBoundaryId();
    const highCall = { name: 'safe_high_op', args: {}, severity: 'high' as const, isStateChanging: false };
    const origResult = {
      regime: 'orig' as const,
      boundaryId: id,
      proposedAction: { naturalLanguage: 'test', toolCalls: [highCall], sessionId: 'test' },
      toolCalls: [highCall],
      timestamp: new Date(),
    };
    const origSanResult = {
      regime: 'orig_sanitized' as const,
      boundaryId: id,
      proposedAction: { naturalLanguage: 'test', toolCalls: [highCall], sessionId: 'test' },
      toolCalls: [highCall],
      timestamp: new Date(),
    };

    const estimates = makeEstimates(0.5, 0.5);
    const trend = makeTrend();
    const risk = computeRisk(estimates, trend, 0.7, [origResult], [origSanResult]);
    expect(risk.instantaneousEscalation).toBe(false);
  });

  it('instantaneousEscalation: no regimes → false', () => {
    const estimates = makeEstimates(0.5, 0.5);
    const trend = makeTrend();
    const risk = computeRisk(estimates, trend, 0.7);
    expect(risk.instantaneousEscalation).toBe(false);
  });

  it('boundaryId propagates from estimates', () => {
    const estimates = makeEstimates(0.5, 0.5);
    const trend = makeTrend();
    const risk = computeRisk(estimates, trend, 0.7);
    expect(risk.boundaryId).toBe(estimates.boundaryId);
  });
});
