import * as crypto from 'node:crypto';
import { Vault } from './vault.js';
import { PatternType, PatternCategory, MaskAuditDetails, UnmaskAuditDetails } from './types.js';
import { TokenizationError, DetokenizationError, InvalidTokenError, VaultError } from './errors.js';
import { getGlobalAuditLogger } from './audit.js';
import { secureZero, secureRandomBytes } from './security.js';

const MAX_VALUE_LENGTH = 10_485_760;

export type SessionId = string;
export type Token = `${Uppercase<PatternType>}_${string}`;

const TOKEN_PREFIXES = new Map<PatternCategory, PatternType[]>([
  [PatternCategory.PII, [PatternType.EMAIL, PatternType.PHONE, PatternType.SSN, PatternType.CREDIT_CARD]],
  [PatternCategory.SECRETS, [PatternType.API_KEY, PatternType.BEARER_TOKEN, PatternType.PEM_BLOCK]],
  [PatternCategory.NETWORK, [PatternType.IPV4, PatternType.IPV6]]
]);

const TOKEN_REGEX = /^([A-Z0-9_]+)_([0-9a-f]{8})$/i;

interface SessionKey {
  key: Buffer;
  createdAt: number;
  expiresAt: number;
}

const MAX_SESSION_AGE = 24 * 60 * 60 * 1000;
const MAX_SESSIONS = 1000;

interface TokenMetadata {
  value: string;
  category: PatternType;
  createdAt: number;
  expiresAt: number | null;
}

export class Tokenizer {
  private vault: Vault;
  private sessionKeys: Map<SessionId, SessionKey>;

  constructor(vault: Vault) {
    this.vault = vault;
    this.sessionKeys = new Map();
  }

  generateSessionId(): SessionId {
    if (this.sessionKeys.size >= MAX_SESSIONS) {
      this.evictOldestSession();
    }

    const sessionId = secureRandomBytes(16).toString('hex');
    const sessionKey: SessionKey = {
      key: secureRandomBytes(32),
      createdAt: Date.now(),
      expiresAt: Date.now() + MAX_SESSION_AGE
    };
    this.sessionKeys.set(sessionId, sessionKey);
    return sessionId;
  }

  private evictOldestSession(): void {
    let oldestSessionId: SessionId | null = null;
    let oldestTime = Infinity;

    for (const [sessionId, sessionKey] of this.sessionKeys.entries()) {
      if (sessionKey.createdAt < oldestTime) {
        oldestTime = sessionKey.createdAt;
        oldestSessionId = sessionId;
      }
    }

    if (oldestSessionId) {
      const sessionKey = this.sessionKeys.get(oldestSessionId);
      if (sessionKey) {
        secureZero(sessionKey.key);
      }
      this.sessionKeys.delete(oldestSessionId);
    }
  }

  async tokenize(value: string, category: PatternType, session: SessionId): Promise<Token> {
    const startTime = Date.now();

    if (!value || value.length === 0) {
      throw new TokenizationError('Value cannot be empty', { session, category });
    }

    if (value.length > MAX_VALUE_LENGTH) {
      throw new VaultError('Value exceeds maximum allowed length', 'VALUE_TOO_LARGE');
    }

    if (!this.isValidSession(session)) {
      throw new TokenizationError('Invalid or expired session ID', { session });
    }

    const sessionKey = this.sessionKeys.get(session)!;

    const encoder = new TextEncoder();
    const valueBuffer = encoder.encode(value);
    const categoryBuffer = encoder.encode(category);
    const combined = Buffer.concat([categoryBuffer, valueBuffer]);

    const hmac = crypto.createHmac('sha256', sessionKey.key);
    hmac.update(combined);
    const hash = hmac.digest();

    const hexSuffix = hash.subarray(0, 4).toString('hex');
    const token = `${category.toUpperCase()}_${hexSuffix}` as Token;

    // Zero out HMAC digest after extracting the token suffix
    secureZero(hash);

    try {
      await this.vault.store(token, category, value);

      const elapsed = Date.now() - startTime;
      if (elapsed > 5) {
        console.warn(`Tokenize took ${elapsed}ms (target <1ms)`);
      }

      const auditLogger = getGlobalAuditLogger();
      if (auditLogger) {
        const details: MaskAuditDetails = {
          category,
          tokenCount: 1,
          categories: { [category]: 1 }
        };
        void auditLogger.log({
          operation: 'mask',
          sessionId: session,
          level: 'info',
          success: true,
          duration: elapsed,
          details
        });
      }

      return token;
    } catch (error) {
      const elapsed = Date.now() - startTime;
      const auditLogger = getGlobalAuditLogger();
      if (auditLogger) {
        const details: MaskAuditDetails = {
          category,
          tokenCount: 0,
          categories: {}
        };
        void auditLogger.log({
          operation: 'mask',
          sessionId: session,
          level: 'error',
          success: false,
          duration: elapsed,
          details
        });
      }
      throw error;
    }
  }

