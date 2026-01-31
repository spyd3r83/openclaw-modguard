import * as fs from 'node:fs/promises';
import * as crypto from 'node:crypto';
import Database from 'better-sqlite3';

export interface BackupMetadata {
  version: string;
  timestamp: string;
  entryCount: number;
  checksum: string;
  incremental: boolean;
  previousBackupTimestamp?: string;
}

export interface BackupEntry {
  id: number;
  token: string;
  category: string;
  encrypted_value: string; // base64 encoded
  iv: string; // base64 encoded
  auth_tag: string; // base64 encoded
  created_at: number;
  expires_at: number | null;
}

export interface BackupOptions {
  incremental?: boolean;
  lastBackupTimestamp?: number;
}

export interface BackupResult {
  success: boolean;
  outputPath: string;
  entryCount: number;
  size: number;
  duration: number;
  checksum: string;
}

export interface RestoreOptions {
  force?: boolean;
  merge?: boolean;
}

export interface RestoreResult {
  success: boolean;
  entriesRestored: number;
  conflictsResolved: number;
  duration: number;
}

export interface RepairOptions {
  backup?: boolean;
  force?: boolean;
}

export interface RepairResult {
  success: boolean;
  entriesRepaired: number;
  entriesDeleted: number;
  entriesUnrecoverable: number;
  duration: number;
}

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

const BACKUP_VERSION = '1.0.0';

export async function vaultBackup(
  vaultPath: string,
  outputPath: string,
  options: BackupOptions = {}
): Promise<BackupResult> {
  const startTime = Date.now();

  const db = new Database(vaultPath, { readonly: true });

  try {
    let query = 'SELECT id, token, category, encrypted_value, iv, auth_tag, created_at, expires_at FROM entries';
    const params: number[] = [];

    if (options.incremental && options.lastBackupTimestamp) {
      query += ' WHERE created_at > ?';
      params.push(options.lastBackupTimestamp);
    }

    query += ' ORDER BY id ASC';

    const entries = db.prepare(query).all(...params) as VaultEntry[];

    const backupEntries: BackupEntry[] = entries.map(entry => ({
      id: entry.id,
      token: entry.token,
      category: entry.category,
      encrypted_value: entry.encrypted_value.toString('base64'),
      iv: entry.iv.toString('base64'),
      auth_tag: entry.auth_tag.toString('base64'),
      created_at: entry.created_at,
      expires_at: entry.expires_at
    }));

    // Calculate checksum over all entries
    const checksumData = backupEntries
      .map(e => `${e.id}:${e.token}:${e.encrypted_value}`)
      .join('\n');
    const checksum = crypto
      .createHash('sha256')
      .update(checksumData)
      .digest('hex');

    const metadata: BackupMetadata = {
      version: BACKUP_VERSION,
      timestamp: new Date().toISOString(),
      entryCount: backupEntries.length,
      checksum,
      incremental: options.incremental || false,
      previousBackupTimestamp: options.lastBackupTimestamp
        ? new Date(options.lastBackupTimestamp).toISOString()
        : undefined
    };

    // Write JSONL format: first line is metadata, subsequent lines are entries
    const lines: string[] = [];
    lines.push(JSON.stringify({ metadata }));

    for (const entry of backupEntries) {
      lines.push(JSON.stringify({ entry }));
    }

    const content = lines.join('\n') + '\n';
    await fs.writeFile(outputPath, content, 'utf-8');

    const stats = await fs.stat(outputPath);

    // Verify backup integrity after creation
    const verified = await verifyBackup(outputPath);
    if (!verified.valid) {
      throw new Error('Backup verification failed: ' + verified.error);
    }

    return {
      success: true,
      outputPath,
      entryCount: backupEntries.length,
      size: stats.size,
      duration: Date.now() - startTime,
      checksum
    };
  } finally {
    db.close();
  }
}

export interface VerifyBackupResult {
  valid: boolean;
  error?: string;
  metadata?: BackupMetadata;
  entryCount?: number;
}

