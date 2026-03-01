/**
 * Tests for src/hooks/message-sending.ts
 *
 * Covers:
 *  - BUG-036: TOKEN_PATTERN.lastIndex reset between calls
 *  - BUG-037: Per-token detokenization failures do not abort remaining tokens
 *  - Happy-path unmasking
 *  - Edge cases: empty content, missing session, no tokens
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { handleMessageSending } from '../../src/hooks/message-sending.js';
import { Tokenizer } from '../../src/tokenizer.js';
import { Vault } from '../../src/vault.js';
import { SessionManager } from '../../src/session-manager.js';
import { PatternType } from '../../src/types.js';

const MASTER_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

describe('handleMessageSending', () => {
  let vault: Vault;
  let tokenizer: Tokenizer;
  let sessionManager: SessionManager;
  let sessionId: string;

  beforeEach(async () => {
    vault = new Vault(':memory:', MASTER_KEY);
    await vault.ensureReady();
    tokenizer = new Tokenizer(vault);
    sessionManager = new SessionManager();
    sessionId = tokenizer.generateSessionId();
    sessionManager.createSession(sessionId);
  });

  afterEach(() => {
    vault.close();
    tokenizer.clearAllSessions();
  });

  // ---------------------------------------------------------------------------
  // Helper
  // ---------------------------------------------------------------------------

  function makeContext(content: string, sid?: string) {
    return { content, channelId: 'ch1', sessionId: sid ?? sessionId };
  }

  // ---------------------------------------------------------------------------
  // Happy path
  // ---------------------------------------------------------------------------

  it('unmasks a single token in the message', async () => {
    const token = await tokenizer.tokenize('user@example.com', PatternType.EMAIL, sessionId);
    const result = await handleMessageSending(
      makeContext(`Your email is ${token}`),
      { tokenizer, sessionManager }
    );
    expect(result.content).toBe('Your email is user@example.com');
  });

  it('unmasks multiple tokens in the same message', async () => {
    const emailToken = await tokenizer.tokenize('alice@example.com', PatternType.EMAIL, sessionId);
    const phoneToken = await tokenizer.tokenize('555-111-2222', PatternType.PHONE, sessionId);
    const result = await handleMessageSending(
      makeContext(`Email: ${emailToken}, Phone: ${phoneToken}`),
      { tokenizer, sessionManager }
    );
    expect(result.content).toBe('Email: alice@example.com, Phone: 555-111-2222');
  });

  it('unmasks the same token appearing multiple times in a message', async () => {
    const token = await tokenizer.tokenize('bob@example.com', PatternType.EMAIL, sessionId);
    const result = await handleMessageSending(
      makeContext(`${token} sent a message to ${token}`),
      { tokenizer, sessionManager }
    );
    expect(result.content).toBe('bob@example.com sent a message to bob@example.com');
  });

  // ---------------------------------------------------------------------------
  // BUG-036: lastIndex reset
  // ---------------------------------------------------------------------------

  describe('BUG-036 — TOKEN_PATTERN.lastIndex reset between calls', () => {
    it('finds tokens correctly on the SECOND consecutive call', async () => {
      // First call with a token near the end of the string — leaves lastIndex > 0
      const token1 = await tokenizer.tokenize('first@example.com', PatternType.EMAIL, sessionId);
      const token2 = await tokenizer.tokenize('second@example.com', PatternType.EMAIL, sessionId);

      // First call
      const res1 = await handleMessageSending(
        makeContext(`Some text ${token1}`),
        { tokenizer, sessionManager }
      );
      expect(res1.content).toBe('Some text first@example.com');

      // Second call — the leading token must also be detected (would fail if
      // lastIndex was not reset to 0 before the second exec loop)
      const res2 = await handleMessageSending(
        makeContext(`${token2} is a contact`),
        { tokenizer, sessionManager }
      );
      expect(res2.content).toBe('second@example.com is a contact');
    });

    it('finds a token at position 0 of the string on a repeated call', async () => {
      const token = await tokenizer.tokenize('carol@example.com', PatternType.EMAIL, sessionId);

      // Iterate several times to stress the lastIndex state
      for (let i = 0; i < 5; i++) {
        const res = await handleMessageSending(
          makeContext(`${token} appeared`),
          { tokenizer, sessionManager }
        );
        expect(res.content).toBe('carol@example.com appeared');
      }
    });
  });

  // ---------------------------------------------------------------------------
  // BUG-037: per-token error isolation
  // ---------------------------------------------------------------------------

  describe('BUG-037 — failed detokenization does not abort remaining tokens', () => {
    it('continues unmasking remaining tokens when one detokenization fails', async () => {
      const goodToken = await tokenizer.tokenize('dave@example.com', PatternType.EMAIL, sessionId);

      // A syntactically valid but unknown token (not in vault) — 16 hex chars to match TOKEN_PATTERN
      const staleToken = 'EMAIL_deadbeefcafe0011';

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await handleMessageSending(
        makeContext(`Contact ${staleToken} then ${goodToken}`),
        { tokenizer, sessionManager }
      );

      // The good token must be restored; the stale token is left as-is
      expect(result.content).toContain('dave@example.com');
      expect(result.content).toContain(staleToken);

      // A warning must have been logged (token ID only — no PII)
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining(staleToken)
      );
      // The warning must NOT contain the original value (security rule 2)
      expect(warnSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('dave@example.com')
      );

      warnSpy.mockRestore();
    });

    it('logs token ID and session ID in the warning, not the original value', async () => {
      const staleToken = 'SSN_cafebabe0011aabb';
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await handleMessageSending(
        makeContext(`SSN on file: ${staleToken}`),
        { tokenizer, sessionManager }
      );

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining(staleToken));
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining(sessionId));

      warnSpy.mockRestore();
    });

    it('fully unmasks when all tokens are valid', async () => {
      const t1 = await tokenizer.tokenize('eve@example.com', PatternType.EMAIL, sessionId);
      const t2 = await tokenizer.tokenize('frank@example.com', PatternType.EMAIL, sessionId);

      const result = await handleMessageSending(
        makeContext(`${t1} and ${t2}`),
        { tokenizer, sessionManager }
      );

      expect(result.content).toBe('eve@example.com and frank@example.com');
    });
  });

  // ---------------------------------------------------------------------------
  // Edge cases
  // ---------------------------------------------------------------------------

  it('returns empty object for empty content', async () => {
    const result = await handleMessageSending(
      makeContext(''),
      { tokenizer, sessionManager }
    );
    expect(result).toEqual({});
  });

  it('returns empty object when content has no tokens', async () => {
    const result = await handleMessageSending(
      makeContext('Hello, how are you?'),
      { tokenizer, sessionManager }
    );
    expect(result).toEqual({});
  });

  it('returns empty object when sessionId is missing', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await handleMessageSending(
      { content: 'EMAIL_abc12345 test', channelId: 'ch1', sessionId: undefined },
      { tokenizer, sessionManager }
    );
    expect(result).toEqual({});
    warnSpy.mockRestore();
  });

  it('returns empty object when session does not exist in SessionManager', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const unknownSession = 'nonexistent-session-id';
    const result = await handleMessageSending(
      { content: 'EMAIL_abc12345 test', channelId: 'ch1', sessionId: unknownSession },
      { tokenizer, sessionManager }
    );
    expect(result).toEqual({});
    warnSpy.mockRestore();
  });
});
