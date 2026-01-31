import { AuditLogger, getGlobalAuditLogger, initializeGlobalAuditLogger } from '../audit.js';
import { AuditFilter, AuditOperationType, LogLevel } from '../types.js';
import { AuditReadError } from '../errors.js';
import * as fs from 'node:fs/promises';

function parseDate(dateStr: string): Date | undefined {
  if (!dateStr) return undefined;

  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      return undefined;
    }
    return date;
  } catch {
    return undefined;
  }
}

function parseOperationTypes(ops: string | string[] | undefined): AuditOperationType[] | undefined {
  if (!ops) return undefined;

  const validOps: AuditOperationType[] = ['mask', 'unmask', 'vault_store', 'vault_retrieve', 'vault_cleanup', 'cli'];
  const opsArray = Array.isArray(ops) ? ops : [ops];

  const result = opsArray
    .map(o => o.trim().toLowerCase())
    .filter((o): o is AuditOperationType => validOps.includes(o as AuditOperationType));

  return result.length > 0 ? result : undefined;
}

async function handleAuditExport(args: any): Promise<void> {
  const startTime = Date.now();

  try {
    const auditLogger = getGlobalAuditLogger();
    if (!auditLogger) {
      console.error('Error: Audit logger not initialized');
      process.exit(1);
    }

    const filter: AuditFilter = {};

    if (args.session) {
      filter.session = args.session;
    }

    if (args.operation) {
      filter.operation = parseOperationTypes(args.operation);
    }

    if (args.start) {
      filter.start = parseDate(args.start);
    }

    if (args.end) {
      filter.end = parseDate(args.end);
    }

    if (args.category) {
      filter.category = Array.isArray(args.category) ? args.category : [args.category];
    }

    const format = args.format || 'json';

    if (format !== 'json' && format !== 'csv') {
      console.error('Error: Invalid format. Must be json or csv');
      process.exit(1);
    }

    let entryCount = 0;
    let firstTimestamp: string | undefined;
    let lastTimestamp: string | undefined;

    if (args.output) {
      const writeStream = await fs.open(args.output, 'w');

      for await (const chunk of auditLogger.export(filter, format)) {
        await writeStream.write(chunk);
        entryCount++;
      }

      await writeStream.close();
      console.log(`Exported ${entryCount} entries to ${args.output}`);
    } else {
      for await (const chunk of auditLogger.export(filter, format)) {
        process.stdout.write(chunk);
        entryCount++;
      }
    }

    console.error(`\n[AUDIT] Export operation completed: ${entryCount} entries`);

    const elapsed = Date.now() - startTime;
    if (elapsed > 500) {
      console.warn(`audit export took ${elapsed}ms (target <500ms)`);
    }
  } catch (error) {
    console.error(`Error exporting audit log: ${error}`);
    process.exit(1);
  }
}

async function handleAuditQuery(args: any): Promise<void> {
  const startTime = Date.now();

  try {
    const auditLogger = getGlobalAuditLogger();
    if (!auditLogger) {
      console.error('Error: Audit logger not initialized');
      process.exit(1);
    }

    const filter: AuditFilter = {};

    if (args.session) {
      filter.session = args.session;
    }

    if (args.operation) {
      filter.operation = parseOperationTypes(args.operation);
    }

    if (args.start) {
      filter.start = parseDate(args.start);
    }

    if (args.end) {
      filter.end = parseDate(args.end);
    }

    if (args.category) {
      filter.category = Array.isArray(args.category) ? args.category : [args.category];
    }

    if (args.level) {
      filter.level = args.level as LogLevel;
    }

    const limit = args.limit || 100;

    const entries = await auditLogger.query(filter, limit);

    if (entries.length === 0) {
      console.log('No audit entries found matching the criteria.');
      return;
    }

    if (args.format === 'json') {
      console.log(JSON.stringify(entries, null, 2));
    } else {
      console.log('='.repeat(100));
      console.log('Audit Log Entries');
      console.log('='.repeat(100));

      for (const entry of entries) {
        console.log(`\nSequence: ${entry.sequence}`);
        console.log(`Timestamp: ${entry.timestamp}`);
        console.log(`Operation: ${entry.operation}`);
        console.log(`Session ID: ${entry.sessionId}`);
        console.log(`Level: ${entry.level}`);
        console.log(`Success: ${entry.success}`);
        if (entry.duration !== undefined) {
          console.log(`Duration: ${entry.duration}ms`);
        }
        console.log(`Details: ${JSON.stringify(entry.details)}`);
      }

      console.log('\n' + '='.repeat(100));
      console.log(`Showing ${entries.length} of ${entries.length} entries`);
      console.log('='.repeat(100));
    }

    console.error(`[AUDIT] Query operation completed: ${entries.length} entries`);

    const elapsed = Date.now() - startTime;
    if (elapsed > 100) {
      console.warn(`audit query took ${elapsed}ms (target <100ms)`);
    }
  } catch (error) {
    console.error(`Error querying audit log: ${error}`);
    process.exit(1);
  }
}

