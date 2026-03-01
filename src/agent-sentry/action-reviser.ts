import { IpiError } from '../errors.js';
import type {
  ProposedAction,
  ContextSnapshot,
  DryRunToolCall,
  ActionRevisionResult,
  RegimeType,
  RegimeResult,
} from './types.js';

/**
 * Determine if a tool call is mediator-contingent:
 * it appears in `orig` but NOT in `orig_sanitized` in the majority of K samples.
 * Security: compare call names only — never expose args in logs.
 */
function isMediatorContingent(
  callName: string,
  origRegimes: RegimeResult[],
  origSanRegimes: RegimeResult[],
): boolean {
  const K = Math.min(origRegimes.length, origSanRegimes.length);
  if (K === 0) return false;

  let absentInSanitized = 0;
  for (let k = 0; k < K; k++) {
    const orig = origRegimes[k];
    const origSan = origSanRegimes[k];
    if (!orig || !origSan) continue;
    const inOrig = orig.toolCalls.some(tc => tc.name === callName);
    const inSan = origSan.toolCalls.some(tc => tc.name === callName);
    if (inOrig && !inSan) absentInSanitized++;
  }

  return absentInSanitized > K / 2;
}

/**
 * Find the safe version of a tool call from orig_sanitized regime results.
 * Uses the first occurrence across K samples.
 * Returns undefined if not found.
 */
function findSafeCallArgs(
  callName: string,
  origSanRegimes: RegimeResult[],
): Record<string, unknown> | undefined {
  for (const result of origSanRegimes) {
    const match = result.toolCalls.find(tc => tc.name === callName);
    if (match) return match.args;
  }
  return undefined;
}

/**
 * Produce a minimal safe revision of the proposed action.
 *
 * Classification:
 * - Preserved: severity='low' AND !isMediatorContingent
 * - Suppressed: isStateChanging=true AND isMediatorContingent=true
 * - Repaired: severity='high' AND counterfactually persistent (in orig_sanitized)
 *   → replace args with values from orig_sanitized regime
 * - Default: allow as-is for unclassified calls
 */
export function reviseAction(
  original: ProposedAction,
  regimes: Map<RegimeType, RegimeResult[]>,
  _purifiedSnapshot: ContextSnapshot,
): ActionRevisionResult {
  if (!original) {
    throw new IpiError('reviseAction requires a valid ProposedAction');
  }

  const origRegimes = regimes.get('orig') ?? [];
  const origSanRegimes = regimes.get('orig_sanitized') ?? [];

  const preserved: DryRunToolCall[] = [];
  const suppressed: DryRunToolCall[] = [];
  const repaired: Array<{ original: DryRunToolCall; repaired: DryRunToolCall }> = [];
  const safeToolCalls: DryRunToolCall[] = [];

  for (const call of original.toolCalls) {
    const contingent = isMediatorContingent(call.name, origRegimes, origSanRegimes);

    // Mark mediator contingency on the call
    const annotated: DryRunToolCall = { ...call, isMediatorContingent: contingent };

    if (call.isStateChanging && contingent) {
      // Suppress: state-changing call caused by mediator
      // Security: log name only, never args
      suppressed.push(annotated);
      continue;
    }

    if (call.severity === 'low' && !contingent) {
      // Preserve: low risk, user-originated
      preserved.push(annotated);
      safeToolCalls.push(annotated);
      continue;
    }

    if (call.severity === 'high' && !contingent) {
      // Repair: persistent high-severity call — replace args from sanitized regime
      const safeArgs = findSafeCallArgs(call.name, origSanRegimes);
      if (safeArgs !== undefined) {
        const repairedCall: DryRunToolCall = { ...annotated, args: safeArgs };
        repaired.push({ original: annotated, repaired: repairedCall });
        safeToolCalls.push(repairedCall);
      } else {
        // No safe args found — suppress to be safe
        suppressed.push(annotated);
      }
      continue;
    }

    // Default: include as-is
    safeToolCalls.push(annotated);
  }

  const safeAction: ProposedAction = {
    ...original,
    toolCalls: safeToolCalls,
  };

  return {
    original,
    safe: safeAction,
    preserved,
    suppressed,
    repaired,
  };
}