  async tokenizeBatch(values: string[], category: PatternType, session: SessionId): Promise<Token[]> {
    if (!values || values.length === 0) {
      return [];
    }

    const tokens: Token[] = [];
    
    for (const value of values) {
      const token = await this.tokenize(value, category, session);
      tokens.push(token);
    }

    return tokens;
  }

  isValidSession(sessionId: SessionId): boolean {
    const sessionKey = this.sessionKeys.get(sessionId);
    if (!sessionKey) return false;
    if (Date.now() > sessionKey.expiresAt) {
      this.sessionKeys.delete(sessionId);
      return false;
    }
    return true;
  }

  async detokenize(token: Token, session: SessionId): Promise<string> {
    const startTime = Date.now();

    if (!this.isValidToken(token)) {
      throw new DetokenizationError('Invalid token format', { token, session });
    }

    if (!this.isValidSession(session)) {
      throw new DetokenizationError('Invalid or expired session ID', { session });
    }

    const match = TOKEN_REGEX.exec(token);
    if (!match) {
      throw new DetokenizationError('Invalid token format', { token, session });
    }

    const category = match[1].toLowerCase() as PatternType;
    const categoryType = this.getCategoryForPattern(category);

    try {
      const retrieved = await this.vault.retrieve(token, category);

      if (!retrieved) {
        throw new DetokenizationError('Token not found in vault', { token, session });
      }

      const elapsed = Date.now() - startTime;
      if (elapsed > 5) {
        console.warn(`Detokenize took ${elapsed}ms (target <1ms)`);
      }

      const auditLogger = getGlobalAuditLogger();
      if (auditLogger) {
        const details: UnmaskAuditDetails = {
          tokenCount: 1,
          categories: [category]
        };
        void auditLogger.log({
          operation: 'unmask',
          sessionId: session,
          level: 'info',
          success: true,
          duration: elapsed,
          details
        });
      }

      return retrieved;
    } catch (error) {
      const elapsed = Date.now() - startTime;
      const auditLogger = getGlobalAuditLogger();
      if (auditLogger) {
        const details: UnmaskAuditDetails = {
          tokenCount: 0,
          categories: []
        };
        void auditLogger.log({
          operation: 'unmask',
          sessionId: session,
          level: 'error',
          success: false,
          duration: elapsed,
          details
        });
      }
      throw error;
    }
  }

  isValidToken(token: unknown): token is Token {
    if (typeof token !== 'string') {
      return false;
    }

    const match = TOKEN_REGEX.exec(token);
    if (!match) {
      return false;
    }

    const [prefix, hexSuffix] = match.slice(1, 3);

    const prefixUpper = prefix.toUpperCase();
    const allPatternTypes: PatternType[] = [];
    for (const patterns of TOKEN_PREFIXES.values()) {
      allPatternTypes.push(...patterns);
    }

    const validPatternNames = allPatternTypes.map(pt => pt.toString().toUpperCase());
    if (!validPatternNames.includes(prefixUpper)) {
      return false;
    }

    return true;
  }

  private getCategoryForPattern(pattern: PatternType): PatternCategory {
    for (const [category, patterns] of TOKEN_PREFIXES) {
      if (patterns.includes(pattern)) {
        return category;
      }
    }
    throw new TokenizationError('Unknown pattern type', { pattern });
  }

  clearSession(session: SessionId): void {
    const sessionKey = this.sessionKeys.get(session);
    if (sessionKey) {
      secureZero(sessionKey.key);
    }
    this.sessionKeys.delete(session);
  }

  clearAllSessions(): void {
    for (const sessionKey of this.sessionKeys.values()) {
      secureZero(sessionKey.key);
    }
    this.sessionKeys.clear();
  }
}

export function isValidToken(token: unknown): token is Token {
  const tokenizer = new Tokenizer(new Vault(':memory:', 'dummy-key'));
  return tokenizer.isValidToken(token);
}