async function handleAuditStats(args: any): Promise<void> {
  const startTime = Date.now();

  try {
    const auditLogger = getGlobalAuditLogger();
    if (!auditLogger) {
      console.error('Error: Audit logger not initialized');
      process.exit(1);
    }

    const period: { start?: Date; end?: Date } = {};

    if (args['period']) {
      const duration = parseDuration(args['period']);
      period.end = new Date();
      period.start = new Date(Date.now() - duration);
    }

    const stats = await auditLogger.stats(period);

    if (args.format === 'json') {
      console.log(JSON.stringify(stats, null, 2));
    } else {
      console.log('='.repeat(50));
      console.log('Audit Log Statistics');
      console.log('='.repeat(50));
      console.log('');
      console.log(`Time Range: ${stats.timeRange.start} to ${stats.timeRange.end}`);
      console.log(`Total Entries: ${stats.totalEntries}`);
      console.log(`Error Count: ${stats.errorCount}`);
      console.log(`Success Rate: ${stats.successRate.toFixed(2)}%`);
      console.log(`Average Duration: ${stats.averageDuration.toFixed(2)}ms`);
      console.log('');
      console.log('Operations:');
      Object.entries(stats.operationCounts).forEach(([op, count]) => {
        if (count > 0) {
          console.log(`  ${op}: ${count}`);
        }
      });
      console.log('');
      console.log('Categories:');
      Object.entries(stats.categoryCounts).forEach(([cat, count]) => {
        console.log(`  ${cat}: ${count}`);
      });
      console.log('');
      console.log('Top Sessions:');
      const topSessions = Object.entries(stats.sessionCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5);
      topSessions.forEach(([session, count]) => {
        console.log(`  ${session.substring(0, 16)}...: ${count}`);
      });
      console.log('');
      console.log('='.repeat(50));
    }

    console.error(`[AUDIT] Stats operation completed`);

    const elapsed = Date.now() - startTime;
    if (elapsed > 50) {
      console.warn(`audit stats took ${elapsed}ms (target <50ms)`);
    }
  } catch (error) {
    console.error(`Error getting audit stats: ${error}`);
    process.exit(1);
  }
}

