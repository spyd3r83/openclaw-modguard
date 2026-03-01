import { Tokenizer, SessionId, isValidToken } from '../tokenizer.js';
import { SessionManager } from '../session-manager.js';
import type { MessageSendingContext } from '../index.js';

interface MessageSendingOptions {
  tokenizer: Tokenizer;
  sessionManager: SessionManager;
}

// Token suffix length must match Tokenizer.tokenize() output: 8 bytes = 16 hex chars.
// NOTE: keep in sync with TOKEN_REGEX in tokenizer.ts.
const TOKEN_PATTERN = /\b([A-Z][A-Z0-9_]+_[0-9a-f]{16})\b/g;

export async function handleMessageSending(
  context: MessageSendingContext,
  options: MessageSendingOptions
): Promise<{ content?: string }> {
  const { tokenizer, sessionManager } = options;
  const { content, sessionId } = context;

  if (!content || content.length === 0) {
    return {};
  }

  // Skip detokenization for known internal channels (api, cli, internal).
  // All other channels (Discord, Telegram, Slack, custom) receive unmasked content.
  const INTERNAL_CHANNELS = ['api', 'cli', 'internal'];
  if (INTERNAL_CHANNELS.includes(context.channelId.toLowerCase())) {
    return {};
  }

  if (!sessionId) {
    console.warn('No sessionId provided in message_sending hook, cannot unmask tokens');
    return {};
  }

  const session = sessionManager.getSession(sessionId);

  if (!session) {
    console.warn('No session found in message_sending hook, cannot unmask tokens');
    return {};
  }

  const tokens = findTokens(content);

  if (tokens.length === 0) {
    return {};
  }

  const unmapped = await unmaskTokens(content, tokens, tokenizer, sessionId);

  return {
    content: unmapped
  };
}

function findTokens(text: string): string[] {
  // BUG-036: Reset lastIndex before each use to prevent stale state from
  // a previous call leaving a non-zero lastIndex, which would cause the
  // regex engine to start mid-string and miss leading tokens.
  TOKEN_PATTERN.lastIndex = 0;

  const tokens: string[] = [];
  const seen = new Set<string>();

  let match;
  while ((match = TOKEN_PATTERN.exec(text)) !== null) {
    const token = match[1];
    if (!seen.has(token) && isValidToken(token)) {
      seen.add(token);
      tokens.push(token);
    }
  }

  return tokens;
}

async function unmaskTokens(
  text: string,
  tokens: string[],
  tokenizer: Tokenizer,
  session: SessionId,
  logger?: { warn(msg: string): void }
): Promise<string> {
  let result = text;

  for (const token of tokens) {
    try {
      const originalValue = await tokenizer.detokenize(token as any, session);
      const tokenRegex = new RegExp(`\\b${token}\\b`, 'g');
      result = result.replace(tokenRegex, originalValue);
    } catch (_error) {
      // BUG-037: Do NOT rethrow — a single stale/expired token must not abort
      // unmasking of all remaining tokens.
      // Log token ID only (no original value) per security rule 2 (no PII in logs).
      const msg = `ModGuard: detokenization failed for token ${token} in session ${session}`;
      if (logger) {
        logger.warn(msg);
      } else {
        console.warn(msg);
      }
      // Leave the token placeholder in the result and continue.
    }
  }

  return result;
}
