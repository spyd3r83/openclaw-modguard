import type { BeforeAgentStartContext, MessageSendingContext, AgentEndContext } from '../index.js';
import { Detector } from '../detector.js';
import { Tokenizer } from '../tokenizer.js';
import { SessionManager } from '../session-manager.js';
import { handleBeforeAgentStart } from './before-agent-start.js';
import { handleMessageSending } from './message-sending.js';
import { handleAgentEnd } from './agent-end.js';
import { AgentSentry, registerAgentSentry, defaultAgentSentryConfig } from '../agent-sentry/index.js';
import type { DryRunEngine } from '../agent-sentry/counterfactual.js';
import type { ProposedAction } from '../agent-sentry/types.js';
import { Policy } from '../policy.js';

interface OpenClawPluginApi {
  logger: {
    info(message: string): void;
    warn(message: string): void;
    error(message: string): void;
  };
  on(event: string, handler: (...args: unknown[]) => unknown): void;
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

  api.on('before_agent_start', async (ctx: unknown) => {
    return handleBeforeAgentStart(ctx as BeforeAgentStartContext, { detector, tokenizer, sessionManager });
  });

  api.on('message_sending', async (ctx: unknown) => {
    return handleMessageSending(ctx as MessageSendingContext, { tokenizer, sessionManager });
  });

  api.on('agent_end', async (ctx: unknown) => {
    return handleAgentEnd(ctx as AgentEndContext, { sessionManager, tokenizer });
  });

  api.logger.info('ModGuard hooks registered: before_agent_start, message_sending, agent_end');

  // Stub engine — used until before_tool_result hook is available in OpenClaw
  const stubEngine: DryRunEngine = {
    async run(_userInput: string, _mediatorContent: string, sessionId: string): Promise<ProposedAction> {
      return { naturalLanguage: '', toolCalls: [], sessionId };
    },
  };

  // Create a default allow-all policy for AgentSentry
  const sentryPolicy = new Policy({ rules: [], defaultAction: 'allow' });

  const agentSentry = new AgentSentry(
    defaultAgentSentryConfig,
    stubEngine,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    state.vault as any,
    sentryPolicy,
  );

  registerAgentSentry(api, agentSentry, defaultAgentSentryConfig);
}
