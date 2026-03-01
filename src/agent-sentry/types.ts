// src/agent-sentry/types.ts

export type BoundaryId = string & { readonly __boundary: true };

export type RegimeType = 'orig' | 'mask' | 'mask_sanitized' | 'orig_sanitized';

export type ToolCallSeverity = 'low' | 'medium' | 'high';

export interface DryRunToolCall {
  name: string;
  args: Record<string, unknown>;
  severity: ToolCallSeverity;
  isStateChanging: boolean;
  isMediatorContingent?: boolean;
}

export interface ProposedAction {
  naturalLanguage: string;
  toolCalls: DryRunToolCall[];
  sessionId: string;
}

export interface RegimeResult {
  regime: RegimeType;
  boundaryId: BoundaryId;
  proposedAction: ProposedAction;
  toolCalls: DryRunToolCall[];
  timestamp: Date;
}

export interface ContextSnapshot {
  boundaryId: BoundaryId;
  userInput: string;
  mediatorContent: string;
  dialogueHistory: string[];
  sessionId: string;
  capturedAt: Date;
}

export interface CausalEstimates {
  boundaryId: BoundaryId;
  ACE: number;
  IE: number;
  DE: number;
  IESignificant: boolean;
  sampleCount: number;
}

export interface TrendWindow {
  windowSize: number;
  beta_ACE: number;
  beta_IE: number;
  boundaries: BoundaryId[];
}

export interface RiskScore {
  boundaryId: BoundaryId;
  R: number;
  gamma: number;
  takeover: boolean;
  instantaneousEscalation: boolean;
}

export interface PurificationResult {
  purified: string;
  /** Number of directive sentences stripped (no verbatim content). */
  strippedCount: number;
  retainedEntities: string[];
}

export interface ActionRevisionResult {
  original: ProposedAction;
  safe: ProposedAction;
  preserved: DryRunToolCall[];
  suppressed: DryRunToolCall[];
  repaired: Array<{ original: DryRunToolCall; repaired: DryRunToolCall }>;
}

export interface AgentSentryConfig {
  enabled: boolean;
  K: number;
  windowSize: number;
  gamma: number;
  diagnosticProbe: string;
  dryRunTimeoutMs: number;
}

export interface AgentSentryDecision {
  takeover: boolean;
  riskScore: RiskScore;
  safeAction?: ActionRevisionResult;
  authorized: boolean;
  boundaryId: BoundaryId;
}
