import { PolicyGateError } from '../errors.js';
import type { Policy } from '../policy.js';
import type {
  ProposedAction,
  ContextSnapshot,
  DryRunToolCall,
  ToolCallSeverity,
} from './types.js';

// Map severity to policy confidence
const SEVERITY_CONFIDENCE: Record<ToolCallSeverity, number> = {
  low: 0.3,
  medium: 0.65,
  high: 0.95,
};

export interface PolicyGateDecision {
  authorized: boolean;
  blockedCalls: DryRunToolCall[];
  allowedCalls: DryRunToolCall[];
  blockReason?: string;
}

/**
 * Authorize a proposed action against the policy engine.
 *
 * Rules:
 * - block any state-changing call that is mediator-contingent
 * - allow calls with severity='low' AND !isMediatorContingent
 * - for medium/high calls: delegate to policy engine
 */
export class PolicyGate {
  constructor(private readonly policy: Policy) {}

  authorize(action: ProposedAction, _snapshot: ContextSnapshot): PolicyGateDecision {
    try {
      const blockedCalls: DryRunToolCall[] = [];
      const allowedCalls: DryRunToolCall[] = [];

      for (const call of action.toolCalls) {
        if (call.isStateChanging && call.isMediatorContingent) {
          // Hard block: state-changing mediator-contingent calls
          blockedCalls.push(call);
          continue;
        }

        if (call.severity === 'low' && !call.isMediatorContingent) {
          allowedCalls.push(call);
          continue;
        }

        // Delegate to policy engine for medium/high severity
        const decision = this.policy.evaluate({
          direction: 'inbound',
          confidence: SEVERITY_CONFIDENCE[call.severity],
        });

        if (decision.action === 'block' || decision.cancel) {
          blockedCalls.push(call);
        } else {
          allowedCalls.push(call);
        }
      }

      const authorized = blockedCalls.length === 0;

      return {
        authorized,
        blockedCalls,
        allowedCalls,
        blockReason: authorized
          ? undefined
          : `${blockedCalls.length} tool call(s) blocked by policy`,
      };
    } catch (err) {
      if (err instanceof PolicyGateError) throw err;
      throw new PolicyGateError('Policy gate evaluation failed', {
        reason: err instanceof Error ? err.name : 'unknown',
      });
    }
  }
}
