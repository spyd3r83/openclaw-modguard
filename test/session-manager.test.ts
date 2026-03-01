import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SessionManager } from '../src/session-manager.js';
import type { Token } from '../src/tokenizer.js';

describe('SessionManager', () => {
  let sessionManager: SessionManager;

  beforeEach(() => {
    sessionManager = new SessionManager({ cleanupIntervalMs: 60_000 });
  });

  afterEach(() => {
    sessionManager.destroy();
  });

  describe('createSession', () => {
    it('should create a new session', () => {
      const sessionId = 'test-session-1';
      const context = sessionManager.createSession(sessionId);

      expect(context.sessionId).toBe(sessionId);
      expect(context.tokens).toBeInstanceOf(Map);
      expect(context.tokens.size).toBe(0);
      expect(context.createdAt).toBeInstanceOf(Date);
      expect(context.lastAccessedAt).toBeInstanceOf(Date);
    });

    it('should return existing session if already exists', () => {
      const sessionId = 'test-session-1';
      const context1 = sessionManager.createSession(sessionId);
      const context2 = sessionManager.createSession(sessionId);

      // BUG-042 fix: idempotent — same object reference returned for live session
      expect(context1).toBe(context2);
      expect(sessionManager.getSessionCount()).toBe(1);
    });
  });

  describe('getSession', () => {
    it('should retrieve an existing session', () => {
      const sessionId = 'test-session-1';
      const created = sessionManager.createSession(sessionId);
      const retrieved = sessionManager.getSession(sessionId);

      expect(retrieved).toBeDefined();
      expect(retrieved?.sessionId).toBe(sessionId);
    });

    it('should return undefined for non-existent session', () => {
      const result = sessionManager.getSession('non-existent');
      expect(result).toBeUndefined();
    });

    it('should update lastAccessedAt on retrieval', async () => {
      const sessionId = 'test-session-1';
      const context = sessionManager.createSession(sessionId);
      const timestamp1 = context.lastAccessedAt.getTime();

      const retrieved1 = sessionManager.getSession(sessionId);
      expect(retrieved1).toBeDefined();

      await new Promise(resolve => setTimeout(resolve, 20));

      const retrieved2 = sessionManager.getSession(sessionId);
      const timestamp2 = retrieved2!.lastAccessedAt.getTime();
      expect(retrieved2).toBeDefined();

      expect(timestamp2).toBeGreaterThan(timestamp1);
    });
  });

  describe('clearSession', () => {
    it('should remove a session', () => {
      const sessionId = 'test-session-1';
      sessionManager.createSession(sessionId);

      const cleared = sessionManager.clearSession(sessionId);
      expect(cleared).toBe(true);

      const retrieved = sessionManager.getSession(sessionId);
      expect(retrieved).toBeUndefined();
    });

    it('should return false for non-existent session', () => {
      const cleared = sessionManager.clearSession('non-existent');
      expect(cleared).toBe(false);
    });
  });

  describe('addToken', () => {
    it('should add a token to a session', () => {
      const sessionId = 'test-session-1';
      const token = 'EMAIL_a1b2c3d4' as Token;
      const originalValue = 'test@example.com';

      sessionManager.addToken(sessionId, token, originalValue);

      const retrieved = sessionManager.getSession(sessionId);
      expect(retrieved).toBeDefined();
      expect(retrieved!.tokens.get(token)).toBe(originalValue);
    });

    it('should create session if it does not exist', () => {
      const sessionId = 'test-session-1';
      const token = 'EMAIL_a1b2c3d4' as Token;
      const originalValue = 'test@example.com';

      sessionManager.addToken(sessionId, token, originalValue);

      const retrieved = sessionManager.getSession(sessionId);
      expect(retrieved).toBeDefined();
      expect(retrieved!.tokens.get(token)).toBe(originalValue);
    });
  });

  describe('getTokens', () => {
    it('should return all tokens for a session', () => {
      const sessionId = 'test-session-1';
      const token1 = 'EMAIL_a1b2c3d4' as Token;
      const token2 = 'PHONE_e5f6g7h8' as Token;
      const value1 = 'test@example.com';
      const value2 = '555-1234';

      sessionManager.addToken(sessionId, token1, value1);
      sessionManager.addToken(sessionId, token2, value2);

      const tokens = sessionManager.getTokens(sessionId);

      expect(tokens.size).toBe(2);
      expect(tokens.get(token1)).toBe(value1);
      expect(tokens.get(token2)).toBe(value2);
    });

    it('should return empty map for non-existent session', () => {
      const tokens = sessionManager.getTokens('non-existent');
      expect(tokens.size).toBe(0);
    });
  });

  describe('getToken', () => {
    it('should return a specific token', () => {
      const sessionId = 'test-session-1';
      const token = 'EMAIL_a1b2c3d4' as Token;
      const originalValue = 'test@example.com';

      sessionManager.addToken(sessionId, token, originalValue);

      const retrieved = sessionManager.getToken(sessionId, token);
      expect(retrieved).toBe(originalValue);
    });

    it('should return undefined for non-existent token', () => {
      const sessionId = 'test-session-1';
      const token = 'EMAIL_a1b2c3d4' as Token;

      const retrieved = sessionManager.getToken(sessionId, token);
      expect(retrieved).toBeUndefined();
    });
  });

  describe('hasToken', () => {
    it('should return true for existing token', () => {
      const sessionId = 'test-session-1';
      const token = 'EMAIL_a1b2c3d4' as Token;
      const originalValue = 'test@example.com';

      sessionManager.addToken(sessionId, token, originalValue);

      expect(sessionManager.hasToken(sessionId, token)).toBe(true);
    });

    it('should return false for non-existent token', () => {
      const sessionId = 'test-session-1';
      const token = 'EMAIL_a1b2c3d4' as Token;

      expect(sessionManager.hasToken(sessionId, token)).toBe(false);
    });
  });

  describe('cleanupExpiredSessions', () => {
    it('should remove expired sessions', () => {
      const ttlMs = 100;
      const shortTtlManager = new SessionManager({ ttlMs });

      const session1 = shortTtlManager.createSession('session-1');
      const session2 = shortTtlManager.createSession('session-2');

      expect(shortTtlManager.getSessionCount()).toBe(2);

      // Wait for expiry
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          const cleaned = shortTtlManager.cleanupExpiredSessions();

          expect(cleaned).toBe(2);
          expect(shortTtlManager.getSessionCount()).toBe(0);
          expect(shortTtlManager.getSession('session-1')).toBeUndefined();
          expect(shortTtlManager.getSession('session-2')).toBeUndefined();
          resolve();
        }, 150);
      });
    });

    it('should not remove active sessions', () => {
      const ttlMs = 1000;
      const shortTtlManager = new SessionManager({ ttlMs });

      shortTtlManager.createSession('session-1');
      shortTtlManager.createSession('session-2');

      const cleaned = shortTtlManager.cleanupExpiredSessions();

      expect(cleaned).toBe(0);
      expect(shortTtlManager.getSessionCount()).toBe(2);
    });
  });

  describe('evictOldestSession', () => {
    it('should evict the oldest session when at capacity', () => {
      const maxSessions = 3;
      const limitedManager = new SessionManager({ maxSessions });

      limitedManager.createSession('session-1');
      limitedManager.createSession('session-2');
      limitedManager.createSession('session-3');

      expect(limitedManager.getSessionCount()).toBe(3);

      limitedManager.createSession('session-4');

      expect(limitedManager.getSessionCount()).toBe(3);
      expect(limitedManager.getSession('session-1')).toBeUndefined();
      expect(limitedManager.getSession('session-2')).toBeDefined();
      expect(limitedManager.getSession('session-3')).toBeDefined();
      expect(limitedManager.getSession('session-4')).toBeDefined();
    });

    it('should return true when session evicted', () => {
      const maxSessions = 1;
      const limitedManager = new SessionManager({ maxSessions });

      limitedManager.createSession('session-1');
      const evicted = limitedManager.evictOldestSession();

      expect(evicted).toBe(true);
      expect(limitedManager.getSessionCount()).toBe(0);
    });

    it('should return false when no sessions to evict', () => {
      const evicted = sessionManager.evictOldestSession();
      expect(evicted).toBe(false);
    });
  });

  describe('getSessionCount', () => {
    it('should return the number of active sessions', () => {
      expect(sessionManager.getSessionCount()).toBe(0);

      sessionManager.createSession('session-1');
      expect(sessionManager.getSessionCount()).toBe(1);

      sessionManager.createSession('session-2');
      expect(sessionManager.getSessionCount()).toBe(2);

      sessionManager.clearSession('session-1');
      expect(sessionManager.getSessionCount()).toBe(1);
    });
  });

  describe('getAllSessions', () => {
    it('should return all active sessions', () => {
      sessionManager.createSession('session-1');
      sessionManager.createSession('session-2');
      sessionManager.createSession('session-3');

      const sessions = sessionManager.getAllSessions();

      expect(sessions).toHaveLength(3);
      expect(sessions.every(s => s.sessionId)).toBe(true);
    });

    it('should return empty array when no sessions exist', () => {
      const sessions = sessionManager.getAllSessions();
      expect(sessions).toHaveLength(0);
    });
  });

  describe('clearAllSessions', () => {
    it('should remove all sessions', () => {
      sessionManager.createSession('session-1');
      sessionManager.createSession('session-2');
      sessionManager.createSession('session-3');

      expect(sessionManager.getSessionCount()).toBe(3);

      sessionManager.clearAllSessions();

      expect(sessionManager.getSessionCount()).toBe(0);
      expect(sessionManager.getSession('session-1')).toBeUndefined();
    });
  });

  // BUG-042 regression: multi-turn conversations must not lose prior tokens
  describe('getOrCreateSession (BUG-042)', () => {
    it('second turn with same sessionId reuses existing session and retains tokens from first turn', () => {
      const sessionId = 'multi-turn-session';
      const token1 = 'EMAIL_aabbccdd' as Token;
      const originalValue = 'alice@example.com';

      // Simulate first turn: session created and a token stored
      sessionManager.addToken(sessionId, token1, originalValue);
      expect(sessionManager.hasToken(sessionId, token1)).toBe(true);

      // Simulate second turn: hook calls getOrCreateSession again
      const ctx = sessionManager.getOrCreateSession(sessionId);

      // Must return the same session — token from turn 1 must still be present
      expect(ctx.sessionId).toBe(sessionId);
      expect(ctx.tokens.get(token1)).toBe(originalValue);
      expect(sessionManager.getSessionCount()).toBe(1);
    });

    it('createSession on expired session creates a fresh session', () => {
      const sessionId = 'expiring-session';
      const shortTtlManager = new SessionManager({ ttlMs: 50, cleanupIntervalMs: 60_000 });
      try {
        const token = 'SSN_deadbeef' as Token;
        shortTtlManager.addToken(sessionId, token, '123-45-6789');

        return new Promise<void>((resolve) => {
          setTimeout(() => {
            // After TTL the old session is gone; createSession makes a new one
            const fresh = shortTtlManager.createSession(sessionId);
            expect(fresh.tokens.size).toBe(0);
            resolve();
          }, 100);
        });
      } finally {
        shortTtlManager.destroy();
      }
    });
  });

  // BUG-052 regression: destroy() clears the background cleanup interval
  describe('destroy (BUG-052)', () => {
    it('destroy() clears the interval without throwing', () => {
      const manager = new SessionManager({ cleanupIntervalMs: 60_000 });
      expect(() => manager.destroy()).not.toThrow();
    });

    it('destroy() is idempotent — calling it twice does not throw', () => {
      const manager = new SessionManager({ cleanupIntervalMs: 60_000 });
      manager.destroy();
      expect(() => manager.destroy()).not.toThrow();
    });
  });
});
