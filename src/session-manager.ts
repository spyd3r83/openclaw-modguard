import type { Token } from './tokenizer.js';

const DEFAULT_SESSION_TTL_MS = 30 * 60 * 1000;
const MAX_SESSIONS = 1000;

export interface SessionContext {
  sessionId: string;
  tokens: Map<Token, string>;
  createdAt: Date;
  lastAccessedAt: Date;
}

export interface SessionManagerOptions {
  ttlMs?: number;
  maxSessions?: number;
}

export class SessionManager {
  private sessions: Map<string, SessionContext>;
  private ttlMs: number;
  private maxSessions: number;

  constructor(options?: SessionManagerOptions) {
    this.sessions = new Map();
    this.ttlMs = options?.ttlMs ?? DEFAULT_SESSION_TTL_MS;
    this.maxSessions = options?.maxSessions ?? MAX_SESSIONS;
  }

  createSession(sessionId: string): SessionContext {
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
