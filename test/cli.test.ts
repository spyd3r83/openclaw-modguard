import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Database } from 'better-sqlite3';

describe('CLI Commands', () => {
  const testVaultPath = '/tmp/test-cli-vault.db';
  const testMasterKey = 'test-master-key-123456';

  beforeEach(() => {
    if (fs.existsSync(testVaultPath)) {
      fs.unlinkSync(testVaultPath);
    }
  });

  afterEach(() => {
    if (fs.existsSync(testVaultPath)) {
      fs.unlinkSync(testVaultPath);
    }
  });

  describe('vault list command', () => {
    it('should list all entries in table format', () => {
      createTestVault(testVaultPath, testMasterKey, [
        { token: 'EMAIL_12345678', category: 'email', created_at: Date.now() - 3600000 },
        { token: 'PHONE_87654321', category: 'phone', created_at: Date.now() - 7200000 }
      ]);

      const result = execCLI(['vault', 'list', '--format', 'table']);
      expect(result.stdout).toContain('EMAIL_12345678');
      expect(result.stdout).toContain('PHONE_87654321');
      expect(result.stderr).toBe('');
      expect(result.status).toBe(0);
    });

    it('should list entries in JSON format', () => {
      createTestVault(testVaultPath, testMasterKey, [
        { token: 'EMAIL_12345678', category: 'email', created_at: Date.now() }
      ]);

      const result = execCLI(['vault', 'list', '--format', 'json']);
      const json = JSON.parse(result.stdout);
      expect(Array.isArray(json)).toBe(true);
      expect(json[0].Token).toBe('EMAIL_12345678');
      expect(result.status).toBe(0);
    });

    it('should filter by category', () => {
      createTestVault(testVaultPath, testMasterKey, [
        { token: 'EMAIL_12345678', category: 'email', created_at: Date.now() },
        { token: 'PHONE_87654321', category: 'phone', created_at: Date.now() }
      ]);

      const result = execCLI(['vault', 'list', '--category', 'email', '--format', 'json']);
      const json = JSON.parse(result.stdout);
      expect(json.length).toBe(1);
      expect(json[0].Token).toBe('EMAIL_12345678');
      expect(result.status).toBe(0);
    });

    it('should filter by older-than', () => {
      const oldTime = Date.now() - 86400000;
      createTestVault(testVaultPath, testMasterKey, [
        { token: 'EMAIL_12345678', category: 'email', created_at: oldTime },
        { token: 'PHONE_87654321', category: 'phone', created_at: Date.now() }
      ]);

      const result = execCLI(['vault', 'list', '--older-than', '24h', '--format', 'json']);
      const json = JSON.parse(result.stdout);
      expect(json.length).toBe(1);
      expect(json[0].Token).toBe('EMAIL_12345678');
      expect(result.status).toBe(0);
    });

    it('should handle pagination with limit and offset', () => {
      createTestVault(testVaultPath, testMasterKey, [
        { token: 'EMAIL_12345678', category: 'email', created_at: Date.now() },
        { token: 'EMAIL_87654321', category: 'email', created_at: Date.now() - 1000 },
        { token: 'EMAIL_11112222', category: 'email', created_at: Date.now() - 2000 }
      ]);

      const result = execCLI(['vault', 'list', '--limit', '1', '--offset', '1', '--format', 'json']);
      const json = JSON.parse(result.stdout);
      expect(json.length).toBe(1);
      expect(json[0].Token).toBe('EMAIL_87654321');
      expect(result.status).toBe(0);
    });

    it('should return message for empty vault', () => {
      createTestVault(testVaultPath, testMasterKey, []);

      const result = execCLI(['vault', 'list']);
      expect(result.stdout).toContain('No vault entries found');
      expect(result.status).toBe(0);
    });
  });

  describe('vault lookup command', () => {
    it('should look up an existing token', () => {
      createTestVault(testVaultPath, testMasterKey, [
        { token: 'EMAIL_12345678', category: 'email', created_at: Date.now() }
      ]);

      const result = execCLI(['vault', 'lookup', 'EMAIL_12345678', '--format', 'json']);
      const json = JSON.parse(result.stdout);
      expect(json.Token).toBe('EMAIL_12345678');
      expect(json.Found).toBe(true);
      expect(result.status).toBe(0);
    });

    it('should error for non-existent token', () => {
      createTestVault(testVaultPath, testMasterKey, []);

      const result = execCLI(['vault', 'lookup', 'EMAIL_99999999']);
      expect(result.stderr).toContain('not found in vault');
      expect(result.status).not.toBe(0);
    });

    it('should error for invalid token format', () => {
      const result = execCLI(['vault', 'lookup', 'INVALID_TOKEN']);
      expect(result.stderr).toContain('Invalid token format');
      expect(result.status).not.toBe(0);
    });

    it('should error for missing token argument', () => {
      const result = execCLI(['vault', 'lookup']);
      expect(result.stderr).toContain('Token is required');
      expect(result.status).not.toBe(0);
    });
  });

  describe('vault stats command', () => {
    it('should display vault statistics', () => {
      createTestVault(testVaultPath, testMasterKey, [
        { token: 'EMAIL_12345678', category: 'email', created_at: Date.now() },
        { token: 'PHONE_87654321', category: 'phone', created_at: Date.now() - 3600000 }
      ]);

      const result = execCLI(['vault', 'stats']);
      expect(result.stdout).toContain('Vault Statistics');
      expect(result.stdout).toContain('Total Entries: 2');
      expect(result.status).toBe(0);
    });

    it('should output stats in JSON format', () => {
      createTestVault(testVaultPath, testMasterKey, [
        { token: 'EMAIL_12345678', category: 'email', created_at: Date.now() }
      ]);

      const result = execCLI(['vault', 'stats', '--format', 'json']);
      const json = JSON.parse(result.stdout);
      expect(json['Total Entries']).toBe(1);
      expect(result.status).toBe(0);
    });
  });

  describe('vault prune command', () => {
    it('should show dry-run results without deleting', () => {
      const expiredTime = Date.now() - 86400000;
      createTestVault(testVaultPath, testMasterKey, [
        { token: 'EMAIL_12345678', category: 'email', created_at: expiredTime, expires_at: expiredTime },
        { token: 'PHONE_87654321', category: 'phone', created_at: Date.now() }
      ]);

      const result = execCLI(['vault', 'prune', '--dry-run']);
      expect(result.stdout).toContain('1 expired entries');
      expect(result.stdout).toContain('[Dry-run mode]');
      expect(result.status).toBe(0);
    });

    it('should delete expired entries with --force', () => {
      const expiredTime = Date.now() - 86400000;
      createTestVault(testVaultPath, testMasterKey, [
        { token: 'EMAIL_12345678', category: 'email', created_at: expiredTime, expires_at: expiredTime },
        { token: 'PHONE_87654321', category: 'phone', created_at: Date.now() }
      ]);

      const result = execCLI(['vault', 'prune', '--force']);
      expect(result.stdout).toContain('Deleted 1 expired entries');
      expect(result.stdout).toContain('[AUDIT] Vault prune operation completed');
      expect(result.status).toBe(0);
    });

    it('should handle no expired entries', () => {
      createTestVault(testVaultPath, testMasterKey, [
        { token: 'EMAIL_12345678', category: 'email', created_at: Date.now() }
      ]);

      const result = execCLI(['vault', 'prune', '--dry-run']);
      expect(result.stdout).toContain('No expired entries to prune');
      expect(result.status).toBe(0);
    });
  });

  describe('output formatting', () => {
    it('should support table format', () => {
      createTestVault(testVaultPath, testMasterKey, [
        { token: 'EMAIL_12345678', category: 'email', created_at: Date.now() }
      ]);

      const result = execCLI(['vault', 'list', '--format', 'table']);
      expect(result.stdout).toContain('|');
      expect(result.stdout).toContain('EMAIL_12345678');
      expect(result.status).toBe(0);
    });

    it('should support JSON format', () => {
      createTestVault(testVaultPath, testMasterKey, [
        { token: 'EMAIL_12345678', category: 'email', created_at: Date.now() }
      ]);

      const result = execCLI(['vault', 'list', '--format', 'json']);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
      expect(result.status).toBe(0);
    });

    it('should support CSV format', () => {
      createTestVault(testVaultPath, testMasterKey, [
        { token: 'EMAIL_12345678', category: 'email', created_at: Date.now() }
      ]);

      const result = execCLI(['vault', 'list', '--format', 'csv']);
      expect(result.stdout).toContain('EMAIL_12345678');
      expect(result.stdout.split('\n').length).toBeGreaterThan(1);
      expect(result.status).toBe(0);
    });
  });

  describe('error handling', () => {
    it('should show help for invalid command', () => {
      const result = execCLI(['invalid-command']);
      expect(result.stderr).toContain('Please specify a command');
      expect(result.status).not.toBe(0);
    });

    it('should show help for --help flag', () => {
      const result = execCLI(['--help']);
      expect(result.stdout).toContain('Manage vault operations');
      expect(result.status).toBe(0);
    });
  });

  describe('performance', () => {
    it('should list 50 entries in acceptable time (<500ms)', () => {
      const entries = Array.from({ length: 50 }, (_, i) => ({
        token: `EMAIL_${String(i).padStart(8, '0')}`,
        category: 'email',
        created_at: Date.now() - i * 1000
      }));

      createTestVault(testVaultPath, testMasterKey, entries);

      const startTime = Date.now();
      const result = execCLI(['vault', 'list', '--limit', '50']);
      const elapsed = Date.now() - startTime;

      expect(result.status).toBe(0);
      expect(elapsed).toBeLessThan(500);
    });

    it('should lookup token in acceptable time (<50ms)', () => {
      createTestVault(testVaultPath, testMasterKey, [
        { token: 'EMAIL_12345678', category: 'email', created_at: Date.now() }
      ]);

      const startTime = Date.now();
      const result = execCLI(['vault', 'lookup', 'EMAIL_12345678']);
      const elapsed = Date.now() - startTime;

      expect(result.status).toBe(0);
      expect(elapsed).toBeLessThan(50);
    });

    it('should get stats in acceptable time (<100ms)', () => {
      const entries = Array.from({ length: 100 }, (_, i) => ({
        token: `EMAIL_${String(i).padStart(8, '0')}`,
        category: 'email',
        created_at: Date.now() - i * 1000
      }));

      createTestVault(testVaultPath, testMasterKey, entries);

      const startTime = Date.now();
      const result = execCLI(['vault', 'stats']);
      const elapsed = Date.now() - startTime;

      expect(result.status).toBe(0);
      expect(elapsed).toBeLessThan(100);
    });
  });
});

