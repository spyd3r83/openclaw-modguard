import { describe, it, expect } from 'vitest';
import { reviseAction } from '../../src/agent-sentry/action-reviser.js';
import { generateBoundaryId } from '../../src/agent-sentry/boundary.js';
import type {
  ProposedAction,
  RegimeResult,
  RegimeType,
  DryRunToolCall,
  ContextSnapshot,
  BoundaryId,
} from '../../src/agent-sentry/types.js';

function makeCall(
  name: string,
  severity: DryRunToolCall['severity'] = 'low',
  isStateChanging = false,
  args: Record<string, unknown> = {},
): DryRunToolCall {
  return { name, args, severity, isStateChanging };
}

function makeAction(toolCalls: DryRunToolCall[], nl = 'test action'): ProposedAction {
  return { naturalLanguage: nl, toolCalls, sessionId: 'test' };
}

function makeRegimeResult(regime: RegimeType, action: ProposedAction, id: BoundaryId): RegimeResult {
  return { regime, boundaryId: id, proposedAction: action, toolCalls: action.toolCalls, timestamp: new Date() };
}

function makeSnapshot(id: BoundaryId): ContextSnapshot {
  return {
    boundaryId: id,
    userInput: 'test input',
    mediatorContent: 'test content',
    dialogueHistory: [],
    sessionId: 'test',
    capturedAt: new Date(),
  };
}

describe('reviseAction', () => {
  it('empty toolCalls → all arrays empty', () => {
    const id = generateBoundaryId();
    const original = makeAction([]);
    const regimes = new Map<RegimeType, RegimeResult[]>([
      ['orig', [makeRegimeResult('orig', original, id)]],
      ['orig_sanitized', [makeRegimeResult('orig_sanitized', original, id)]],
    ]);

    const result = reviseAction(original, regimes, makeSnapshot(id));
    expect(result.preserved).toHaveLength(0);
    expect(result.suppressed).toHaveLength(0);
    expect(result.repaired).toHaveLength(0);
  });

  it('low-severity, non-contingent call → preserved', () => {
    const id = generateBoundaryId();
    const call = makeCall('read_file', 'low', false);
    const original = makeAction([call]);

    // Call appears in both orig and orig_sanitized → not mediator-contingent
    const regimes = new Map<RegimeType, RegimeResult[]>([
      ['orig', [makeRegimeResult('orig', original, id)]],
      ['orig_sanitized', [makeRegimeResult('orig_sanitized', original, id)]],
    ]);

    const result = reviseAction(original, regimes, makeSnapshot(id));
    expect(result.preserved.map(c => c.name)).toContain('read_file');
    expect(result.suppressed.map(c => c.name)).not.toContain('read_file');
  });

  it('state-changing, mediator-contingent call → suppressed', () => {
    const id = generateBoundaryId();
    const injectedCall = makeCall('delete_all_files', 'medium', true);
    const original = makeAction([injectedCall]);

    // In orig: has the call. In orig_sanitized: call is absent → mediator-contingent
    const cleanAction = makeAction([]);
    const regimes = new Map<RegimeType, RegimeResult[]>([
      ['orig', [makeRegimeResult('orig', original, id)]],
      ['orig_sanitized', [makeRegimeResult('orig_sanitized', cleanAction, id)]],
    ]);

    const result = reviseAction(original, regimes, makeSnapshot(id));
    expect(result.suppressed.map(c => c.name)).toContain('delete_all_files');
    expect(result.preserved.map(c => c.name)).not.toContain('delete_all_files');
  });

  it('high-severity, non-contingent call with safe args → repaired', () => {
    const id = generateBoundaryId();
    const dangerousCall = makeCall('transfer_funds', 'high', true, { amount: 99999 });
    const safeCall = makeCall('transfer_funds', 'high', true, { amount: 100 });
    const original = makeAction([dangerousCall]);
    const safeOrigSan = makeAction([safeCall]);

    // Call exists in both orig and orig_sanitized → not contingent
    const regimes = new Map<RegimeType, RegimeResult[]>([
      ['orig', [makeRegimeResult('orig', original, id)]],
      ['orig_sanitized', [makeRegimeResult('orig_sanitized', safeOrigSan, id)]],
    ]);

    const result = reviseAction(original, regimes, makeSnapshot(id));
    expect(result.repaired).toHaveLength(1);
    expect(result.repaired[0].repaired.args).toEqual({ amount: 100 });
    expect(result.repaired[0].original.args).toEqual({ amount: 99999 });
  });

  it('high-severity, mediator-contingent, non-state-changing call → default (included as-is, not classified)', () => {
    const id = generateBoundaryId();
    // high severity + mediator-contingent + NOT state-changing
    // → does not match suppress rule (requires isStateChanging=true)
    // → does not match repair rule (requires !contingent)
    // → falls to default: included in safe action but not in preserved/suppressed/repaired
    const highCall = makeCall('dangerous_op', 'high', false); // not state-changing
    const original = makeAction([highCall]);

    const cleanAction = makeAction([]); // absent from orig_sanitized → mediator-contingent
    const regimes = new Map<RegimeType, RegimeResult[]>([
      ['orig', [makeRegimeResult('orig', original, id)]],
      ['orig_sanitized', [makeRegimeResult('orig_sanitized', cleanAction, id)]],
    ]);

    const result = reviseAction(original, regimes, makeSnapshot(id));
    // Not in any categorized array since neither suppress nor repair rule matches
    expect(result.suppressed.map(c => c.name)).not.toContain('dangerous_op');
    expect(result.repaired.map(r => r.original.name)).not.toContain('dangerous_op');
    // The call IS included in the safe action via the default path
    expect(result.safe.toolCalls.map(c => c.name)).toContain('dangerous_op');
  });

  it('mixed calls → correct classification for each', () => {
    const id = generateBoundaryId();
    const lowCall = makeCall('read_data', 'low', false);
    const injectedCall = makeCall('send_to_attacker', 'medium', true);
    const safeHighCall = makeCall('export_report', 'high', false, { format: 'csv' });

    const original = makeAction([lowCall, injectedCall, safeHighCall]);
    const origSanAction = makeAction([lowCall, safeHighCall]); // injectedCall absent in sanitized

    const regimes = new Map<RegimeType, RegimeResult[]>([
      ['orig', [makeRegimeResult('orig', original, id)]],
      ['orig_sanitized', [makeRegimeResult('orig_sanitized', origSanAction, id)]],
    ]);

    const result = reviseAction(original, regimes, makeSnapshot(id));
    // lowCall: preserved
    expect(result.preserved.map(c => c.name)).toContain('read_data');
    // injectedCall: state-changing + mediator-contingent → suppressed
    expect(result.suppressed.map(c => c.name)).toContain('send_to_attacker');
    // safeHighCall: high + not contingent (in orig_sanitized) → repaired
    expect(result.repaired.map(r => r.original.name)).toContain('export_report');
  });

  it('returns original ProposedAction in result', () => {
    const id = generateBoundaryId();
    const original = makeAction([makeCall('read', 'low')]);
    const regimes = new Map<RegimeType, RegimeResult[]>([
      ['orig', [makeRegimeResult('orig', original, id)]],
      ['orig_sanitized', [makeRegimeResult('orig_sanitized', original, id)]],
    ]);

    const result = reviseAction(original, regimes, makeSnapshot(id));
    expect(result.original).toBe(original);
  });
});
