import { SessionManager } from '../session-manager.js';
import { Tokenizer } from '../tokenizer.js';
import type { AgentEndContext } from '../index.js';

interface AgentEndOptions {
  sessionManager: SessionManager;
  tokenizer: Tokenizer;
}

export async function handleAgentEnd(
  context: AgentEndContext,
  options: AgentEndOptions
): Promise<void> {
  const { sessionManager, tokenizer } = options;
  const { sessionId } = context;

  if (!sessionId) {
    return;
  }

  sessionManager.clearSession(sessionId);
  tokenizer.clearSession(sessionId);
}