interface TestVaultEntry {
  token: string;
  category: string;
  created_at: number;
  expires_at?: number;
}

function createTestVault(vaultPath: string, masterKey: string, entries: TestVaultEntry[]): void {
  const db = new Database(vaultPath);
  db.exec(`
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

  const stmt = db.prepare(`
    INSERT INTO entries (token, category, encrypted_value, iv, auth_tag, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  for (const entry of entries) {
    const encryptedValue = Buffer.from('encrypted-value', 'utf8');
    const iv = Buffer.from('iv-placeholder', 'utf8');
    const authTag = Buffer.from('auth-tag-placeholder', 'utf8');
    stmt.run(entry.token, entry.category, encryptedValue, iv, authTag, entry.created_at, entry.expires_at || null);
  }

  db.close();
}

function execCLI(args: string[]): { stdout: string; stderr: string; status: number | null } {
  try {
    const stdout = execSync(`node ${path.join(process.cwd(), 'dist/cli/index.js')} ${args.join(' ')}`, {
      encoding: 'utf8',
      env: {
        ...process.env,
        GUARD_VAULT_PATH: '/tmp/test-cli-vault.db',
        GUARD_MASTER_KEY: 'test-master-key-123456'
      }
    });
    return { stdout: stdout as string, stderr: '', status: 0 };
  } catch (error: any) {
    return {
      stdout: error.stdout || '',
      stderr: error.stderr || error.message,
      status: error.status || 1
    };
  }
}
