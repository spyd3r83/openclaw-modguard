#!/usr/bin/env node

import yargsModule from 'yargs';
import { hideBin } from 'yargs/helpers';
import { Vault } from '../vault.js';
import { Tokenizer, isValidToken } from '../tokenizer.js';
import { PatternType } from '../types.js';
import { OutputFormat, OutputFormatter, FormattableData } from './formatter.js';
import { registerAuditCommands } from './audit.js';
import { initializeGlobalAuditLogger, getGlobalAuditLogger } from '../audit.js';
import { vaultBackup, vaultRestore, vaultRepair, verifyBackup } from '../backup.js';
import * as fs from 'node:fs/promises';

const yargs: any = (yargsModule as any).default;

const MAX_QUERY_LIMIT = 1000;

const auditLogger = initializeGlobalAuditLogger();


interface VaultEntry {
  id: number;
  token: string;
  category: string;
  created_at: number;
  expires_at: number | null;
}

const argv = yargs(hideBin(process.argv))
  .scriptName('openclaw modguard')
  .command('audit', 'Audit log management', registerAuditCommands)
  .command('vault', 'Manage vault operations', (yargs: any) => {
    return yargs
      .command('list', 'List all vault entries', (yargs: any) => {
        return yargs
          .option('format', {
            alias: 'f',
            type: 'string',
            choices: ['table', 'json', 'csv'] as const,
            default: 'table' as const,
            description: 'Output format (table, json, csv)'
          })
          .option('category', {
            alias: 'c',
            type: 'string',
            description: 'Filter by category (email, phone, ssn, credit_card, api_key, bearer_token, pem_block, ipv4, ipv6)'
          })
          .option('older-than', {
            alias: 'o',
            type: 'string',
            description: 'Filter by age (e.g., 24h, 7d, 30d)'
          })
          .option('limit', {
            alias: 'l',
            type: 'number',
            default: 50,
            description: 'Maximum number of entries to show (default: 50)'
          })
          .option('offset', {
            type: 'number',
            default: 0,
            description: 'Offset for pagination (default: 0)'
          })
          .example('$0 vault list --format json --limit 100', 'List first 100 entries in JSON format')
          .example('$0 vault list --category email --older-than 7d', 'List email entries older than 7 days');
      }, handleVaultList)
      .command('lookup <token>', 'Look up a specific token in vault', (yargs: any) => {
        return yargs
          .positional('token', {
            type: 'string',
            description: 'Token to look up'
          })
          .option('format', {
            alias: 'f',
            type: 'string',
            choices: ['table', 'json', 'csv'] as const,
            default: 'table' as const,
            description: 'Output format'
          })
          .example('$0 vault lookup EMAIL_12345678', 'Look up token EMAIL_12345678');
      }, handleVaultLookup)
      .command('stats', 'View vault statistics', (yargs: any) => {
        return yargs
          .option('format', {
            alias: 'f',
            type: 'string',
            choices: ['table', 'json'] as const,
            default: 'table' as const,
            description: 'Output format'
          });
      }, handleVaultStats)
      .command('delete', 'Delete vault entries by value (GDPR right to be forgotten)', (yargs: any) => {
        return yargs
          .option('contains', {
            alias: 'c',
            type: 'string',
            demandOption: true,
            description: 'Value to search for (case-insensitive)'
          })
          .option('force', {
            alias: 'f',
            type: 'boolean',
            default: false,
            description: 'Skip confirmation prompt'
          })
          .example('$0 vault delete --contains "user@example.com"', 'Delete all entries containing "user@example.com"');
      }, handleVaultDelete)
      .command('export', 'Export vault data by value (GDPR data portability)', (yargs: any) => {
        return yargs
          .option('contains', {
            alias: 'c',
            type: 'string',
            demandOption: true,
            description: 'Value to search for (case-insensitive)'
          })
          .option('format', {
            alias: 'f',
            type: 'string',
            choices: ['json'] as const,
            default: 'json' as const,
            description: 'Output format'
          })
          .option('output', {
            alias: 'o',
            type: 'string',
            description: 'Output file path (if not specified, prints to stdout)'
          })
          .example('$0 vault export --contains "user@example.com" --output export.json', 'Export entries containing "user@example.com" to export.json');
      }, handleVaultExport)
      .command('prune', 'Clean up expired vault entries', (yargs: any) => {
        return yargs
          .option('dry-run', {
            alias: 'd',
            type: 'boolean',
            default: false,
            description: 'Show what would be deleted without deleting'
          })
          .option('force', {
            alias: 'f',
            type: 'boolean',
            default: false,
            description: 'Skip confirmation prompt'
          })
          .example('$0 vault prune --dry-run', 'Show what would be pruned without deleting');
      }, handleVaultPrune)
      .command('backup', 'Create a backup of the vault database', (yargs: any) => {
        return yargs
          .option('output', {
            alias: 'o',
            type: 'string',
            description: 'Output file path (defaults to vault-backup-<timestamp>.jsonl)'
          })
          .option('incremental', {
            alias: 'i',
            type: 'boolean',
            default: false,
            description: 'Create incremental backup (only new entries since last backup)'
          })
          .option('since', {
            type: 'string',
            description: 'For incremental: timestamp or ISO date for entries after this time'
          })
          .example('$0 vault backup --output backup.jsonl', 'Create full backup')
          .example('$0 vault backup --incremental --since 2024-01-01', 'Create incremental backup');
      }, handleVaultBackup)
      .command('restore <backup-file>', 'Restore vault from backup', (yargs: any) => {
        return yargs
          .positional('backup-file', {
            type: 'string',
            description: 'Path to backup file'
          })
          .option('force', {
            alias: 'f',
            type: 'boolean',
            default: false,
            description: 'Overwrite existing vault'
          })
          .option('merge', {
            alias: 'm',
            type: 'boolean',
            default: false,
            description: 'Merge with existing vault (keep newer on conflicts)'
          })
          .example('$0 vault restore backup.jsonl --force', 'Restore and overwrite existing vault')
          .example('$0 vault restore backup.jsonl --merge', 'Merge backup with existing vault');
      }, handleVaultRestore)
      .command('repair', 'Repair corrupted vault database', (yargs: any) => {
        return yargs
          .option('backup', {
            alias: 'b',
            type: 'boolean',
            default: true,
            description: 'Create backup before repair'
          })
          .option('force', {
            alias: 'f',
            type: 'boolean',
            default: false,
            description: 'Skip confirmation prompt'
          })
          .example('$0 vault repair', 'Repair vault with automatic backup')
          .example('$0 vault repair --no-backup --force', 'Repair without backup or confirmation');
      }, handleVaultRepair)
      .demandCommand(1, 'Please specify a vault command');
  })
  .demandCommand(1, 'Please specify a command')
  .help()
  .parseAsync();