async function handleAuditVerify(args: any): Promise<void> {
  const startTime = Date.now();

  try {
    const auditLogger = getGlobalAuditLogger();
    if (!auditLogger) {
      console.error('Error: Audit logger not initialized');
      process.exit(1);
    }

    const start = args.start ? parseDate(args.start) : undefined;
    const end = args.end ? parseDate(args.end) : undefined;

    const report = await auditLogger.verify(start, end);

    console.log('='.repeat(50));
    console.log('Audit Log Integrity Verification');
    console.log('='.repeat(50));
    console.log('');
    console.log(`Status: ${report.valid ? 'PASS' : 'FAIL'}`);
    console.log(`Checksum: ${report.checksum || 'N/A'}`);
    console.log('');

    if (report.sequenceGaps.length > 0) {
      console.log(`Sequence Gaps: ${report.sequenceGaps.length}`);
      console.log(`  Gaps at: ${report.sequenceGaps.join(', ')}`);
      console.log('');
    } else {
      console.log('Sequence Gaps: None');
      console.log('');
    }

    if (report.duplicateEntries.length > 0) {
      console.log(`Duplicate Entries: ${report.duplicateEntries.length}`);
      console.log(`  Duplicates at sequences: ${report.duplicateEntries.join(', ')}`);
      console.log('');
    } else {
      console.log('Duplicate Entries: None');
      console.log('');
    }

    if (report.corruptedLines.length > 0) {
      console.log(`Corrupted Lines: ${report.corruptedLines.length}`);
      console.log(`  Corrupted lines: ${report.corruptedLines.join(', ')}`);
      console.log('');
    } else {
      console.log('Corrupted Lines: None');
      console.log('');
    }

    console.log('='.repeat(50));

    console.error(`[AUDIT] Verify operation completed: ${report.valid ? 'PASS' : 'FAIL'}`);

    const elapsed = Date.now() - startTime;
    if (elapsed > 1000) {
      console.warn(`audit verify took ${elapsed}ms (target <1s)`);
    }
  } catch (error) {
    console.error(`Error verifying audit log: ${error}`);
    process.exit(1);
  }
}

async function handleAuditTail(args: any): Promise<void> {
  const startTime = Date.now();

  try {
    const auditLogger = getGlobalAuditLogger();
    if (!auditLogger) {
      console.error('Error: Audit logger not initialized');
      process.exit(1);
    }

    const count = args.count || 10;

    const filter: AuditFilter = {};

    if (args.operation) {
      filter.operation = parseOperationTypes(args.operation);
    }

    if (args.level) {
      filter.level = args.level as LogLevel;
    }

    if (args.follow) {
      console.log('\x1b[33mFollowing audit logs in real-time... (Ctrl+C to stop)\x1b[0m\n');

      try {
        for await (const entry of auditLogger.follow(filter)) {
          const colorCode = getColorForEntry(entry);
          const resetColor = '\x1b[0m';

          console.log(`${colorCode}${entry.timestamp} ${entry.operation} ${entry.sessionId.substring(0, 8)}... ${entry.level}${resetColor}`);
          console.log(`  ${JSON.stringify(entry.details)}\n`);
        }
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          throw error;
        }
      }
    } else {
      const entries = await auditLogger.query(filter, count);

      if (entries.length === 0) {
        console.log('No audit entries found.');
        return;
      }

      console.log(`Last ${entries.length} entries:\n`);

      for (const entry of entries) {
        const colorCode = getColorForEntry(entry);
        const resetColor = '\x1b[0m';

        console.log(`${colorCode}${entry.timestamp} ${entry.operation} ${entry.sessionId.substring(0, 8)}... ${entry.level}${resetColor}`);
        console.log(`  ${JSON.stringify(entry.details)}\n`);
      }

      console.error(`[AUDIT] Tail operation completed: ${entries.length} entries`);

      const elapsed = Date.now() - startTime;
      if (elapsed > 100) {
        console.warn(`audit tail took ${elapsed}ms (target <100ms)`);
      }
    }
  } catch (error) {
    console.error(`Error tailing audit log: ${error}`);
    process.exit(1);
  }
}

function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+)([hdm])$/);
  if (!match) {
    throw new Error(`Invalid duration format: ${duration}. Expected format: <number><unit> where unit is h (hours), d (days), or m (minutes)`);
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  const unitToMs = {
    'm': 60000,
    'h': 3600000,
    'd': 86400000
  };

  return value * (unitToMs[unit as keyof typeof unitToMs] || 0);
}

function getColorForEntry(entry: any): string {
  if (entry.level === 'error') return '\x1b[31m';
  if (entry.operation === 'mask') return '\x1b[34m';
  if (entry.operation === 'unmask') return '\x1b[32m';
  return '\x1b[0m';
}

