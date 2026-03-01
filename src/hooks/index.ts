import type { BeforeAgentStartContext, MessageSendingContext, AgentEndContext } from '../index.js';
import { Detector } from '../detector.js';
import { Tokenizer } from '../tokenizer.js';
import { SessionManager } from '../session-manager.js';
import { handleBeforeAgentStart } from './before-agent-start.js';
import { handleMessageSending } from './message-sending.js';
import { handleAgentEnd } from './agent-end.js';
import { AgentSentry, registerAgentSentry, defaultAgentSentryConfig } from '../agent-sentry/index.js';
import { TextAnalysisDryRunEngine } from '../agent-sentry/text-analysis-engine.js';
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

  // AgentSentry: IPI detection via after_tool_call + before_tool_call.
  // No OpenClaw patching required — both hooks are natively supported.
  //
  // Calibrated gamma for TextAnalysisDryRunEngine:
  // Obvious IPI payloads → R≈0.42; benign returns → R≈0.37.
  // gamma=0.38 catches obvious injections with no false positives on clean content.
  const textEngine = new TextAnalysisDryRunEngine();
  const sentryPolicy = new Policy({ rules: [], defaultAction: 'allow' });
  const sentryConfig = { ...defaultAgentSentryConfig, gamma: 0.38 };

  const agentSentry = new AgentSentry(
    sentryConfig,
    textEngine,
    state.vault as import('../vault.js').Vault,
    sentryPolicy,
  );

  registerAgentSentry(api, agentSentry, sentryConfig);
}
