import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { VaultError, EncryptionError, KeyDerivationError } from './errors.js';
import { VaultAuditDetails } from './types.js';
import { getGlobalAuditLogger } from './audit.js';
import { secureRandomBytes } from './security.js';

// Web Crypto API types
type CryptoKey = Awaited<ReturnType<typeof crypto.subtle.deriveKey>>;

const MAX_VAULT_PATH_LENGTH = 4096;
const ALLOWED_VAULT_BASES = [
  path.join(process.env.HOME || process.cwd(), '.openclaw/modguard'),
  ':memory:'
];

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

class RateLimiter {
  private requests: Map<string, RateLimitEntry>;

  constructor(
    private maxRequests: number,
    private windowMs: number
  ) {
    this.requests = new Map();
  }

  allow(key: string): boolean {
    const now = Date.now();
    const entry = this.requests.get(key);

    if (!entry || now > entry.resetTime) {
      this.requests.set(key, { count: 1, resetTime: now + this.windowMs });
      return true;
    }

    if (entry.count >= this.maxRequests) {
      return false;
    }

    entry.count++;
    return true;
  }

  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.requests.entries()) {
      if (now > entry.resetTime) {
        this.requests.delete(key);
      }
    }
  }
}

function validateVaultPath(vaultPath: string): void {
  if (!vaultPath || typeof vaultPath !== 'string') {
    throw new VaultError('vaultPath must be a non-empty string', 'INVALID_PATH');
  }

  if (vaultPath.length > MAX_VAULT_PATH_LENGTH) {
    throw new VaultError('vaultPath exceeds maximum length', 'INVALID_PATH');
  }

  if (vaultPath !== ':memory:') {
    const absolutePath = path.resolve(vaultPath);

    if (absolutePath.includes('~') && !absolutePath.startsWith(process.env.HOME || '')) {
      throw new VaultError('vaultPath cannot contain tilde outside home directory', 'INVALID_PATH');
    }

    const isAllowed = ALLOWED_VAULT_BASES.some(base =>
      absolutePath === base || absolutePath.startsWith(base + path.sep)
    );

    if (!isAllowed) {
      throw new VaultError('vaultPath must be within allowed directories', 'INVALID_PATH');
    }

    const parentDir = path.dirname(absolutePath);
    try {
      fs.accessSync(parentDir, fs.constants.W_OK);
    } catch {
      throw new VaultError(`Cannot write to vault directory: ${parentDir}`, 'PATH_NOT_WRITABLE');
    }
  }
}


interface VaultEntry {
  id: number;
  token: string;
  category: string;
  encrypted_value: Buffer;
  iv: Buffer;
  auth_tag: Buffer;
  salt: Buffer;
  created_at: number;
  expires_at: number | null;
}

interface StoreOptions {
  ttl?: number;
}

export class Vault {
  private db: Database.Database;
  // BUG-041: masterKey is cleared after key derivation to allow GC; undefined means already consumed
  private masterKey: string | undefined;
  private vaultPath: string;
  private currentSessionId: string;
  private retrieveLimiter: RateLimiter;
  private storeLimiter: RateLimiter;
  private derivedKey: CryptoKey | null = null;
  private keyDerivationPromise: Promise<CryptoKey> | null = null;

  constructor(vaultPath: string, masterKey: string) {
    validateVaultPath(vaultPath);

    if (!masterKey || masterKey.length < 64) {
      throw new VaultError('Master key must be at least 32 bytes (64 hex chars)', 'INVALID_KEY');
    }

    this.vaultPath = vaultPath;
    this.masterKey = masterKey;
    this.currentSessionId = 'default';

    this.retrieveLimiter = new RateLimiter(100, 60000);
    this.storeLimiter = new RateLimiter(1000, 60000);

    this.db = new Database(vaultPath);

    // Skip chmod for in-memory databases
    if (vaultPath !== ':memory:') {
      fs.chmodSync(vaultPath, 0o600);
    }

    this.initializeDatabase();

    this.cleanupExpired();

    // Start key derivation immediately (async, but don't block constructor)
    this.keyDerivationPromise = this.deriveKeyOnce();
  }

  // BUG-040: Get or create a per-vault random salt stored in vault_meta table.
  // This ensures two deployments with the same master key derive different AES-256 keys.
  private getOrCreateVaultSalt(): Buffer {
    const row = this.db
      .prepare("SELECT value FROM vault_meta WHERE key = 'vault_salt'")
      .get() as { value: string } | undefined;

    if (row) {
      return Buffer.from(row.value, 'hex');
    }

    // First-time vault creation: generate and persist a random 32-byte salt
    const salt = secureRandomBytes(32);
    this.db
      .prepare("INSERT INTO vault_meta (key, value) VALUES ('vault_salt', ?)")
      .run(salt.toString('hex'));
    return salt;
  }

