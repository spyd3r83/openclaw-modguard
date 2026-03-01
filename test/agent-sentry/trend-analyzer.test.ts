import { describe, it, expect } from 'vitest';
import { olsSlope, BoundaryHistory, analyzeTrend } from '../../src/agent-sentry/trend-analyzer.js';
import { generateBoundaryId } from '../../src/agent-sentry/boundary.js';
import type { CausalEstimates } from '../../src/agent-sentry/types.js';

function makeEstimates(ACE: number, IE: number, DE = 0): CausalEstimates {
  return {
    boundaryId: generateBoundaryId(),
    ACE,
    IE,
    DE,
    IESignificant: IE > 0.3,
    sampleCount: 1,
  };
}

describe('olsSlope', () => {
  it('returns 0 for single element (too few)', () => {
    expect(olsSlope([1])).toBe(0);
  });

  it('returns 0 for empty array', () => {
    expect(olsSlope([])).toBe(0);
  });

  it('ascending [1, 2, 3] → slope 1.0', () => {
    expect(olsSlope([1, 2, 3])).toBeCloseTo(1.0);
  });

  it('descending [3, 2, 1] → slope -1.0', () => {
    expect(olsSlope([3, 2, 1])).toBeCloseTo(-1.0);
  });

  it('flat [2, 2, 2] → slope 0.0', () => {
    expect(olsSlope([2, 2, 2])).toBeCloseTo(0.0);
  });

  it('two ascending points [0, 1] → slope 1.0', () => {
    expect(olsSlope([0, 1])).toBeCloseTo(1.0);
  });

  it('two descending points [1, 0] → slope -1.0', () => {
    expect(olsSlope([1, 0])).toBeCloseTo(-1.0);
  });

  it('larger ascending series produces positive slope', () => {
    const slope = olsSlope([0, 0.2, 0.4, 0.6, 0.8]);
    expect(slope).toBeGreaterThan(0);
  });
});

describe('BoundaryHistory', () => {
  it('push and getWindow returns estimates in order', () => {
    const history = new BoundaryHistory(5);
    const e1 = makeEstimates(0.9, 0.1);
    const e2 = makeEstimates(0.8, 0.2);
    history.push('sess-1', e1);
    history.push('sess-1', e2);
    const window = history.getWindow('sess-1');
    expect(window).toHaveLength(2);
    expect(window[0]).toBe(e1);
    expect(window[1]).toBe(e2);
  });

  it('getWindow returns empty for unknown session', () => {
    const history = new BoundaryHistory(5);
    expect(history.getWindow('no-such-session')).toEqual([]);
  });

  it('ring buffer evicts oldest beyond windowSize', () => {
    const history = new BoundaryHistory(3);
    const estimates = Array.from({ length: 4 }, (_, i) => makeEstimates(i * 0.1, i * 0.05));
    for (const e of estimates) {
      history.push('sess-ring', e);
    }
    const window = history.getWindow('sess-ring');
    expect(window).toHaveLength(3);
    // Oldest (index 0) evicted
    expect(window).not.toContain(estimates[0]);
    // Newest kept
    expect(window).toContain(estimates[3]);
  });

  it('clearSession removes all entries for session', () => {
    const history = new BoundaryHistory(5);
    history.push('sess-clear', makeEstimates(0.9, 0.1));
    history.push('sess-clear', makeEstimates(0.8, 0.2));
    history.clearSession('sess-clear');
    expect(history.getWindow('sess-clear')).toEqual([]);
  });

  it('sessions are isolated', () => {
    const history = new BoundaryHistory(5);
    history.push('sess-A', makeEstimates(0.9, 0.1));
    history.push('sess-B', makeEstimates(0.5, 0.5));
    expect(history.getWindow('sess-A')).toHaveLength(1);
    expect(history.getWindow('sess-B')).toHaveLength(1);
  });
});

describe('analyzeTrend', () => {
  it('ascending IE series → positive beta_IE', () => {
    const history = [0.1, 0.3, 0.5, 0.7, 0.9].map(ie => makeEstimates(1 - ie, ie));
    const trend = analyzeTrend(history, 5);
    expect(trend.beta_IE).toBeGreaterThan(0);
  });

  it('descending ACE → negative beta_ACE', () => {
    const history = [0.9, 0.7, 0.5, 0.3, 0.1].map(ace => makeEstimates(ace, 1 - ace));
    const trend = analyzeTrend(history, 5);
    expect(trend.beta_ACE).toBeLessThan(0);
  });

  it('empty history → zero slopes', () => {
    const trend = analyzeTrend([], 5);
    expect(trend.beta_ACE).toBe(0);
    expect(trend.beta_IE).toBe(0);
    expect(trend.boundaries).toHaveLength(0);
  });

  it('flat IE series → near-zero beta_IE', () => {
    const history = Array.from({ length: 5 }, () => makeEstimates(0.8, 0.2));
    const trend = analyzeTrend(history, 5);
    expect(trend.beta_IE).toBeCloseTo(0.0);
  });

  it('uses last windowSize entries from history', () => {
    // Provide 7 entries but windowSize=5; should use last 5
    const history = [
      makeEstimates(0.9, 0.1),
      makeEstimates(0.8, 0.2),
      // last 5 entries have ascending IE
      makeEstimates(0.7, 0.2),
      makeEstimates(0.6, 0.4),
      makeEstimates(0.5, 0.6),
      makeEstimates(0.4, 0.7),
      makeEstimates(0.3, 0.9),
    ];
    const trend = analyzeTrend(history, 5);
    expect(trend.beta_IE).toBeGreaterThan(0);
    expect(trend.boundaries).toHaveLength(5);
  });

  it('windowSize reflects in returned TrendWindow', () => {
    const history = [makeEstimates(0.8, 0.2), makeEstimates(0.7, 0.3)];
    const trend = analyzeTrend(history, 10);
    expect(trend.windowSize).toBe(10);
  });
});