async function handleVaultList(args: any): Promise<void> {
  const startTime = Date.now();
  const sessionId = 'cli-vault-list-' + Date.now();

  try {
    const vaultPath = process.env.MODGUARD_VAULT_PATH || '/tmp/openclaw-modguard-vault.db';
    const masterKey = process.env.MODGUARD_MASTER_KEY || 'default-master-key';

    const vault = new Vault(vaultPath, masterKey);
    vault.setSessionId(sessionId);

    const effectiveLimit = Math.min(args.limit || 50, MAX_QUERY_LIMIT);

    let query = 'SELECT id, token, category, created_at, expires_at FROM entries WHERE 1=1';
    const params: any[] = [];

    if (args.category) {
      query += ' AND category = ?';
      params.push(args.category);
    }

    if (args['older-than']) {
      const cutoffMs = parseDuration(args['older-than']);
      query += ' AND created_at < ?';
      params.push(Date.now() - cutoffMs);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(effectiveLimit, args.offset || 0);

    const entries = (vault as any).db.prepare(query).all(...params) as VaultEntry[];

    vault.close();

    if (entries.length === 0) {
      console.log('No vault entries found.');
      return;
    }

    const formattedData = entries.map(entry => ({
      ID: entry.id,
      Token: entry.token,
      Category: entry.category,
      Created: new Date(entry.created_at).toISOString(),
      Expires: entry.expires_at ? new Date(entry.expires_at).toISOString() : 'Never'
    }));

    const output = OutputFormatter.format(
      formattedData,
      args.format as OutputFormat,
      ['ID', 'Token', 'Category', 'Created', 'Expires']
    );
    console.log(output);

    const elapsed = Date.now() - startTime;

    const logger = getGlobalAuditLogger();
    if (logger) {
      void logger.log({
        operation: 'cli',
        sessionId,
        level: 'info',
        success: true,
        duration: elapsed,
        details: {
          command: 'vault list',
          args: sanitizeArgs(args),
          sanitized: true
        }
      });
    }

    if (elapsed > 500) {
      console.warn(`vault list took ${elapsed}ms (target <500ms)`);
    }
  } catch (error) {
    const elapsed = Date.now() - startTime;
    const logger = getGlobalAuditLogger();
    if (logger) {
      void logger.log({
        operation: 'cli',
        sessionId,
        level: 'error',
        success: false,
        duration: elapsed,
        details: {
          command: 'vault list',
          args: sanitizeArgs(args),
          sanitized: true
        }
      });
    }

    const safeMessage = error instanceof Error && 'toJSON' in error
      ? (error as any).toJSON().message
      : 'Failed to list vault entries';

    console.error(`Error: ${safeMessage}`);
    process.exit(1);
  }
}

function sanitizeArgs(args: any): string[] {
  const sanitized: string[] = [];
  for (const [key, value] of Object.entries(args)) {
    if (key === 'contains') {
      sanitized.push(`--contains [REDACTED]`);
    } else if (Array.isArray(value)) {
      sanitized.push(`--${key} ${value.join(',')}`);
    } else if (typeof value === 'boolean' && value) {
      sanitized.push(`--${key}`);
    } else if (typeof value === 'string' || typeof value === 'number') {
      sanitized.push(`--${key} ${value}`);
    }
  }
  return sanitized;
}

async function handleVaultLookup(args: any): Promise<void> {
  const startTime = Date.now();
  const sessionId = 'cli-vault-lookup-' + Date.now();

  try {
    const token = args.token as string;

    if (!token) {
      console.error('Error: Token is required');
      process.exit(1);
    }

    if (!isValidToken(token)) {
      console.error(`Error: Invalid token format. Expected format: CATEGORY_XXXXXXXX`);
      process.exit(1);
    }

    const vaultPath = process.env.MODGUARD_VAULT_PATH || '/tmp/openclaw-modguard-vault.db';
    const masterKey = process.env.MODGUARD_MASTER_KEY || 'default-master-key';

    const vault = new Vault(vaultPath, masterKey);
    vault.setSessionId(sessionId);
    const tokenizer = new Tokenizer(vault);

    const [categoryStr] = token.split('_') as [string];
    const category = categoryStr.toLowerCase();

    const retrieved = await vault.retrieve(token, category);
    vault.close();

    if (!retrieved) {
      console.error(`Error: Token "${token}" not found in vault`);
      process.exit(1);
    }

    const result = {
      Token: token,
      Category: category,
      Value: retrieved,
      Found: true
    };

    const output = OutputFormatter.format(
      result,
      args.format as OutputFormat,
      ['Token', 'Category', 'Value', 'Found']
    );
    console.log(output);

    console.log(`[AUDIT] Token lookup performed: ${token}`);

    const elapsed = Date.now() - startTime;

    const logger = getGlobalAuditLogger();
    if (logger) {
      void logger.log({
        operation: 'cli',
        sessionId,
        level: 'info',
        success: true,
        duration: elapsed,
        details: {
          command: 'vault lookup',
          args: sanitizeArgs(args),
          sanitized: true
        }
      });
    }

    if (elapsed > 50) {
      console.warn(`vault lookup took ${elapsed}ms (target <50ms)`);
    }
  } catch (error) {
    const elapsed = Date.now() - startTime;
    const logger = getGlobalAuditLogger();
    if (logger) {
      void logger.log({
        operation: 'cli',
        sessionId,
        level: 'error',
        success: false,
        duration: elapsed,
        details: {
          command: 'vault lookup',
          args: sanitizeArgs(args),
          sanitized: true
        }
      });
    }
    console.error(`Error looking up token: ${error}`);
    process.exit(1);
  }
}

async function handleVaultStats(args: any): Promise<void> {
  const startTime = Date.now();
  const sessionId = 'cli-vault-stats-' + Date.now();

  try {
    const vaultPath = process.env.MODGUARD_VAULT_PATH || '/tmp/openclaw-modguard-vault.db';
    const masterKey = process.env.MODGUARD_MASTER_KEY || 'default-master-key';

    const vault = new Vault(vaultPath, masterKey);
    vault.setSessionId(sessionId);
    const db = (vault as any).db;

    const totalEntries = db.prepare('SELECT COUNT(*) as count FROM entries').get() as { count: number };
    const byCategory = db.prepare('SELECT category, COUNT(*) as count FROM entries GROUP BY category').all() as Array<{ category: string; count: number }>;
    const oldestEntry = db.prepare('SELECT created_at FROM entries ORDER BY created_at ASC LIMIT 1').get() as { created_at: number } | undefined;
    const newestEntry = db.prepare('SELECT created_at FROM entries ORDER BY created_at DESC LIMIT 1').get() as { created_at: number } | undefined;
    const expiredEntries = db.prepare('SELECT COUNT(*) as count FROM entries WHERE expires_at IS NOT NULL AND expires_at < ?').get(Date.now()) as { count: number };
    const expiringSoonEntries = db.prepare('SELECT COUNT(*) as count FROM entries WHERE expires_at IS NOT NULL AND expires_at > ? AND expires_at < ?').get(Date.now(), Date.now() + 86400000) as { count: number };

    vault.close();

    const stats = {
      'Total Entries': totalEntries.count,
      'Oldest Entry': oldestEntry ? new Date(oldestEntry.created_at).toISOString() : 'N/A',
      'Newest Entry': newestEntry ? new Date(newestEntry.created_at).toISOString() : 'N/A',
      'Expired Entries': expiredEntries.count,
      'Expiring Soon (24h)': expiringSoonEntries.count,
      'Categories': byCategory.map(c => `${c.category}: ${c.count}`).join(', ')
    };

    if (args.format === 'json') {
      console.log(JSON.stringify(stats, null, 2));
    } else {
      console.log('='.repeat(50));
      console.log('Vault Statistics');
      console.log('='.repeat(50));
      console.log('');
      Object.entries(stats).forEach(([key, value]) => {
        console.log(`${key}: ${value}`);
      });
      console.log('');
      console.log('='.repeat(50));
    }

    const elapsed = Date.now() - startTime;

    const logger = getGlobalAuditLogger();
    if (logger) {
      void logger.log({
        operation: 'cli',
        sessionId,
        level: 'info',
        success: true,
        duration: elapsed,
        details: {
          command: 'vault stats',
          args: sanitizeArgs(args),
          sanitized: true
        }
      });
    }

    if (elapsed > 100) {
      console.warn(`vault stats took ${elapsed}ms (target <100ms)`);
    }
  } catch (error) {
    const elapsed = Date.now() - startTime;
    const logger = getGlobalAuditLogger();
    if (logger) {
      void logger.log({
        operation: 'cli',
        sessionId,
        level: 'error',
        success: false,
        duration: elapsed,
        details: {
          command: 'vault stats',
          args: sanitizeArgs(args),
          sanitized: true
        }
      });
    }
    console.error(`Error getting vault stats: ${error}`);
    process.exit(1);
  }
}

async function handleVaultPrune(args: any): Promise<void> {
  const startTime = Date.now();
  const sessionId = 'cli-vault-prune-' + Date.now();

  try {
    const vaultPath = process.env.MODGUARD_VAULT_PATH || '/tmp/openclaw-modguard-vault.db';
    const masterKey = process.env.MODGUARD_MASTER_KEY || 'default-master-key';

    const vault = new Vault(vaultPath, masterKey);
    vault.setSessionId(sessionId);
    const db = (vault as any).db;

    const expiredEntries = db.prepare('SELECT id, token, category FROM entries WHERE expires_at IS NOT NULL AND expires_at < ?').all(Date.now()) as Array<{ id: number; token: string; category: string }>;

    if (expiredEntries.length === 0) {
      console.log('No expired entries to prune.');
      vault.close();
      return;
    }

    const spaceFreed = calculateSpaceFreed(db, expiredEntries.map(e => e.id));

    console.log(`Found ${expiredEntries.length} expired entries.`);
    console.log(`Estimated space to be freed: ${formatBytes(spaceFreed)}`);

    if (args['dry-run']) {
      console.log('\n[Dry-run mode] No entries will be deleted.');
      console.log('Run without --dry-run to actually delete entries.');
      vault.close();
      return;
    }

    if (!args.force) {
      const readline = await import('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      const answer = await new Promise<string>((resolve) => {
        rl.question(`Delete ${expiredEntries.length} expired entries? (yes/no): `, (ans) => {
          rl.close();
          resolve(ans.toLowerCase());
        });
      });

      if (answer !== 'yes' && answer !== 'y') {
        console.log('Prune cancelled.');
        vault.close();
        return;
      }
    }

    const deleteStmt = db.prepare('DELETE FROM entries WHERE id = ?');
    const deleteResult = db.transaction(() => {
      let totalDeleted = 0;
      for (const entry of expiredEntries) {
        deleteStmt.run(entry.id);
        totalDeleted++;
      }
      return totalDeleted;
    })();

    console.log(`Deleted ${deleteResult} expired entries.`);
    console.log(`Space freed: ${formatBytes(spaceFreed)}`);
    console.log('[AUDIT] Vault prune operation completed');

    vault.close();

    const elapsed = Date.now() - startTime;

    const logger = getGlobalAuditLogger();
    if (logger) {
      void logger.log({
        operation: 'cli',
        sessionId,
        level: 'info',
        success: true,
        duration: elapsed,
        details: {
          command: 'vault prune',
          args: sanitizeArgs(args),
          sanitized: true
        }
      });
    }

    if (elapsed > 1000) {
      console.warn(`vault prune took ${elapsed}ms (target <1s for 1000 items)`);
    }
  } catch (error) {
    const elapsed = Date.now() - startTime;
    const logger = getGlobalAuditLogger();
    if (logger) {
      void logger.log({
        operation: 'cli',
        sessionId,
        level: 'error',
        success: false,
        duration: elapsed,
        details: {
          command: 'vault prune',
          args: sanitizeArgs(args),
          sanitized: true
        }
      });
    }
    console.error(`Error pruning vault: ${error}`);
    process.exit(1);
  }
}

