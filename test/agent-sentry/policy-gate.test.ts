import { describe, it, expect } from 'vitest';
import { PolicyGate } from '../../src/agent-sentry/policy-gate.js';
import { Policy } from '../../src/policy.js';
import { generateBoundaryId } from '../../src/agent-sentry/boundary.js';
import type { ProposedAction, DryRunToolCall, ContextSnapshot } from '../../src/agent-sentry/types.js';

function makeCall(
  name: string,
  severity: DryRunToolCall['severity'],
  isStateChanging: boolean,
  isMediatorContingent?: boolean,
): DryRunToolCall {
  return { name, args: {}, severity, isStateChanging, isMediatorContingent };
}

function makeAction(toolCalls: DryRunToolCall[]): ProposedAction {
  return { naturalLanguage: 'test', toolCalls, sessionId: 'test' };
}

function makeSnapshot(): ContextSnapshot {
  return {
    boundaryId: generateBoundaryId(),
    userInput: 'test',
    mediatorContent: 'test',
    dialogueHistory: [],
    sessionId: 'test',
    capturedAt: new Date(),
  };
}

function allowAllPolicy(): Policy {
  return new Policy({ rules: [{ action: 'allow', priority: 1 }] });
}

function blockAllPolicy(): Policy {
  return new Policy({ rules: [{ action: 'block', priority: 1 }] });
}

describe('PolicyGate', () => {
  it('state-changing + mediator-contingent call → blocked, authorized=false', () => {
    const gate = new PolicyGate(allowAllPolicy());
    const call = makeCall('delete_files', 'medium', true, true);
    const decision = gate.authorize(makeAction([call]), makeSnapshot());

    expect(decision.authorized).toBe(false);
    expect(decision.blockedCalls.map(c => c.name)).toContain('delete_files');
    expect(decision.allowedCalls.map(c => c.name)).not.toContain('delete_files');
  });

  it('low-severity + not mediator-contingent → allowed, authorized=true', () => {
    const gate = new PolicyGate(allowAllPolicy());
    const call = makeCall('read_file', 'low', false, false);
    const decision = gate.authorize(makeAction([call]), makeSnapshot());

    expect(decision.authorized).toBe(true);
    expect(decision.allowedCalls.map(c => c.name)).toContain('read_file');
    expect(decision.blockedCalls).toHaveLength(0);
  });

  it('medium-severity call delegated to policy: block action → blocked', () => {
    const gate = new PolicyGate(blockAllPolicy());
    const call = makeCall('api_call', 'medium', false, false);
    const decision = gate.authorize(makeAction([call]), makeSnapshot());

    expect(decision.authorized).toBe(false);
    expect(decision.blockedCalls.map(c => c.name)).toContain('api_call');
  });

  it('medium-severity call delegated to policy: allow action → allowed', () => {
    const gate = new PolicyGate(allowAllPolicy());
    const call = makeCall('api_call', 'medium', false, false);
    const decision = gate.authorize(makeAction([call]), makeSnapshot());

    expect(decision.authorized).toBe(true);
    expect(decision.allowedCalls.map(c => c.name)).toContain('api_call');
  });

  it('high-severity call delegated to policy: block action → blocked', () => {
    const gate = new PolicyGate(blockAllPolicy());
    const call = makeCall('dangerous_op', 'high', true, false);
    const decision = gate.authorize(makeAction([call]), makeSnapshot());

    expect(decision.authorized).toBe(false);
    expect(decision.blockedCalls.map(c => c.name)).toContain('dangerous_op');
  });

  it('all blocked → authorized=false with blockReason', () => {
    const gate = new PolicyGate(blockAllPolicy());
    const calls = [
      makeCall('op1', 'medium', false, false),
      makeCall('op2', 'high', false, false),
    ];
    const decision = gate.authorize(makeAction(calls), makeSnapshot());

    expect(decision.authorized).toBe(false);
    expect(decision.blockReason).toBeDefined();
    expect(decision.blockedCalls).toHaveLength(2);
  });

  it('all allowed → authorized=true, no blockReason', () => {
    const gate = new PolicyGate(allowAllPolicy());
    const calls = [
      makeCall('read1', 'low', false, false),
      makeCall('read2', 'low', false, false),
    ];
    const decision = gate.authorize(makeAction(calls), makeSnapshot());

    expect(decision.authorized).toBe(true);
    expect(decision.blockReason).toBeUndefined();
    expect(decision.allowedCalls).toHaveLength(2);
  });

  it('empty toolCalls → authorized=true', () => {
    const gate = new PolicyGate(allowAllPolicy());
    const decision = gate.authorize(makeAction([]), makeSnapshot());
    expect(decision.authorized).toBe(true);
    expect(decision.blockedCalls).toHaveLength(0);
    expect(decision.allowedCalls).toHaveLength(0);
  });

  it('mixed: one blocked one allowed → authorized=false', () => {
    const gate = new PolicyGate(allowAllPolicy());
    const calls = [
      makeCall('safe_read', 'low', false, false),         // allowed
      makeCall('evil_write', 'medium', true, true),       // blocked (state-changing + mediator-contingent)
    ];
    const decision = gate.authorize(makeAction(calls), makeSnapshot());
    expect(decision.authorized).toBe(false);
    expect(decision.allowedCalls.map(c => c.name)).toContain('safe_read');
    expect(decision.blockedCalls.map(c => c.name)).toContain('evil_write');
  });
});
