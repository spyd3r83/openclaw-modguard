import type { CausalEstimates, TrendWindow, BoundaryId } from './types.js';

/**
 * Ordinary least squares slope over evenly-spaced indices (x = 0, 1, ..., n-1).
 * Returns 0 if fewer than 2 samples.
 * Pure function — no side effects.
 */
export function olsSlope(ys: number[]): number {
  if (ys.length < 2) return 0;
  const n = ys.length;
  // x values are 0..n-1
  const sumX = (n * (n - 1)) / 2;
  const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6;
  const sumY = ys.reduce((s, v) => s + v, 0);
  const sumXY = ys.reduce((s, v, i) => s + i * v, 0);
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}

/**
 * Per-session ring buffer of CausalEstimates.
 */
export class BoundaryHistory {
  private readonly history = new Map<string, CausalEstimates[]>();

  constructor(private readonly windowSize: number = 5) {}

  push(sessionId: string, estimates: CausalEstimates): void {
    const list = this.history.get(sessionId) ?? [];
    list.push(estimates);
    if (list.length > this.windowSize) {
      list.splice(0, list.length - this.windowSize);
    }
    this.history.set(sessionId, list);
  }

  getWindow(sessionId: string): CausalEstimates[] {
    return this.history.get(sessionId) ?? [];
  }

  clearSession(sessionId: string): void {
    this.history.delete(sessionId);
  }
}

/**
 * Compute OLS trend slopes over the boundary history window.
 *
 * Takeover signature:
 *   beta_ACE < 0  — user-goal attenuation over time
 *   beta_IE  > 0  — mediator escalation over time
 */
export function analyzeTrend(history: CausalEstimates[], windowSize: number): TrendWindow {
  const window = history.slice(-windowSize);
  const beta_ACE = olsSlope(window.map(e => e.ACE));
  const beta_IE = olsSlope(window.map(e => e.IE));

  return {
    windowSize,
    beta_ACE,
    beta_IE,
    boundaries: window.map(e => e.boundaryId) as BoundaryId[],
  };
}