  private async deriveKeyOnce(): Promise<CryptoKey> {
    if (this.derivedKey) {
      return this.derivedKey;
    }

    // BUG-041: masterKey may already be cleared if deriveKeyOnce is called twice
    if (!this.masterKey) {
      throw new KeyDerivationError('Master key has already been consumed; create a new Vault instance', {});
    }

    try {
      // BUG-040: Use per-vault random salt from the database
      const vaultSalt = this.getOrCreateVaultSalt();

      const encoder = new TextEncoder();
      const keyMaterial = await crypto.subtle.importKey(
        'raw',
        encoder.encode(this.masterKey),
        'PBKDF2',
        false,
        ['deriveBits', 'deriveKey']
      );

      this.derivedKey = await crypto.subtle.deriveKey(
        {
          name: 'PBKDF2',
          salt: vaultSalt,
          iterations: 100000,
          hash: 'SHA-256'
        },
        keyMaterial,
        {
          name: 'AES-GCM',
          length: 256
        },
        false,
        ['encrypt', 'decrypt']
      );

      // BUG-041: Clear the master key reference after successful derivation to allow GC.
      // Strings are immutable in JS so we cannot zero the underlying memory, but releasing
      // the reference makes the string eligible for collection.
      this.masterKey = undefined;

      return this.derivedKey;
    } catch (err) {
      // BUG-039: Never propagate raw exception objects in context — extract message only
      throw new KeyDerivationError('Failed to derive encryption key', {
        reason: err instanceof Error ? err.message : 'unknown',
      });
    }
  }

  private async getKey(): Promise<CryptoKey> {
    if (this.derivedKey) {
      return this.derivedKey;
    }
    if (this.keyDerivationPromise) {
      return this.keyDerivationPromise;
    }
    return this.deriveKeyOnce();
  }

  /**
   * Wait for key derivation to complete.
   * Call this before performance-critical operations to avoid cold-start latency.
   */
  async ensureReady(): Promise<void> {
    await this.getKey();
  }

  setSessionId(sessionId: string): void {
    this.currentSessionId = sessionId;
  }

  getSessionId(): string {
    return this.currentSessionId;
  }

