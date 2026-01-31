import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import Database from 'better-sqlite3';
import {
  vaultBackup,
  vaultRestore,
  vaultRepair,
  verifyBackup,
  BackupMetadata,
  BackupEntry
} from '../src/backup.js';

describe('Vault Backup', () => {
  let tempDir: string;
  let vaultPath: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vault-backup-test-'));
    vaultPath = path.join(tempDir, 'test-vault.db');

    // Create a test vault with some entries
    const db = new Database(vaultPath);
    db.exec(`
      CREATE TABLE entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token TEXT NOT NULL,
        category TEXT NOT NULL,
        encrypted_value BLOB NOT NULL,
        iv BLOB NOT NULL,
        auth_tag BLOB NOT NULL,
        salt BLOB NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER
      )
    `);
    db.exec('CREATE INDEX idx_entries_token ON entries(token)');
    db.exec('CREATE INDEX idx_entries_category ON entries(category)');

    // Insert test entries
    const stmt = db.prepare(`
      INSERT INTO entries (token, category, encrypted_value, iv, auth_tag, salt, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const now = Date.now();
    stmt.run('EMAIL_12345678', 'email', Buffer.from('encrypted1'), Buffer.alloc(12, 1), Buffer.alloc(16, 2), Buffer.alloc(32, 7), now - 3600000, null);
    stmt.run('PHONE_87654321', 'phone', Buffer.from('encrypted2'), Buffer.alloc(12, 3), Buffer.alloc(16, 4), Buffer.alloc(32, 8), now - 1800000, null);
    stmt.run('SSN_abcdef12', 'ssn', Buffer.from('encrypted3'), Buffer.alloc(12, 5), Buffer.alloc(16, 6), Buffer.alloc(32, 9), now, now + 86400000);

    db.close();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('vaultBackup', () => {
    it('should create a full backup', async () => {
      const backupPath = path.join(tempDir, 'backup.jsonl');
      const result = await vaultBackup(vaultPath, backupPath);

      expect(result.success).toBe(true);
      expect(result.entryCount).toBe(3);
      expect(result.size).toBeGreaterThan(0);
      expect(result.checksum).toMatch(/^[a-f0-9]{64}$/);

      // Verify backup file exists
      const exists = await fs.access(backupPath).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });

    it('should create an incremental backup', async () => {
      const backupPath = path.join(tempDir, 'backup-incremental.jsonl');
      const cutoff = Date.now() - 2000000; // 33 minutes ago

      const result = await vaultBackup(vaultPath, backupPath, {
        incremental: true,
        lastBackupTimestamp: cutoff
      });

      expect(result.success).toBe(true);
      expect(result.entryCount).toBe(2); // Only PHONE and SSN entries
    });

    it('should include correct metadata', async () => {
      const backupPath = path.join(tempDir, 'backup.jsonl');
      await vaultBackup(vaultPath, backupPath);

      const content = await fs.readFile(backupPath, 'utf-8');
      const lines = content.trim().split('\n');
      const metadata = JSON.parse(lines[0]).metadata as BackupMetadata;

      expect(metadata.version).toBe('1.0.0');
      expect(metadata.entryCount).toBe(3);
      expect(metadata.incremental).toBe(false);
      expect(metadata.checksum).toMatch(/^[a-f0-9]{64}$/);
      expect(new Date(metadata.timestamp).getTime()).toBeGreaterThan(0);
    });
  });

  describe('verifyBackup', () => {
    it('should verify a valid backup', async () => {
      const backupPath = path.join(tempDir, 'backup.jsonl');
      await vaultBackup(vaultPath, backupPath);

      const result = await verifyBackup(backupPath);

      expect(result.valid).toBe(true);
      expect(result.entryCount).toBe(3);
      expect(result.metadata?.version).toBe('1.0.0');
    });

    it('should reject backup with missing metadata', async () => {
      const backupPath = path.join(tempDir, 'invalid.jsonl');
      await fs.writeFile(backupPath, '{"entry": {}}\n');

      const result = await verifyBackup(backupPath);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Missing metadata');
    });

    it('should reject backup with wrong entry count', async () => {
      const backupPath = path.join(tempDir, 'backup.jsonl');
      await vaultBackup(vaultPath, backupPath);

      // Modify backup to have wrong count
      let content = await fs.readFile(backupPath, 'utf-8');
      const lines = content.trim().split('\n');
      const metadata = JSON.parse(lines[0]).metadata;
      metadata.entryCount = 999;
      lines[0] = JSON.stringify({ metadata });
      await fs.writeFile(backupPath, lines.join('\n') + '\n');

      const result = await verifyBackup(backupPath);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Entry count mismatch');
    });

    it('should reject backup with invalid checksum', async () => {
      const backupPath = path.join(tempDir, 'backup.jsonl');
      await vaultBackup(vaultPath, backupPath);

      // Modify backup to have wrong checksum
      let content = await fs.readFile(backupPath, 'utf-8');
      const lines = content.trim().split('\n');
      const metadata = JSON.parse(lines[0]).metadata;
      metadata.checksum = 'invalid'.repeat(8);
      lines[0] = JSON.stringify({ metadata });
      await fs.writeFile(backupPath, lines.join('\n') + '\n');

      const result = await verifyBackup(backupPath);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Checksum verification failed');
    });

    it('should reject non-existent backup', async () => {
      const result = await verifyBackup('/nonexistent/backup.jsonl');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Failed to read backup');
    });
  });

  describe('vaultRestore', () => {
    it('should restore to empty vault', async () => {
      const backupPath = path.join(tempDir, 'backup.jsonl');
      await vaultBackup(vaultPath, backupPath);

      // Create new empty vault path
      const newVaultPath = path.join(tempDir, 'restored-vault.db');

      const result = await vaultRestore(backupPath, newVaultPath, 'master-key');

      expect(result.success).toBe(true);
      expect(result.entriesRestored).toBe(3);
      expect(result.conflictsResolved).toBe(0);

      // Verify restored vault has correct entries
      const db = new Database(newVaultPath, { readonly: true });
      const count = db.prepare('SELECT COUNT(*) as count FROM entries').get() as { count: number };
      db.close();
      expect(count.count).toBe(3);
    });

    it('should overwrite vault with --force', async () => {
      const backupPath = path.join(tempDir, 'backup.jsonl');
      await vaultBackup(vaultPath, backupPath);

      // Restore to existing vault with force
      const result = await vaultRestore(backupPath, vaultPath, 'master-key', { force: true });

      expect(result.success).toBe(true);
      expect(result.entriesRestored).toBe(3);
    });

    it('should merge with existing vault', async () => {
      const backupPath = path.join(tempDir, 'backup.jsonl');
      await vaultBackup(vaultPath, backupPath);

      // Add a new entry to the vault
      const db = new Database(vaultPath);
      db.prepare(`
        INSERT INTO entries (token, category, encrypted_value, iv, auth_tag, salt, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run('NEW_11111111', 'new', Buffer.from('new'), Buffer.alloc(12), Buffer.alloc(16), Buffer.alloc(32), Date.now(), null);
      db.close();

      // Restore with merge
      const result = await vaultRestore(backupPath, vaultPath, 'master-key', { merge: true });

      expect(result.success).toBe(true);
      expect(result.entriesRestored).toBe(0); // All entries already exist
      expect(result.conflictsResolved).toBe(0); // No entries are newer

      // Verify vault has 4 entries (3 original + 1 new)
      const dbVerify = new Database(vaultPath, { readonly: true });
      const count = dbVerify.prepare('SELECT COUNT(*) as count FROM entries').get() as { count: number };
      dbVerify.close();
      expect(count.count).toBe(4);
    });

    it('should reject invalid backup', async () => {
      const invalidBackup = path.join(tempDir, 'invalid.jsonl');
      await fs.writeFile(invalidBackup, 'not valid json\n');

      await expect(
        vaultRestore(invalidBackup, vaultPath, 'master-key')
      ).rejects.toThrow('Invalid backup file');
    });
  });

  describe('vaultRepair', () => {
    it('should detect and report healthy vault', async () => {
      const result = await vaultRepair(vaultPath, 'master-key', { backup: false });

      expect(result.success).toBe(true);
      expect(result.entriesRepaired).toBe(0);
      expect(result.entriesDeleted).toBe(0);
      expect(result.entriesUnrecoverable).toBe(0);
    });

    it('should create backup before repair by default', async () => {
      const backupDir = tempDir;
      const result = await vaultRepair(vaultPath, 'master-key', { backup: true });

      expect(result.success).toBe(true);

      // Check that a backup file was created
      const files = await fs.readdir(backupDir);
      const backupFiles = files.filter(f => f.includes('.backup.') && f.endsWith('.jsonl'));
      expect(backupFiles.length).toBe(1);
    });

    it('should repair entries with invalid timestamps', async () => {
      // Corrupt an entry's timestamp
      const db = new Database(vaultPath);
      db.prepare('UPDATE entries SET created_at = 0 WHERE token = ?').run('EMAIL_12345678');
      db.close();

      const result = await vaultRepair(vaultPath, 'master-key', { backup: false });

      expect(result.success).toBe(true);
      expect(result.entriesRepaired).toBe(1);
    });

    it('should delete unrecoverable entries', async () => {
      // Corrupt an entry's IV (critical field)
      const db = new Database(vaultPath);
      db.prepare('UPDATE entries SET iv = ? WHERE token = ?').run(Buffer.alloc(5), 'EMAIL_12345678');
      db.close();

      const result = await vaultRepair(vaultPath, 'master-key', { backup: false });

      expect(result.success).toBe(true);
      expect(result.entriesUnrecoverable).toBe(1);
      expect(result.entriesDeleted).toBe(1);

      // Verify entry was deleted
      const dbVerify = new Database(vaultPath, { readonly: true });
      const count = dbVerify.prepare('SELECT COUNT(*) as count FROM entries').get() as { count: number };
      dbVerify.close();
      expect(count.count).toBe(2);
    });
  });
});
