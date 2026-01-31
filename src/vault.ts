import Database from 'better-sqlite3';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { VaultError, EncryptionError, KeyDerivationError } from './errors.js';
import { VaultAuditDetails } from './types.js';
import { getGlobalAuditLogger } from './audit.js';
import { secureZero, secureRandomBytes } from './security.js';


interface VaultEntry {
  id: number;
  token: string;
  category: string;
  encrypted_value: Buffer;
  iv: Buffer;
  auth_tag: Buffer;
  created_at: number;
  expires_at: number | null;
}

interface StoreOptions {
  ttl?: number;
}

export class Vault {
  private db: Database.Database;
  private masterKey: string;
  private vaultPath: string;
  private currentSessionId: string;

  constructor(vaultPath: string, masterKey: string) {
    this.vaultPath = vaultPath;
    this.masterKey = masterKey;
    this.currentSessionId = 'default';

    this.db = new Database(vaultPath);

    // Skip chmod for in-memory databases
    if (vaultPath !== ':memory:') {
      fs.chmodSync(vaultPath, 0o600);
    }

    this.initializeDatabase();

    this.cleanupExpired();
  }

  setSessionId(sessionId: string): void {
    this.currentSessionId = sessionId;
  }

  getSessionId(): string {
    return this.currentSessionId;
  }

  private initializeDatabase(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token TEXT NOT NULL,
        category TEXT NOT NULL,
        encrypted_value BLOB NOT NULL,
        iv BLOB NOT NULL,
        auth_tag BLOB NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER
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

  private async deriveKey(masterSecret: string, salt: Buffer) {
    try {
      const encoder = new TextEncoder();
      const keyMaterial = await crypto.subtle.importKey(
        'raw',
        encoder.encode(masterSecret),
        'PBKDF2',
        false,
        ['deriveBits', 'deriveKey']
      );

      const derivedKey = await crypto.subtle.deriveKey(
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

      return derivedKey;
    } catch (error) {
      throw new KeyDerivationError('Failed to derive encryption key', {
        error
      });
    }
  }

  private async encrypt(value: string, key: any): Promise<{ encrypted: Buffer; iv: Buffer; authTag: Buffer }> {
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

      const ivLength = 12;
      const authTagLength = 16;
      const ciphertextLength = encryptedBuffer.length - authTagLength;

      const ciphertext = encryptedBuffer.subarray(0, ciphertextLength);
      const authTag = encryptedBuffer.subarray(ciphertextLength);

      return {
        encrypted: ciphertext,
        iv: iv,
        authTag: authTag
      };
    } catch (error) {
      throw new EncryptionError('Failed to encrypt data', {
        error
      });
    }
  }

  private async decrypt(encrypted: Buffer, iv: Buffer, authTag: Buffer, key: any): Promise<string> {
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
    } catch (error) {
      throw new EncryptionError('Failed to decrypt data', {
        error
      });
    }
  }

  async store(token: string, category: string, value: string, options?: StoreOptions): Promise<number> {
    const startTime = Date.now();

    const salt = secureRandomBytes(32);
    try {
      const key = await this.deriveKey(this.masterKey, salt);

      const { encrypted, iv, authTag } = await this.encrypt(value, key);

      const now = Date.now();
      const expiresAt = options?.ttl ? now + options.ttl : null;

      const stmt = this.db.prepare(`
        INSERT INTO entries (token, category, encrypted_value, iv, auth_tag, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      const result = stmt.run(token, category, encrypted, iv, authTag, now, expiresAt);

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
    } finally {
      // Zero out salt after use
      secureZero(salt);
    }
  }

  async retrieve(token: string, category: string): Promise<string | null> {
    const startTime = Date.now();

    const row = this.db.prepare(`
      SELECT encrypted_value, iv, auth_tag, expires_at
      FROM entries
      WHERE token = ? AND category = ? AND (expires_at IS NULL OR expires_at > ?)
      ORDER BY created_at DESC
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

    const salt = secureRandomBytes(32);
    try {
      const key = await this.deriveKey(this.masterKey, salt);

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
    } finally {
      // Zero out salt after use
      secureZero(salt);
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