async function handleVaultDelete(args: any): Promise<void> {
  const startTime = Date.now();
  const sessionId = 'cli-vault-delete-' + Date.now();

  try {
    const containsValue = args['contains'] as string;

    if (!containsValue) {
      console.error('Error: --contains argument is required');
      process.exit(1);
    }

    const vaultPath = process.env.MODGUARD_VAULT_PATH || '/tmp/openclaw-modguard-vault.db';
    const masterKey = process.env.MODGUARD_MASTER_KEY || 'default-master-key';

    const vault = new Vault(vaultPath, masterKey);
    vault.setSessionId(sessionId);

    const db = (vault as any).db;
    const allEntries = db.prepare('SELECT id, token, category FROM entries').all() as Array<{ id: number; token: string; category: string }>;

    const entriesToDelete: number[] = [];

    for (const entry of allEntries) {
      try {
        const [categoryStr] = entry.token.split('_') as [string];
        const category = categoryStr.toLowerCase();

        const retrieved = await vault.retrieve(entry.token, category);
        if (retrieved && retrieved.toLowerCase().includes(containsValue.toLowerCase())) {
          entriesToDelete.push(entry.id);
        }
      } catch {
        continue;
      }
    }

    if (entriesToDelete.length === 0) {
      console.log(`No entries found containing "${containsValue}"`);
      vault.close();
      return;
    }

    console.log(`Found ${entriesToDelete.length} entries containing "${containsValue}"`);

    if (!args.force) {
      const readline = await import('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      const answer = await new Promise<string>((resolve) => {
        rl.question(`Delete ${entriesToDelete.length} entries? (yes/no): `, (ans) => {
          rl.close();
          resolve(ans.toLowerCase());
        });
      });

      if (answer !== 'yes' && answer !== 'y') {
        console.log('Delete cancelled.');
        vault.close();
        return;
      }
    }

    const deleteStmt = db.prepare('DELETE FROM entries WHERE id = ?');
    const deleteResult = db.transaction(() => {
      let totalDeleted = 0;
      for (const id of entriesToDelete) {
        deleteStmt.run(id);
        totalDeleted++;
      }
      return totalDeleted;
    })();

    console.log(`Deleted ${deleteResult} entries containing "${containsValue}"`);
    console.log(`[AUDIT] GDPR deletion operation completed: ${deleteResult} entries`);

    vault.close();

    const elapsed = Date.now() - startTime;

    const logger = getGlobalAuditLogger();
    if (logger) {
      void logger.log({
        operation: 'cli',
        sessionId,
        level: 'info',
        success: true,
        duration: elapsed,
        details: {
          command: 'vault delete',
          args: sanitizeArgs(args),
          sanitized: true
        }
      });
    }

    if (elapsed > 1000) {
      console.warn(`vault delete took ${elapsed}ms (target <1s for 1000 items)`);
    }
  } catch (error) {
    const elapsed = Date.now() - startTime;
    const logger = getGlobalAuditLogger();
    if (logger) {
      void logger.log({
        operation: 'cli',
        sessionId,
        level: 'error',
        success: false,
        duration: elapsed,
        details: {
          command: 'vault delete',
          args: sanitizeArgs(args),
          sanitized: true
        }
      });
    }
    console.error(`Error deleting vault entries: ${error}`);
    process.exit(1);
  }
}