export async function verifyBackup(backupPath: string): Promise<VerifyBackupResult> {
  try {
    const content = await fs.readFile(backupPath, 'utf-8');
    const lines = content.trim().split('\n');

    if (lines.length === 0) {
      return { valid: false, error: 'Empty backup file' };
    }

    // Parse metadata from first line
    let metadata: BackupMetadata;
    try {
      const firstLine = JSON.parse(lines[0]);
      if (!firstLine.metadata) {
        return { valid: false, error: 'Missing metadata in backup file' };
      }
      metadata = firstLine.metadata;
    } catch {
      return { valid: false, error: 'Invalid metadata JSON' };
    }

    // Parse entries and verify count
    const entries: BackupEntry[] = [];
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      try {
        const parsed = JSON.parse(lines[i]);
        if (parsed.entry) {
          entries.push(parsed.entry);
        }
      } catch {
        return { valid: false, error: `Invalid JSON on line ${i + 1}` };
      }
    }

    if (entries.length !== metadata.entryCount) {
      return {
        valid: false,
        error: `Entry count mismatch: expected ${metadata.entryCount}, found ${entries.length}`
      };
    }

    // Verify checksum
    const checksumData = entries
      .map(e => `${e.id}:${e.token}:${e.encrypted_value}`)
      .join('\n');
    const calculatedChecksum = crypto
      .createHash('sha256')
      .update(checksumData)
      .digest('hex');

    if (calculatedChecksum !== metadata.checksum) {
      return { valid: false, error: 'Checksum verification failed' };
    }

    return {
      valid: true,
      metadata,
      entryCount: entries.length
    };
  } catch (error) {
    return {
      valid: false,
      error: `Failed to read backup: ${error}`
    };
  }
}

