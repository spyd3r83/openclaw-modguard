/**
 * tool-result-persist.ts — AgentSentry IPI intercept via after_tool_call hook.
 *
 * OpenClaw's after_tool_call hook fires asynchronously after each tool call
 * completes. It is checked lazily at call time (not pre-captured at session
 * creation), so it fires correctly even in embedded agent worker subprocesses.
 *
 *   1. (Async) Extract tool result content and start async IPI analysis.
 *   2. (Async) Store the pending analysis promise keyed by sessionKey.
 *   3. (Async) before_tool_call hook awaits the promise and blocks the NEXT tool
 *      call if takeover=true.
 *
 * This gives real enforcement: if a tool result contains injection directives, the
 * model cannot act on it — the next tool call it tries to make is blocked, and the
 * agent is forced to return a safe response explaining why it cannot proceed.
 *
 * Security constraints:
 * - No result content or user data in logs (rule #2)
 * - No raw errors to callers (rule #1) — IpiError is caught and swallowed with only
 *   the error name logged
 */

import { AgentSentry } from '../agent-sentry/index.js';
import { generateBoundaryId } from '../agent-sentry/boundary.js';
import type { ContextSnapshot } from '../agent-sentry/types.js';
import { IpiError } from '../errors.js';

/** Shape of the after_tool_call event from OpenClaw's plugin API. */
export interface AfterToolCallEvent {
  toolName: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: string;
  durationMs?: number;
}

interface PendingAnalysis {
  promise: Promise<{ takeover: boolean; R: number; boundaryId: string }>;
  toolName: string;
  boundaryId: string;
}

/**
 * Per-session store of in-flight AgentSentry analyses.
 * Keyed by sessionKey (from OpenClaw hook context).
 */
const pendingAnalyses = new Map<string, PendingAnalysis>();

/** Maximum time (ms) to wait for analysis before before_tool_call proceeds. */
const ANALYSIS_WAIT_MS = 4500;

/**
 * Called by the after_tool_call hook handler (async).
 * Starts async IPI analysis and stores the promise for before_tool_call to await.
 */
export function startToolResultAnalysis(
  event: AfterToolCallEvent,
  sessionKey: string,
  agentSentry: AgentSentry,
  logger: { warn(msg: string): void; error(msg: string): void },
): void {
  // Extract text content from the tool result
  const mediatorContent = extractTextContent(event.result);
  if (!mediatorContent) return;

  const boundaryId = generateBoundaryId();

  const snapshot: ContextSnapshot = {
    boundaryId,
    userInput: '',         // not available at this hook; populated from session history
    mediatorContent,
    dialogueHistory: [],
    sessionId: sessionKey,
    capturedAt: new Date(),
  };

  const promise = agentSentry.analyzeToolReturn(snapshot).then(
    (decision) => {
      return ({
        takeover: decision.takeover,
        R: decision.riskScore.R,
        boundaryId: decision.boundaryId,
      });
    },
    (err) => {
      // Rule #1: no raw error to caller; rule #2: no content in logs
      if (err instanceof IpiError) {
        logger.error(`AgentSentry analysis failed: ${err.name}`);
      } else {
        logger.error('AgentSentry analysis failed');
      }
      return { takeover: false, R: 0, boundaryId };
    },
  );

  pendingAnalyses.set(sessionKey, {
    promise,
    toolName: event.toolName,
    boundaryId,
  });
}

/**
 * Called by the before_tool_call hook handler (async).
 * Awaits any pending IPI analysis for this session with a timeout.
 * Returns the takeover decision, or { takeover: false } if no analysis pending.
 */
export async function awaitAnalysisForSession(
  sessionKey: string,
): Promise<{ takeover: boolean; R: number; boundaryId: string; toolName: string } | null> {
  const pending = pendingAnalyses.get(sessionKey);
  if (!pending) return null;

  // Race against timeout — we must not hold up tool calls indefinitely
  const timeout = new Promise<{ takeover: false; R: 0; boundaryId: string }>((resolve) =>
    setTimeout(() => resolve({ takeover: false, R: 0, boundaryId: pending.boundaryId }), ANALYSIS_WAIT_MS),
  );

  const result = await Promise.race([pending.promise, timeout]);

  // Clear after consuming — each analysis applies once
  pendingAnalyses.delete(sessionKey);

  return { ...result, toolName: pending.toolName };
}

/**
 * Clear any pending analysis for a session (call from agent_end).
 */
export function clearPendingAnalysis(sessionKey: string): void {
  pendingAnalyses.delete(sessionKey);
}

/**
 * Extract plain text from the result of an after_tool_call event.
 * Handles plain strings, content arrays, and objects with a text/content field.
 * OpenClaw tool results are typically { content: ContentBlock[], details: ... }
 * where ContentBlock is { type: 'text', text: string } | { type: 'image', ... }.
 * Returns empty string if no text content found. Never throws.
 */
function extractTextContent(result: unknown): string {
  try {
    if (typeof result === 'string') return result;
    if (Array.isArray(result)) {
      return result
        .filter((c) => c && typeof c === 'object' && c.type === 'text' && typeof c.text === 'string')
        .map((c: { text: string }) => c.text)
        .join('\n');
    }
    if (result && typeof result === 'object') {
      const r = result as Record<string, unknown>;
      if (typeof r['content'] === 'string') return r['content'];
      if (typeof r['text'] === 'string') return r['text'];
      // OpenClaw standard: { content: ContentBlock[], details: ... }
      if (Array.isArray(r['content'])) {
        const blocks = r['content'] as unknown[];
        const text = blocks
          .filter((c) => c && typeof c === 'object' && (c as Record<string,unknown>)['type'] === 'text' && typeof (c as Record<string,unknown>)['text'] === 'string')
          .map((c) => (c as { text: string }).text)
          .join('\n');
        if (text) return text;
      }
    }
    return '';
  } catch {
    return '';
  }
}