async function handleVaultExport(args: any): Promise<void> {
  const startTime = Date.now();
  const sessionId = 'cli-vault-export-' + Date.now();

  try {
    const containsValue = args['contains'] as string;

    if (!containsValue) {
      console.error('Error: --contains argument is required');
      process.exit(1);
    }

    const vaultPath = process.env.MODGUARD_VAULT_PATH || '/tmp/openclaw-modguard-vault.db';
    const masterKey = process.env.MODGUARD_MASTER_KEY || 'default-master-key';

    const vault = new Vault(vaultPath, masterKey);
    vault.setSessionId(sessionId);

    const db = (vault as any).db;
    const allEntries = db.prepare('SELECT id, token, category, created_at, expires_at FROM entries').all() as Array<{ id: number; token: string; category: string; created_at: number; expires_at: number | null }>;

    const matchingEntries: Array<{ id: number; token: string; category: string; created_at: number; expires_at: number | null }> = [];

    for (const entry of allEntries) {
      try {
        const [categoryStr] = entry.token.split('_') as [string];
        const category = categoryStr.toLowerCase();

        const retrieved = await vault.retrieve(entry.token, category);
        if (retrieved && retrieved.toLowerCase().includes(containsValue.toLowerCase())) {
          matchingEntries.push(entry);
        }
      } catch {
        continue;
      }
    }

    if (matchingEntries.length === 0) {
      console.log(`No entries found containing "${containsValue}"`);
      vault.close();
      return;
    }

    const exportData = matchingEntries.map(entry => ({
      id: entry.id,
      token: entry.token,
      category: entry.category,
      created_at: new Date(entry.created_at).toISOString(),
      expires_at: entry.expires_at ? new Date(entry.expires_at).toISOString() : null
    }));

    if (args.output) {
      await fs.writeFile(args.output, JSON.stringify(exportData, null, 2), 'utf-8');
      console.log(`Exported ${exportData.length} entries to ${args.output}`);
    } else {
      console.log(JSON.stringify(exportData, null, 2));
    }

    console.log(`[AUDIT] GDPR export operation completed: ${exportData.length} entries`);

    vault.close();

    const elapsed = Date.now() - startTime;

    const logger = getGlobalAuditLogger();
    if (logger) {
      void logger.log({
        operation: 'cli',
        sessionId,
        level: 'info',
        success: true,
        duration: elapsed,
        details: {
          command: 'vault export',
          args: sanitizeArgs(args),
          sanitized: true
        }
      });
    }

    if (elapsed > 1000) {
      console.warn(`vault export took ${elapsed}ms (target <1s for 1000 items)`);
    }
  } catch (error) {
    const elapsed = Date.now() - startTime;
    const logger = getGlobalAuditLogger();
    if (logger) {
      void logger.log({
        operation: 'cli',
        sessionId,
        level: 'error',
        success: false,
        duration: elapsed,
        details: {
          command: 'vault export',
          args: sanitizeArgs(args),
          sanitized: true
        }
      });
    }
    console.error(`Error exporting vault entries: ${error}`);
    process.exit(1);
  }
}