export async function vaultRestore(
  backupPath: string,
  vaultPath: string,
  _masterKey: string,
  options: RestoreOptions = {}
): Promise<RestoreResult> {
  const startTime = Date.now();

  // Verify backup first
  const verification = await verifyBackup(backupPath);
  if (!verification.valid) {
    throw new Error(`Invalid backup file: ${verification.error}`);
  }

  const content = await fs.readFile(backupPath, 'utf-8');
  const lines = content.trim().split('\n');

  // Parse entries (skip metadata line)
  const entries: BackupEntry[] = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const parsed = JSON.parse(lines[i]);
    if (parsed.entry) {
      entries.push(parsed.entry);
    }
  }

  // Check if vault exists
  let vaultExists = true;
  try {
    await fs.access(vaultPath);
  } catch {
    vaultExists = false;
  }

  if (vaultExists && !options.force && !options.merge) {
    throw new Error('Vault already exists. Use --force to overwrite or --merge to append.');
  }

  const db = new Database(vaultPath);

  try {
    // Initialize schema if new vault
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
    db.exec('CREATE INDEX IF NOT EXISTS idx_entries_token ON entries(token)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_entries_category ON entries(category)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_entries_expires_at ON entries(expires_at)');

    if (options.force && !options.merge) {
      // Clear existing entries
      db.exec('DELETE FROM entries');
    }

    let entriesRestored = 0;
    let conflictsResolved = 0;

    const insertStmt = db.prepare(`
      INSERT INTO entries (token, category, encrypted_value, iv, auth_tag, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const checkExistsStmt = db.prepare(
      'SELECT id, created_at FROM entries WHERE token = ? AND category = ?'
    );

    const updateStmt = db.prepare(`
      UPDATE entries SET encrypted_value = ?, iv = ?, auth_tag = ?, created_at = ?, expires_at = ?
      WHERE token = ? AND category = ?
    `);

    const transaction = db.transaction(() => {
      for (const entry of entries) {
        const existing = checkExistsStmt.get(entry.token, entry.category) as
          | { id: number; created_at: number }
          | undefined;

        if (existing) {
          // Conflict: keep newer entry
          if (entry.created_at > existing.created_at) {
            updateStmt.run(
              Buffer.from(entry.encrypted_value, 'base64'),
              Buffer.from(entry.iv, 'base64'),
              Buffer.from(entry.auth_tag, 'base64'),
              entry.created_at,
              entry.expires_at,
              entry.token,
              entry.category
            );
            conflictsResolved++;
          }
        } else {
          insertStmt.run(
            entry.token,
            entry.category,
            Buffer.from(entry.encrypted_value, 'base64'),
            Buffer.from(entry.iv, 'base64'),
            Buffer.from(entry.auth_tag, 'base64'),
            entry.created_at,
            entry.expires_at
          );
          entriesRestored++;
        }
      }
    });

    transaction();

    return {
      success: true,
      entriesRestored,
      conflictsResolved,
      duration: Date.now() - startTime
    };
  } finally {
    db.close();
  }
}

export async function vaultRepair(
  vaultPath: string,
  _masterKey: string,
  options: RepairOptions = {}
): Promise<RepairResult> {
  const startTime = Date.now();

  // Create backup before repair if requested
  if (options.backup) {
    const backupPath = `${vaultPath}.backup.${Date.now()}.jsonl`;
    await vaultBackup(vaultPath, backupPath);
    console.log(`Backup created: ${backupPath}`);
  }

  const db = new Database(vaultPath);

  try {
    let entriesRepaired = 0;
    let entriesDeleted = 0;
    let entriesUnrecoverable = 0;

    // Check for corrupted entries
    const entries = db.prepare(
      'SELECT id, token, category, encrypted_value, iv, auth_tag, created_at, expires_at FROM entries'
    ).all() as VaultEntry[];

    const toDelete: number[] = [];
    const toRepair: { id: number; fixes: string[] }[] = [];

    for (const entry of entries) {
      const issues: string[] = [];

      // Check token format
      if (!entry.token || !/^[A-Z_]+_[0-9a-f]{8}$/i.test(entry.token)) {
        issues.push('invalid_token_format');
      }

      // Check category
      if (!entry.category || entry.category.length === 0) {
        issues.push('missing_category');
      }

      // Check encrypted value
      if (!entry.encrypted_value || entry.encrypted_value.length === 0) {
        issues.push('missing_encrypted_value');
      }

      // Check IV (should be 12 bytes for AES-GCM)
      if (!entry.iv || entry.iv.length !== 12) {
        issues.push('invalid_iv_length');
      }

      // Check auth tag (should be 16 bytes for AES-GCM)
      if (!entry.auth_tag || entry.auth_tag.length !== 16) {
        issues.push('invalid_auth_tag_length');
      }

      // Check timestamp
      if (!entry.created_at || entry.created_at <= 0) {
        issues.push('invalid_timestamp');
      }

      if (issues.length > 0) {
        // Critical issues that can't be repaired
        const criticalIssues = [
          'missing_encrypted_value',
          'invalid_iv_length',
          'invalid_auth_tag_length'
        ];

        if (issues.some(i => criticalIssues.includes(i))) {
          toDelete.push(entry.id);
          entriesUnrecoverable++;
        } else {
          // Can attempt repair for non-critical issues
          toRepair.push({ id: entry.id, fixes: issues });
        }
      }
    }

    // Apply repairs
    const updateTimestampStmt = db.prepare(
      'UPDATE entries SET created_at = ? WHERE id = ?'
    );

    const transaction = db.transaction(() => {
      // Repair entries with fixable issues
      for (const repair of toRepair) {
        if (repair.fixes.includes('invalid_timestamp')) {
          // Fix by setting to current time
          updateTimestampStmt.run(Date.now(), repair.id);
          entriesRepaired++;
        }
      }

      // Delete unrecoverable entries
      const deleteStmt = db.prepare('DELETE FROM entries WHERE id = ?');
      for (const id of toDelete) {
        deleteStmt.run(id);
        entriesDeleted++;
      }
    });

    transaction();

    // Run integrity check
    const integrityCheck = db.pragma('integrity_check') as { integrity_check: string }[];
    const isIntact = integrityCheck[0]?.integrity_check === 'ok';

    if (!isIntact) {
      throw new Error('Database integrity check failed after repair');
    }

    return {
      success: true,
      entriesRepaired,
      entriesDeleted,
      entriesUnrecoverable,
      duration: Date.now() - startTime
    };
  } finally {
    db.close();
  }
}
