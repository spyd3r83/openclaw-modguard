import * as crypto from 'node:crypto';
import { Vault } from './vault.js';
import { PatternType, PatternCategory, MaskAuditDetails, UnmaskAuditDetails } from './types.js';
import { TokenizationError, DetokenizationError, InvalidTokenError } from './errors.js';
import { getGlobalAuditLogger } from './audit.js';

export type SessionId = string;
export type Token = `${Uppercase<PatternType>}_${string}`;

const TOKEN_PREFIXES = new Map<PatternCategory, PatternType[]>([
  [PatternCategory.PII, [PatternType.EMAIL, PatternType.PHONE, PatternType.SSN, PatternType.CREDIT_CARD]],
  [PatternCategory.SECRETS, [PatternType.API_KEY, PatternType.BEARER_TOKEN, PatternType.PEM_BLOCK]],
  [PatternCategory.NETWORK, [PatternType.IPV4, PatternType.IPV6]]
]);

const TOKEN_REGEX = /^([A-Z]+)_([0-9a-f]{8})$/i;

interface SessionKey {
  key: Buffer;
  createdAt: number;
}

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
    const sessionId = crypto.randomBytes(16).toString('hex');
    const sessionKey: SessionKey = {
      key: crypto.randomBytes(32),
      createdAt: Date.now()
    };
    this.sessionKeys.set(sessionId, sessionKey);
    return sessionId;
  }

  async tokenize(value: string, category: PatternType, session: SessionId): Promise<Token> {
    const startTime = Date.now();

    if (!value || value.length === 0) {
      throw new TokenizationError('Value cannot be empty', { session, category });
    }

    const categoryType = this.getCategoryForPattern(category);
    const sessionKey = this.sessionKeys.get(session);

    if (!sessionKey) {
      throw new TokenizationError('Invalid session ID', { session });
    }

    const encoder = new TextEncoder();
    const valueBuffer = encoder.encode(value);
    const categoryBuffer = encoder.encode(category);
    const combined = Buffer.concat([categoryBuffer, valueBuffer]);

    const hmac = crypto.createHmac('sha256', sessionKey.key);
    hmac.update(combined);
    const hash = hmac.digest();

    const hexSuffix = hash.subarray(0, 4).toString('hex');
    const token = `${category.toUpperCase()}_${hexSuffix}` as Token;

    try {
      await this.vault.store(token, categoryType, value);

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

  async detokenize(token: Token, session: SessionId): Promise<string> {
    const startTime = Date.now();

    if (!this.isValidToken(token)) {
      throw new DetokenizationError('Invalid token format', { token, session });
    }

    const [categoryStr] = token.split('_') as [string];
    const category = categoryStr.toLowerCase() as PatternType;
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
    
    if (!allPatternTypes.includes(prefixUpper as PatternType)) {
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
    this.sessionKeys.delete(session);
  }

  clearAllSessions(): void {
    this.sessionKeys.clear();
  }
}

export function isValidToken(token: unknown): token is Token {
  const tokenizer = new Tokenizer(new Vault(':memory:', 'dummy-key'));
  return tokenizer.isValidToken(token);
}