function parseDuration(duration: string): number {
  if (typeof duration !== 'string' || duration.length === 0) {
    throw new Error('Invalid duration: must be a non-empty string');
  }

  const match = duration.match(/^(\d+)([hdm])$/);
  if (!match) {
    throw new Error(`Invalid duration format: ${duration}. Expected format: <number><unit> where unit is h (hours), d (days), or m (minutes)`);
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  if (value < 0 || value > 365000) {
    throw new Error('Invalid duration value: must be between 0 and 365000');
  }

  const unitToMs = {
    'm': 60000,
    'h': 3600000,
    'd': 86400000
  };

  return value * (unitToMs[unit as keyof typeof unitToMs] || 0);
}

function calculateSpaceFreed(db: any, ids: number[]): number {
  if (ids.length === 0) return 0;

  const sizes = db.prepare('SELECT LENGTH(encrypted_value) + LENGTH(iv) + LENGTH(auth_tag) as size FROM entries WHERE id = ?').all(...ids);
  return sizes.reduce((sum: number, row: any) => sum + (row.size || 0), 0);
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

async function handleVaultBackup(args: any): Promise<void> {
  const startTime = Date.now();
  const sessionId = 'cli-vault-backup-' + Date.now();

  try {
    const vaultPath = process.env.MODGUARD_VAULT_PATH || '/tmp/openclaw-modguard-vault.db';

    // Generate default output path if not specified
    const outputPath = args.output || `vault-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`;

    // Parse since timestamp if provided
    let lastBackupTimestamp: number | undefined;
    if (args.since) {
      const parsed = Date.parse(args.since);
      if (isNaN(parsed)) {
        console.error(`Error: Invalid date format for --since: ${args.since}`);
        process.exit(1);
      }
      lastBackupTimestamp = parsed;
    }

    console.log(`Creating ${args.incremental ? 'incremental' : 'full'} backup...`);

    const result = await vaultBackup(vaultPath, outputPath, {
      incremental: args.incremental,
      lastBackupTimestamp
    });

    console.log('');
    console.log('='.repeat(50));
    console.log('Backup Complete');
    console.log('='.repeat(50));
    console.log(`Output: ${result.outputPath}`);
    console.log(`Entries: ${result.entryCount}`);
    console.log(`Size: ${formatBytes(result.size)}`);
    console.log(`Duration: ${result.duration}ms`);
    console.log(`Checksum: ${result.checksum.substring(0, 16)}...`);
    console.log('='.repeat(50));

    const elapsed = Date.now() - startTime;

    const logger = getGlobalAuditLogger();
    if (logger) {
      void logger.log({
        operation: 'cli',
        sessionId,
        level: 'info',
        success: true,
        duration: elapsed,
        details: {
          command: 'vault backup',
          args: sanitizeArgs(args),
          sanitized: true
        }
      });
    }
  } catch (error) {
    const elapsed = Date.now() - startTime;
    const logger = getGlobalAuditLogger();
    if (logger) {
      void logger.log({
        operation: 'cli',
        sessionId,
        level: 'error',
        success: false,
        duration: elapsed,
        details: {
          command: 'vault backup',
          args: sanitizeArgs(args),
          sanitized: true
        }
      });
    }
    console.error(`Error creating backup: ${error}`);
    process.exit(1);
  }
}

async function handleVaultRestore(args: any): Promise<void> {
  const startTime = Date.now();
  const sessionId = 'cli-vault-restore-' + Date.now();

  try {
    const backupFile = args['backup-file'] as string;

    if (!backupFile) {
      console.error('Error: Backup file path is required');
      process.exit(1);
    }

    // Verify backup exists
    try {
      await fs.access(backupFile);
    } catch {
      console.error(`Error: Backup file not found: ${backupFile}`);
      process.exit(1);
    }

    // Verify backup integrity first
    console.log('Verifying backup integrity...');
    const verification = await verifyBackup(backupFile);

    if (!verification.valid) {
      console.error(`Error: Invalid backup file: ${verification.error}`);
      process.exit(1);
    }

    console.log(`Backup verified: ${verification.entryCount} entries, version ${verification.metadata?.version}`);

    const vaultPath = process.env.MODGUARD_VAULT_PATH || '/tmp/openclaw-modguard-vault.db';
    const masterKey = process.env.MODGUARD_MASTER_KEY || 'default-master-key';

    // Check if vault exists and warn
    let vaultExists = true;
    try {
      await fs.access(vaultPath);
    } catch {
      vaultExists = false;
    }

    if (vaultExists && !args.force && !args.merge) {
      const readline = await import('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      const answer = await new Promise<string>((resolve) => {
        rl.question('Vault already exists. Overwrite (o), Merge (m), or Cancel (c)? ', (ans) => {
          rl.close();
          resolve(ans.toLowerCase());
        });
      });

      if (answer === 'o' || answer === 'overwrite') {
        args.force = true;
      } else if (answer === 'm' || answer === 'merge') {
        args.merge = true;
      } else {
        console.log('Restore cancelled.');
        return;
      }
    }

    console.log(`Restoring vault${args.merge ? ' (merge mode)' : args.force ? ' (overwrite mode)' : ''}...`);

    const result = await vaultRestore(backupFile, vaultPath, masterKey, {
      force: args.force,
      merge: args.merge
    });

    console.log('');
    console.log('='.repeat(50));
    console.log('Restore Complete');
    console.log('='.repeat(50));
    console.log(`Entries Restored: ${result.entriesRestored}`);
    console.log(`Conflicts Resolved: ${result.conflictsResolved}`);
    console.log(`Duration: ${result.duration}ms`);
    console.log('='.repeat(50));

    const elapsed = Date.now() - startTime;

    const logger = getGlobalAuditLogger();
    if (logger) {
      void logger.log({
        operation: 'cli',
        sessionId,
        level: 'info',
        success: true,
        duration: elapsed,
        details: {
          command: 'vault restore',
          args: sanitizeArgs(args),
          sanitized: true
        }
      });
    }
  } catch (error) {
    const elapsed = Date.now() - startTime;
    const logger = getGlobalAuditLogger();
    if (logger) {
      void logger.log({
        operation: 'cli',
        sessionId,
        level: 'error',
        success: false,
        duration: elapsed,
        details: {
          command: 'vault restore',
          args: sanitizeArgs(args),
          sanitized: true
        }
      });
    }
    console.error(`Error restoring vault: ${error}`);
    process.exit(1);
  }
}

async function handleVaultRepair(args: any): Promise<void> {
  const startTime = Date.now();
  const sessionId = 'cli-vault-repair-' + Date.now();

  try {
    const vaultPath = process.env.MODGUARD_VAULT_PATH || '/tmp/openclaw-modguard-vault.db';
    const masterKey = process.env.MODGUARD_MASTER_KEY || 'default-master-key';

    // Confirm unless --force
    if (!args.force) {
      const readline = await import('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      const answer = await new Promise<string>((resolve) => {
        rl.question('This will attempt to repair the vault database. Continue? (yes/no): ', (ans) => {
          rl.close();
          resolve(ans.toLowerCase());
        });
      });

      if (answer !== 'yes' && answer !== 'y') {
        console.log('Repair cancelled.');
        return;
      }
    }

    console.log('Repairing vault...');

    const result = await vaultRepair(vaultPath, masterKey, {
      backup: args.backup,
      force: args.force
    });

    console.log('');
    console.log('='.repeat(50));
    console.log('Repair Complete');
    console.log('='.repeat(50));
    console.log(`Entries Repaired: ${result.entriesRepaired}`);
    console.log(`Entries Deleted: ${result.entriesDeleted}`);
    console.log(`Unrecoverable: ${result.entriesUnrecoverable}`);
    console.log(`Duration: ${result.duration}ms`);
    console.log('='.repeat(50));

    if (result.entriesUnrecoverable > 0) {
      console.warn(`\nWarning: ${result.entriesUnrecoverable} entries could not be recovered and were deleted.`);
    }

    const elapsed = Date.now() - startTime;

    const logger = getGlobalAuditLogger();
    if (logger) {
      void logger.log({
        operation: 'cli',
        sessionId,
        level: 'info',
        success: true,
        duration: elapsed,
        details: {
          command: 'vault repair',
          args: sanitizeArgs(args),
          sanitized: true
        }
      });
    }
  } catch (error) {
    const elapsed = Date.now() - startTime;
    const logger = getGlobalAuditLogger();
    if (logger) {
      void logger.log({
        operation: 'cli',
        sessionId,
        level: 'error',
        success: false,
        duration: elapsed,
        details: {
          command: 'vault repair',
          args: sanitizeArgs(args),
          sanitized: true
        }
      });
    }
    console.error(`Error repairing vault: ${error}`);
    process.exit(1);
  }
}
