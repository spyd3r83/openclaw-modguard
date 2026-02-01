import { Tokenizer, SessionId, isValidToken } from '../tokenizer.js';
import { SessionManager } from '../session-manager.js';
import { DetokenizationError } from '../errors.js';
import type { MessageSendingContext } from '../index.js';

interface MessageSendingOptions {
  tokenizer: Tokenizer;
  sessionManager: SessionManager;
}

const TOKEN_PATTERN = /\b([A-Z]+_[0-9a-f]{8})\b/g;

export async function handleMessageSending(
  context: MessageSendingContext,
  options: MessageSendingOptions
): Promise<{ content?: string }> {
  const { tokenizer, sessionManager } = options;
  const { content, sessionId } = context;

  if (!content || content.length === 0) {
    return {};
  }

  if (!sessionId) {
    console.warn('No sessionId provided in message_sending hook, cannot unmask tokens');
    return {};
  }

  const session = sessionManager.getSession(sessionId);

  if (!session) {
    console.warn(`No session found for sessionId ${sessionId}, cannot unmask tokens`);
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
  session: SessionId
): Promise<string> {
  let result = text;

  for (const token of tokens) {
    try {
      const originalValue = await tokenizer.detokenize(token as any, session);
      const tokenRegex = new RegExp(`\\b${token}\\b`, 'g');
      result = result.replace(tokenRegex, originalValue);
    } catch (error) {
      console.error(`Failed to unmask token ${token}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw new DetokenizationError(`Failed to unmask token ${token}`, { token, session });
    }
  }

  return result;
}