export function registerAuditCommands(yargs: any): void {
  yargs.command('audit', 'Audit log management', (yargs) => {
    return yargs
      .command('export', 'Export audit logs', (yargs) => {
        return yargs
          .option('start', {
            type: 'string',
            description: 'Start date (ISO 8601 format)'
          })
          .option('end', {
            type: 'string',
            description: 'End date (ISO 8601 format)'
          })
          .option('operation', {
            type: 'string',
            array: true,
            description: 'Filter by operation type (mask, unmask, vault_store, vault_retrieve, vault_cleanup, cli)'
          })
          .option('session', {
            type: 'string',
            description: 'Filter by session ID'
          })
          .option('category', {
            type: 'string',
            array: true,
            description: 'Filter by category'
          })
          .option('format', {
            type: 'string',
            choices: ['json', 'csv'],
            default: 'json',
            description: 'Output format'
          })
          .option('output', {
            type: 'string',
            description: 'Output file path (if not specified, prints to stdout)'
          })
          .example('$0 audit export --start 2024-01-01 --end 2024-01-31 --format csv --output audit.csv', 'Export January 2024 logs to CSV');
      }, handleAuditExport)
      .command('query', 'Query audit logs', (yargs) => {
        return yargs
          .option('session', {
            type: 'string',
            description: 'Filter by session ID'
          })
          .option('operation', {
            type: 'string',
            array: true,
            description: 'Filter by operation type'
          })
          .option('start', {
            type: 'string',
            description: 'Start date (ISO 8601 format)'
          })
          .option('end', {
            type: 'string',
            description: 'End date (ISO 8601 format)'
          })
          .option('category', {
            type: 'string',
            array: true,
            description: 'Filter by category'
          })
          .option('level', {
            type: 'string',
            choices: ['info', 'warn', 'error'],
            description: 'Filter by log level'
          })
          .option('format', {
            type: 'string',
            choices: ['table', 'json'],
            default: 'table',
            description: 'Output format'
          })
          .option('limit', {
            type: 'number',
            default: 100,
            description: 'Maximum number of entries to return'
          })
          .example('$0 audit query --session abc123 --limit 50', 'Query last 50 entries for session abc123');
      }, handleAuditQuery)
      .command('stats', 'Show audit log statistics', (yargs) => {
        return yargs
          .option('period', {
            type: 'string',
            description: 'Time period (e.g., 24h, 7d, 30m)'
          })
          .option('format', {
            type: 'string',
            choices: ['table', 'json'],
            default: 'table',
            description: 'Output format'
          })
          .example('$0 audit stats --period 24h', 'Show statistics for the last 24 hours');
      }, handleAuditStats)
      .command('verify', 'Verify audit log integrity', (yargs) => {
        return yargs
          .option('start', {
            type: 'string',
            description: 'Start date (ISO 8601 format)'
          })
          .option('end', {
            type: 'string',
            description: 'End date (ISO 8601 format)'
          })
          .example('$0 audit verify --start 2024-01-01', 'Verify audit logs from 2024-01-01 onwards');
      }, handleAuditVerify)
      .command('tail', 'Show recent audit log entries', (yargs) => {
        return yargs
          .option('count', {
            type: 'number',
            default: 10,
            description: 'Number of entries to show'
          })
          .option('follow', {
            alias: 'f',
            type: 'boolean',
            default: false,
            description: 'Follow audit log in real-time (like tail -f)'
          })
          .option('operation', {
            type: 'string',
            array: true,
            description: 'Filter by operation type'
          })
          .option('level', {
            type: 'string',
            choices: ['info', 'warn', 'error'],
            description: 'Filter by log level'
          })
          .example('$0 audit tail --count 20 --operation mask', 'Show last 20 mask operations')
          .example('$0 audit tail --follow', 'Follow audit log in real-time');
      }, handleAuditTail)
      .demandCommand(1, 'Please specify an audit command');
  });
}
