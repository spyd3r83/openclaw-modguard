import type { Token } from './tokenizer.js';

const DEFAULT_SESSION_TTL_MS = 30 * 60 * 1000;
const MAX_SESSIONS = 1000;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

export interface SessionContext {
  sessionId: string;
  tokens: Map<Token, string>;
  createdAt: Date;
  lastAccessedAt: Date;
}

export interface SessionManagerOptions {
  ttlMs?: number;
  maxSessions?: number;
  cleanupIntervalMs?: number;
}

export class SessionManager {
  private sessions: Map<string, SessionContext>;
  private ttlMs: number;
  private maxSessions: number;
  private cleanupTimer: ReturnType<typeof setInterval> | null;

  constructor(options?: SessionManagerOptions) {
    this.sessions = new Map();
    this.ttlMs = options?.ttlMs ?? DEFAULT_SESSION_TTL_MS;
    this.maxSessions = options?.maxSessions ?? MAX_SESSIONS;
    this.cleanupTimer = null;

    const intervalMs = options?.cleanupIntervalMs ?? CLEANUP_INTERVAL_MS;
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredSessions();
    }, intervalMs);
    // Do not prevent Node.js from exiting when only this timer remains
    this.cleanupTimer.unref();
  }

  /**
   * Returns the existing non-expired session if one already exists for the
   * given ID, otherwise creates and stores a fresh session.  Callers can
   * therefore treat this as idempotent across multi-turn conversations.
   */
  createSession(sessionId: string): SessionContext {
    // BUG-042 fix: return existing, non-expired session instead of clobbering it
    const existing = this.sessions.get(sessionId);
    if (existing) {
      const age = Date.now() - existing.lastAccessedAt.getTime();
      if (age <= this.ttlMs) {
        existing.lastAccessedAt = new Date();
        return existing;
      }
      // Expired — remove it so the count check below is accurate
      this.sessions.delete(sessionId);
    }

    if (this.sessions.size >= this.maxSessions) {
      this.evictOldestSession();
    }

    const context: SessionContext = {
      sessionId,
      tokens: new Map(),
      createdAt: new Date(),
      lastAccessedAt: new Date()
    };

    this.sessions.set(sessionId, context);
    return context;
  }

  /**
   * Alias for createSession with explicit idempotent semantics — preferred
   * for hook code that may be called on every turn of a conversation.
   */
  getOrCreateSession(sessionId: string): SessionContext {
    return this.createSession(sessionId);
  }

  /**
   * Stop the background cleanup interval and null out the reference so the
   * timer cannot fire after shutdown.  Call this when the plugin is torn down.
   */
  destroy(): void {
    if (this.cleanupTimer !== null) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  getSession(sessionId: string): SessionContext | undefined {
    const context = this.sessions.get(sessionId);

    if (!context) {
      return undefined;
    }

    const now = Date.now();
    const age = now - context.lastAccessedAt.getTime();

    if (age > this.ttlMs) {
      this.sessions.delete(sessionId);
      return undefined;
    }

    context.lastAccessedAt = new Date();
    return context;
  }

  clearSession(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }

  addToken(sessionId: string, token: Token, originalValue: string): void {
    let context = this.getSession(sessionId);

    if (!context) {
      context = this.createSession(sessionId);
    }

    context.tokens.set(token, originalValue);
  }

  getTokens(sessionId: string): Map<Token, string> {
    const context = this.getSession(sessionId);
    return context ? new Map(context.tokens) : new Map();
  }

  getToken(sessionId: string, token: Token): string | undefined {
    const context = this.getSession(sessionId);
    return context?.tokens.get(token);
  }

  hasToken(sessionId: string, token: Token): boolean {
    const context = this.getSession(sessionId);
    return context?.tokens.has(token) ?? false;
  }

  cleanupExpiredSessions(): number {
    const now = Date.now();
    const expiredIds: string[] = [];

    for (const [sessionId, context] of this.sessions.entries()) {
      const age = now - context.lastAccessedAt.getTime();
      if (age > this.ttlMs) {
        expiredIds.push(sessionId);
      }
    }

    for (const id of expiredIds) {
      this.sessions.delete(id);
    }

    return expiredIds.length;
  }

  evictOldestSession(): boolean {
    let oldestSessionId: string | null = null;
    let oldestTime = Infinity;

    for (const [sessionId, context] of this.sessions.entries()) {
      if (context.lastAccessedAt.getTime() < oldestTime) {
        oldestTime = context.lastAccessedAt.getTime();
        oldestSessionId = sessionId;
      }
    }

    if (oldestSessionId) {
      return this.sessions.delete(oldestSessionId);
    }

    return false;
  }

  getSessionCount(): number {
    return this.sessions.size;
  }

  getAllSessions(): SessionContext[] {
    return Array.from(this.sessions.values());
  }

  clearAllSessions(): void {
    this.sessions.clear();
  }
}
