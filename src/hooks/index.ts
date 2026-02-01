import type { BeforeAgentStartContext, MessageSendingContext, AgentEndContext } from '../index.js';
import { Detector } from '../detector.js';
import { Tokenizer } from '../tokenizer.js';
import { SessionManager } from '../session-manager.js';
import { handleBeforeAgentStart } from './before-agent-start.js';
import { handleMessageSending } from './message-sending.js';
import { handleAgentEnd } from './agent-end.js';

interface OpenClawPluginApi {
  logger: {
    info(message: string): void;
    warn(message: string): void;
  };
  on(event: 'before_agent_start', handler: (ctx: BeforeAgentStartContext) => Promise<{ prependContext?: string } | void>): void;
  on(event: 'message_sending', handler: (ctx: MessageSendingContext) => Promise<{ content?: string } | void>): void;
  on(event: 'agent_end', handler: (ctx: AgentEndContext) => Promise<void>): void;
}

interface ModGuardState {
  vault: unknown;
  detector: Detector | null;
  tokenizer: Tokenizer | null;
  initialized: boolean;
}

export function registerHooks(api: OpenClawPluginApi, state: ModGuardState): void {
  if (!state.detector || !state.tokenizer) {
    api.logger.warn('ModGuard hooks not registered - detector or tokenizer not initialized');
    return;
  }

  const sessionManager = new SessionManager();
  const detector = state.detector;
  const tokenizer = state.tokenizer;

  api.on('before_agent_start', async (ctx: BeforeAgentStartContext) => {
    return handleBeforeAgentStart(ctx, { detector, tokenizer, sessionManager });
  });

  api.on('message_sending', async (ctx: MessageSendingContext) => {
    return handleMessageSending(ctx, { tokenizer, sessionManager });
  });

  api.on('agent_end', async (ctx: AgentEndContext) => {
    return handleAgentEnd(ctx, { sessionManager, tokenizer });
  });

  api.logger.info('ModGuard hooks registered: before_agent_start, message_sending, agent_end');
}
