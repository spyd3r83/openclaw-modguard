import { RiskEstimationError } from '../errors.js';
import type {
  RegimeType,
  RegimeResult,
  CausalEstimates,
  BoundaryId,
  ProposedAction,
  DryRunToolCall,
} from './types.js';

// IE significance thresholds
const IE_SIGNIFICANCE_THRESHOLD = 0.3;
const IE_VARIANCE_THRESHOLD = 0.05;

/**
 * Compute Jaccard similarity on word token sets.
 */
function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
  const setB = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));
  if (setA.size === 0 && setB.size === 0) return 1.0;
  const intersection = [...setA].filter(w => setB.has(w)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 1.0 : intersection / union;
}

/**
 * Hash a tool call by name + sorted arg keys (NOT values, which may contain PII).
 * Used for structural comparison only.
 */
function toolCallSignature(tc: DryRunToolCall): string {
  const argKeys = Object.keys(tc.args).sort().join(',');
  return `${tc.name}(${argKeys})`;
}

/**
 * Compute structural similarity between two sets of tool calls.
 * Compares call names and argument keys only — never values.
 */
function toolCallSetSimilarity(a: DryRunToolCall[], b: DryRunToolCall[]): number {
  if (a.length === 0 && b.length === 0) return 1.0;
  const sigsA = new Set(a.map(toolCallSignature));
  const sigsB = new Set(b.map(toolCallSignature));
  const intersection = [...sigsA].filter(s => sigsB.has(s)).length;
  const union = new Set([...sigsA, ...sigsB]).size;
  return union === 0 ? 1.0 : intersection / union;
}

/**
 * Measure similarity between two ProposedActions.
 * Weighted: 0.4 natural language (Jaccard) + 0.6 tool call structure.
 */
export function actionSimilarity(a: ProposedAction, b: ProposedAction): number {
  const nlSim = jaccardSimilarity(a.naturalLanguage, b.naturalLanguage);
  const toolSim = toolCallSetSimilarity(a.toolCalls, b.toolCalls);
  return 0.4 * nlSim + 0.6 * toolSim;
}

/**
 * Compute variance of an array of numbers.
 */
function variance(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  return values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
}

/**
 * Estimate causal effects from K rounds of regime results.
 *
 * ACE_b = mean(similarity(orig_k, mask_k)) — user-goal dominance
 *         High ACE = user goal dominates (good); low = mediator interferes
 * IE_b  = 1 - mean(similarity(mask_k, mask_sanitized_k)) — mediator influence
 * DE_b  = mean(similarity(orig_sanitized_k, mask_sanitized_k)) — user direct effect
 *
 * @param regimes - Map from RegimeType to array of K RegimeResults
 */
export function estimateCausalEffects(regimes: Map<RegimeType, RegimeResult[]>): CausalEstimates {
  const origResults = regimes.get('orig') ?? [];
  const maskResults = regimes.get('mask') ?? [];
  const maskSanResults = regimes.get('mask_sanitized') ?? [];
  const origSanResults = regimes.get('orig_sanitized') ?? [];

  const K = origResults.length;

  if (K === 0) {
    throw new RiskEstimationError('No regime results available for causal estimation', { K });
  }

  const boundaryId = origResults[0]?.boundaryId;
  if (!boundaryId) {
    throw new RiskEstimationError('Missing boundaryId in regime results', {});
  }

  // ACE samples: similarity(orig_k, mask_k)
  const aceSamples: number[] = [];
  for (let k = 0; k < K; k++) {
    const orig = origResults[k];
    const mask = maskResults[k];
    if (orig && mask) {
      aceSamples.push(actionSimilarity(orig.proposedAction, mask.proposedAction));
    }
  }

  // IE samples: 1 - similarity(mask_k, mask_sanitized_k)
  const ieSamples: number[] = [];
  for (let k = 0; k < K; k++) {
    const mask = maskResults[k];
    const maskSan = maskSanResults[k];
    if (mask && maskSan) {
      ieSamples.push(1 - actionSimilarity(mask.proposedAction, maskSan.proposedAction));
    }
  }

  // DE samples: similarity(orig_sanitized_k, mask_sanitized_k)
  const deSamples: number[] = [];
  for (let k = 0; k < K; k++) {
    const origSan = origSanResults[k];
    const maskSan = maskSanResults[k];
    if (origSan && maskSan) {
      deSamples.push(actionSimilarity(origSan.proposedAction, maskSan.proposedAction));
    }
  }

  const mean = (arr: number[]) => arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  const ACE = mean(aceSamples);
  const IE = mean(ieSamples);
  const DE = mean(deSamples);

  const IESignificant = IE > IE_SIGNIFICANCE_THRESHOLD && variance(ieSamples) < IE_VARIANCE_THRESHOLD;

  return {
    boundaryId: boundaryId as BoundaryId,
    ACE,
    IE,
    DE,
    IESignificant,
    sampleCount: K,
  };
}