  private initializeDatabase(): void {
    // BUG-040: vault_meta stores per-vault random salt (and any future metadata)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS vault_meta (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token TEXT NOT NULL,
        category TEXT NOT NULL,
        encrypted_value BLOB NOT NULL,
        iv BLOB NOT NULL,
        auth_tag BLOB NOT NULL,
        salt BLOB NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER,
        UNIQUE(token, category)
      )
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_entries_token ON entries(token)
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_entries_category ON entries(category)
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_entries_expires_at ON entries(expires_at)
    `);
  }

  // Legacy method for backwards compatibility with entries that used per-entry salt
  private async deriveKeyLegacy(salt: Buffer): Promise<CryptoKey> {
    // BUG-041: masterKey may be undefined after primary derivation; legacy path only used
    // for old entries that pre-date per-vault salt migration — if masterKey is gone we
    // cannot re-derive, so throw a clear error.
    if (!this.masterKey) {
      throw new KeyDerivationError('Cannot derive legacy key: master key already consumed', {});
    }

    try {
      const encoder = new TextEncoder();
      const keyMaterial = await crypto.subtle.importKey(
        'raw',
        encoder.encode(this.masterKey),
        'PBKDF2',
        false,
        ['deriveBits', 'deriveKey']
      );

      return await crypto.subtle.deriveKey(
        {
          name: 'PBKDF2',
          salt: salt,
          iterations: 100000,
          hash: 'SHA-256'
        },
        keyMaterial,
        {
          name: 'AES-GCM',
          length: 256
        },
        false,
        ['encrypt', 'decrypt']
      );
    } catch (err) {
      // BUG-039: Never propagate raw exception objects — extract message only
      throw new KeyDerivationError('Failed to derive encryption key', {
        reason: err instanceof Error ? err.message : 'unknown',
      });
    }
  }

  // BUG-039: key typed as CryptoKey (not any); error context contains only message string
  private async encrypt(value: string, key: CryptoKey): Promise<{ encrypted: Buffer; iv: Buffer; authTag: Buffer }> {
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(value);

      const iv = secureRandomBytes(12);

      const encrypted = await crypto.subtle.encrypt(
        {
          name: 'AES-GCM',
          iv: iv
        },
        key,
        data
      );

      const encryptedBuffer = Buffer.from(encrypted);

      const authTagLength = 16;
      const ciphertextLength = encryptedBuffer.length - authTagLength;

      const ciphertext = encryptedBuffer.subarray(0, ciphertextLength);
      const authTag = encryptedBuffer.subarray(ciphertextLength);

      return {
        encrypted: ciphertext,
        iv: iv,
        authTag: authTag
      };
    } catch (err) {
      // BUG-039: Never place raw error object in context — extract message string only
      throw new EncryptionError('Failed to encrypt data', {
        reason: err instanceof Error ? err.message : 'unknown',
      });
    }
  }

  // BUG-039: key typed as CryptoKey (not any); error context contains only message string
  private async decrypt(encrypted: Buffer, iv: Buffer, authTag: Buffer, key: CryptoKey): Promise<string> {
    try {
      const combined = Buffer.concat([encrypted, authTag]);

      const decrypted = await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: iv
        },
        key,
        combined
      );

      const decoder = new TextDecoder();
      return decoder.decode(decrypted);
    } catch (err) {
      // BUG-039: Never place raw error object in context — extract message string only
      throw new EncryptionError('Failed to decrypt data', {
        reason: err instanceof Error ? err.message : 'unknown',
      });
    }
  }

  async store(token: string, category: string, value: string, options?: StoreOptions): Promise<number> {
    const startTime = Date.now();

    const limiterKey = `store:${category}`;
    if (!this.storeLimiter.allow(limiterKey)) {
      throw new VaultError('Rate limit exceeded for store operations', 'RATE_LIMIT_EXCEEDED');
    }

    // Use cached key (fast path)
    const key = await this.getKey();

    const { encrypted, iv, authTag } = await this.encrypt(value, key);

    const now = Date.now();
    const expiresAt = options?.ttl ? now + options.ttl : null;

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO entries (token, category, encrypted_value, iv, auth_tag, salt, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // BUG-040: Store a zero-length sentinel in the salt column for vault-level-key entries.
    // Legacy entries have a non-empty per-entry salt in this column.
    const result = stmt.run(token, category, encrypted, iv, authTag, Buffer.alloc(0), now, expiresAt);

    const elapsed = Date.now() - startTime;

    const auditLogger = getGlobalAuditLogger();
    if (auditLogger) {
      const details: VaultAuditDetails = {
        vaultOperation: 'store',
        category,
        entryCount: 1
      };
      void auditLogger.log({
        operation: 'vault_store',
        sessionId: this.currentSessionId,
        level: 'info',
        success: true,
        duration: elapsed,
        details
      });
    }

    return result.lastInsertRowid as number;
  }

  async retrieve(token: string, category: string): Promise<string | null> {
    const startTime = Date.now();

    const limiterKey = `retrieve:${token}`;
    if (!this.retrieveLimiter.allow(limiterKey)) {
      throw new VaultError('Rate limit exceeded for retrieve operations', 'RATE_LIMIT_EXCEEDED');
    }

    const row = this.db.prepare(`
      SELECT encrypted_value, iv, auth_tag, salt, expires_at
      FROM entries
      WHERE token = ? AND category = ? AND (expires_at IS NULL OR expires_at > ?)
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `).get(token, category, Date.now()) as VaultEntry | undefined;

    if (!row) {
      const elapsed = Date.now() - startTime;
      const auditLogger = getGlobalAuditLogger();
      if (auditLogger) {
        const details: VaultAuditDetails = {
          vaultOperation: 'retrieve',
          category,
          found: false
        };
        void auditLogger.log({
          operation: 'vault_retrieve',
          sessionId: this.currentSessionId,
          level: 'info',
          success: false,
          duration: elapsed,
          details
        });
      }
      return null;
    }

    try {
      // BUG-040: zero-length salt means entry was encrypted with the vault-level key.
      // Non-empty salt is a legacy per-entry salt — derive a key from it for backwards compat.
      const isLegacyEntry = row.salt.length > 0;
      const key = isLegacyEntry
        ? await this.deriveKeyLegacy(row.salt)
        : await this.getKey();

      const result = await this.decrypt(row.encrypted_value, row.iv, row.auth_tag, key);

      const elapsed = Date.now() - startTime;
      const auditLogger = getGlobalAuditLogger();
      if (auditLogger) {
        const details: VaultAuditDetails = {
          vaultOperation: 'retrieve',
          category,
          found: true
        };
        void auditLogger.log({
          operation: 'vault_retrieve',
          sessionId: this.currentSessionId,
          level: 'info',
          success: true,
          duration: elapsed,
          details
        });
      }

      return result;
    } catch (err) {
      const elapsed = Date.now() - startTime;
      const auditLogger = getGlobalAuditLogger();
      if (auditLogger) {
        const details: VaultAuditDetails = {
          vaultOperation: 'retrieve',
          category,
          found: true,
          reason: 'decryption_failed'
        };
        void auditLogger.log({
          operation: 'vault_retrieve',
          sessionId: this.currentSessionId,
          level: 'error',
          success: false,
          duration: elapsed,
          details
        });
      }
      // BUG-039: sanitize error — never place raw exception in context
      throw new EncryptionError('Failed to decrypt vault entry', {
        reason: err instanceof Error ? err.message : 'unknown',
      });
    }
  }

  cleanupExpired(): number {
    const startTime = Date.now();

    const stmt = this.db.prepare(`
      DELETE FROM entries
      WHERE expires_at IS NOT NULL AND expires_at < ?
    `);

    const result = stmt.run(Date.now());

    const elapsed = Date.now() - startTime;
    const auditLogger = getGlobalAuditLogger();
    if (auditLogger) {
      const details: VaultAuditDetails = {
        vaultOperation: 'cleanup',
        entryCount: result.changes,
        reason: 'expired_entries'
      };
      void auditLogger.log({
        operation: 'vault_cleanup',
        sessionId: this.currentSessionId,
        level: 'info',
        success: true,
        duration: elapsed,
        details
      });
    }

    return result.changes;
  }

  close(): void {
    this.db.close();
  }
}
