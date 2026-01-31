import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { open, constants } from 'node:fs/promises';
import { watch } from 'node:fs/promises';
import {
  AuditEntry,
  AuditFilter,
  AuditStats,
  IntegrityReport,
  RetentionPolicy,
  LogLevel,
  AuditOperationType
} from './types.js';
import {
  AuditWriteError,
  AuditReadError,
  AuditIntegrityError,
  AuditRetentionPolicyError
} from './errors.js';

const DEFAULT_LOG_DIR = '.openclaw/modguard';
const DEFAULT_LOG_FILE = 'audit.jsonl';
const MAX_QUEUE_SIZE = 1000;
const MAX_SEQUENCE_CACHE_SIZE = 10000;
const DEFAULT_AUDIT_KEY = 'openclaw-modguard-audit-key';

interface WriteQueueItem {
  entry: AuditEntry;
  resolve: (value: void) => void;
  reject: (reason?: unknown) => void;
}

interface SignedAuditEntry extends AuditEntry {
  signature: string;
}

export class AuditLogger {
  private logDir: string;
  private logPath: string;
  private currentSequence: number;
  private writeQueue: WriteQueueItem[];
  private isWriting: boolean;
  private fileHandle: Awaited<ReturnType<typeof open>> | null;
  private retentionPolicy: RetentionPolicy;
  private sequenceCache: Set<number>;
  private minLevel: LogLevel;
  private auditKey: Buffer;

  constructor(logDir?: string, retentionPolicy?: Partial<RetentionPolicy>, minLevel: LogLevel = 'info', auditKey?: string | Buffer) {
    this.logDir = logDir || path.join(process.env.HOME || process.cwd(), DEFAULT_LOG_DIR);
    this.logPath = path.join(this.logDir, DEFAULT_LOG_FILE);
    this.currentSequence = 0;
    this.writeQueue = [];
    this.isWriting = false;
    this.fileHandle = null;
    this.minLevel = minLevel;
    this.sequenceCache = new Set();
    this.auditKey = typeof auditKey === 'string' ? Buffer.from(auditKey, 'hex') : auditKey || Buffer.from(DEFAULT_AUDIT_KEY, 'utf8');
    this.retentionPolicy = {
      enabled: retentionPolicy?.enabled ?? false,
      maxAgeDays: retentionPolicy?.maxAgeDays ?? 90,
      maxFileSizeMB: retentionPolicy?.maxFileSizeMB ?? 1024,
      compressionEnabled: retentionPolicy?.compressionEnabled ?? false
    };
  }

  async initialize(): Promise<void> {
    await fs.mkdir(this.logDir, { recursive: true });

    try {
      await fs.access(this.logPath);
      await this.loadSequenceNumber();
    } catch {
      this.currentSequence = 0;
    }

    this.fileHandle = await open(this.logPath, constants.O_WRONLY | constants.O_CREAT | constants.O_APPEND, 0o600);
  }

  async log(entry: Omit<AuditEntry, 'sequence' | 'timestamp' | 'signature'>): Promise<void> {
    if (!this.shouldLog(entry.level)) {
      return;
    }

    if (this.writeQueue.length >= MAX_QUEUE_SIZE) {
      throw new AuditWriteError('Audit write queue is full', { queueSize: this.writeQueue.length });
    }

    const baseEntry: Omit<SignedAuditEntry, 'sequence' | 'timestamp' | 'signature'> = {
      operation: entry.operation,
      sessionId: entry.sessionId,
      level: entry.level,
      success: entry.success,
      duration: entry.duration,
      details: entry.details
    };

    const fullEntry: SignedAuditEntry = {
      ...baseEntry,
      sequence: ++this.currentSequence,
      timestamp: new Date().toISOString(),
      signature: this.signEntry(baseEntry, this.currentSequence)
    };

    return new Promise<void>((resolve, reject) => {
      this.writeQueue.push({
        entry: fullEntry,
        resolve,
        reject
      });

      void this.processQueue();
    });
  }

  async query(filter: AuditFilter, limit: number = 100): Promise<AuditEntry[]> {
    const entries: AuditEntry[] = [];
    const now = Date.now();

    try {
      const lines = await fs.readFile(this.logPath, 'utf-8');
      const logLines = lines.trim().split('\n');

      for (const line of logLines) {
        if (!line.trim()) continue;

        try {
          const entry = JSON.parse(line) as AuditEntry;

          if (this.matchesFilter(entry, filter, now)) {
            entries.push(entry);
            if (entries.length >= limit) break;
          }
        } catch (e) {
          continue;
        }
      }

      return entries.sort((a, b) => a.sequence - b.sequence);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw new AuditReadError('Failed to read audit log', { error });
    }
  }

  async stats(period?: { start?: Date; end?: Date }): Promise<AuditStats> {
    const entries = await this.query({});
    const now = Date.now();

    const periodStart = period?.start?.getTime() ?? 0;
    const periodEnd = period?.end?.getTime() ?? now;

    const filteredEntries = entries.filter(
      e => new Date(e.timestamp).getTime() >= periodStart && new Date(e.timestamp).getTime() <= periodEnd
    );

    const operationCounts: Record<AuditOperationType, number> = {
      mask: 0,
      unmask: 0,
      vault_store: 0,
      vault_retrieve: 0,
      vault_cleanup: 0,
      cli: 0
    };

    const categoryCounts: Record<string, number> = {};
    const sessionCounts: Record<string, number> = {};
    let totalDuration = 0;
    let durationCount = 0;

    for (const entry of filteredEntries) {
      operationCounts[entry.operation]++;

      if (entry.operation === 'mask') {
        const details = entry.details as { categories?: Record<string, number> };
        if (details.categories) {
          for (const [cat, count] of Object.entries(details.categories)) {
            categoryCounts[cat] = (categoryCounts[cat] || 0) + count;
          }
        }
      } else if (entry.operation === 'unmask') {
        const details = entry.details as { categories?: string[] };
        if (details.categories) {
          for (const cat of details.categories) {
            categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
          }
        }
      }

      sessionCounts[entry.sessionId] = (sessionCounts[entry.sessionId] || 0) + 1;

      if (entry.duration !== undefined) {
        totalDuration += entry.duration;
        durationCount++;
      }
    }

    const errorCount = filteredEntries.filter(e => !e.success).length;
    const successRate = filteredEntries.length > 0
      ? ((filteredEntries.length - errorCount) / filteredEntries.length) * 100
      : 100;

    const timeRange = filteredEntries.length > 0
      ? {
          start: filteredEntries[0].timestamp,
          end: filteredEntries[filteredEntries.length - 1].timestamp
        }
      : { start: new Date().toISOString(), end: new Date().toISOString() };

    return {
      totalEntries: filteredEntries.length,
      operationCounts,
      categoryCounts,
      sessionCounts,
      errorCount,
      successRate,
      averageDuration: durationCount > 0 ? totalDuration / durationCount : 0,
      timeRange
    };
  }

  async *export(filter: AuditFilter, format: 'json' | 'csv'): AsyncGenerator<string> {
    const entries = await this.query(filter, 100000);

    if (format === 'json') {
      for (const entry of entries) {
        yield JSON.stringify(entry) + '\n';
      }
    } else {
      yield 'sequence,timestamp,operation,sessionId,level,success,duration,details\n';
      for (const entry of entries) {
        const row = [
          entry.sequence,
          entry.timestamp,
          entry.operation,
          entry.sessionId,
          entry.level,
          entry.success,
          entry.duration ?? '',
          JSON.stringify(entry.details).replace(/"/g, '""')
        ];
        yield row.join(',') + '\n';
      }
    }
  }

  async verify(start?: Date, end?: Date): Promise<IntegrityReport> {
    const entries = await this.query({});
    const now = Date.now();

    const periodStart = start?.getTime() ?? 0;
    const periodEnd = end?.getTime() ?? now;

    const filteredEntries = entries.filter(
      e => new Date(e.timestamp).getTime() >= periodStart && new Date(e.timestamp).getTime() <= periodEnd
    );

    const sequenceGaps: number[] = [];
    const duplicateEntries: number[] = [];
    const corruptedLines: number[] = [];
    const invalidSignatures: number[] = [];

    const seenSequences = new Map<number, number>();
    let lastSequence = 0;

    for (const entry of filteredEntries) {
      const signedEntry = entry as SignedAuditEntry;

      if (!signedEntry.signature) {
        invalidSignatures.push(entry.sequence);
        continue;
      }

      if (!this.verifyEntry(signedEntry)) {
        invalidSignatures.push(entry.sequence);
      }

      if (seenSequences.has(entry.sequence)) {
        duplicateEntries.push(entry.sequence);
      } else {
        seenSequences.set(entry.sequence, 1);
      }

      if (lastSequence > 0 && entry.sequence !== lastSequence + 1) {
        sequenceGaps.push(lastSequence + 1);
      }

      lastSequence = entry.sequence;
    }

    const checksum = this.calculateChecksum(filteredEntries);

    return {
      valid: sequenceGaps.length === 0 && duplicateEntries.length === 0 && corruptedLines.length === 0 && invalidSignatures.length === 0,
      sequenceGaps,
      duplicateEntries,
      corruptedLines,
      checksum
    };
  }

  tail(count: number = 10): AuditEntry[] {
    const entries: AuditEntry[] = [];

    try {
      if (!fsSync.existsSync(this.logPath)) {
        return entries;
      }

      const content = fsSync.readFileSync(this.logPath, 'utf-8');
      const lines = content.trim().split('\n').filter(line => line.trim());

      const tailLines = lines.slice(-count);

      for (const line of tailLines) {
        try {
          const entry = JSON.parse(line) as AuditEntry;
          entries.push(entry);
        } catch {
          continue;
        }
      }

      return entries;
    } catch {
      return entries;
    }
  }

  async applyRetentionPolicy(): Promise<number> {
    if (!this.retentionPolicy.enabled) {
      return 0;
    }

    try {
      const stats = await fs.stat(this.logPath);
      const fileSizeMB = stats.size / (1024 * 1024);

      if (fileSizeMB < this.retentionPolicy.maxFileSizeMB) {
        return 0;
      }

      const now = Date.now();
      const cutoffMs = now - (this.retentionPolicy.maxAgeDays * 24 * 60 * 60 * 1000);
      const entries: AuditEntry[] = [];
      let deletedCount = 0;

      const lines = (await fs.readFile(this.logPath, 'utf-8')).split('\n');

      const filteredLines = lines.filter(line => {
        if (!line.trim()) return true;

        try {
          const entry = JSON.parse(line) as AuditEntry;
          const entryTime = new Date(entry.timestamp).getTime();

          if (entryTime < cutoffMs) {
            deletedCount++;
            return false;
          }

          return true;
        } catch {
          return true;
        }
      });

      if (deletedCount > 0) {
        await fs.writeFile(this.logPath, filteredLines.join('\n'), { mode: 0o600 });
        await this.loadSequenceNumber();
      }

      return deletedCount;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return 0;
      }
      throw new AuditRetentionPolicyError('Failed to apply retention policy', { error });
    }
  }

  async close(): Promise<void> {
    await this.processQueue();

    if (this.fileHandle) {
      await this.fileHandle.close();
      this.fileHandle = null;
    }
  }

  private async processQueue(): Promise<void> {
    if (this.isWriting || this.writeQueue.length === 0) {
      return;
    }

    this.isWriting = true;

    try {
      while (this.writeQueue.length > 0) {
        const item = this.writeQueue.shift();
        if (!item) break;

        const line = JSON.stringify(item.entry) + '\n';

        if (this.fileHandle) {
          await this.fileHandle.write(line);
        }

        if (this.retentionPolicy.enabled && item.entry.sequence % 100 === 0) {
          await this.applyRetentionPolicy();
        }

        item.resolve();
      }
    } catch (error) {
      for (const item of this.writeQueue) {
        item.reject(error);
      }
      this.writeQueue = [];
    } finally {
      this.isWriting = false;
    }
  }

  private async loadSequenceNumber(): Promise<void> {
    try {
      const lines = (await fs.readFile(this.logPath, 'utf-8')).split('\n').filter(l => l.trim());

      if (lines.length > 0) {
        const lastLine = lines[lines.length - 1];
        const lastEntry = JSON.parse(lastLine) as AuditEntry;
        this.currentSequence = lastEntry.sequence;
      }
    } catch {
      this.currentSequence = 0;
    }
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: Record<LogLevel, number> = { info: 1, warn: 2, error: 3 };
    return levels[level] >= levels[this.minLevel];
  }

  private matchesFilter(entry: AuditEntry, filter: AuditFilter, now: number): boolean {
    if (filter.session && entry.sessionId !== filter.session) {
      return false;
    }

    if (filter.operation && filter.operation.length > 0 && !filter.operation.includes(entry.operation)) {
      return false;
    }

    if (filter.level && entry.level !== filter.level) {
      return false;
    }

    if (filter.start || filter.end) {
      const entryTime = new Date(entry.timestamp).getTime();
      if (filter.start && entryTime < filter.start.getTime()) {
        return false;
      }
      if (filter.end && entryTime > filter.end.getTime()) {
        return false;
      }
    }

    if (filter.category && filter.category.length > 0) {
      const entryCategories = this.getEntryCategories(entry);
      if (!filter.category.some(c => entryCategories.includes(c))) {
        return false;
      }
    }

    return true;
  }

  private getEntryCategories(entry: AuditEntry): string[] {
    if (entry.operation === 'mask') {
      const details = entry.details as { categories?: Record<string, number> };
      return details.categories ? Object.keys(details.categories) : [];
    }

    if (entry.operation === 'unmask') {
      const details = entry.details as { categories?: string[] };
      return details.categories || [];
    }

    if (entry.operation === 'vault_store' || entry.operation === 'vault_retrieve') {
      const details = entry.details as { category?: string };
      return details.category ? [details.category] : [];
    }

    return [];
  }

  private calculateChecksum(entries: AuditEntry[]): string {
    const combined = entries.map(e => `${e.sequence}:${e.timestamp}:${e.operation}:${e.sessionId}`).join('|');
    return crypto.createHash('sha256').update(combined).digest('hex');
  }

  getLogPath(): string {
    return this.logPath;
  }

  private signEntry(entry: Omit<AuditEntry, 'sequence' | 'timestamp' | 'signature'>, sequence: number): string {
    const data = JSON.stringify({ ...entry, sequence });
    const hmac = crypto.createHmac('sha256', this.auditKey);
    hmac.update(data);
    return hmac.digest('hex');
  }

  private verifyEntry(entry: SignedAuditEntry): boolean {
    const entryWithoutSignature: Omit<AuditEntry, 'signature'> = {
      operation: entry.operation,
      sessionId: entry.sessionId,
      level: entry.level,
      success: entry.success,
      duration: entry.duration,
      details: entry.details,
      sequence: entry.sequence,
      timestamp: entry.timestamp
    };

    const expectedSignature = this.signEntry(entryWithoutSignature as any, entry.sequence);
    return entry.signature === expectedSignature;
  }

  async *follow(filter?: AuditFilter, pollIntervalMs: number = 100): AsyncGenerator<AuditEntry> {
    if (!fsSync.existsSync(this.logPath)) {
      return;
    }

    let lastSize = fsSync.statSync(this.logPath).size;
    const ac = new AbortController();
    const { signal } = ac;

    try {
      const watcher = watch(this.logPath, { signal });
      let buffer = '';

      for await (const event of watcher) {
        if (event.eventType === 'change') {
          const stats = fsSync.statSync(this.logPath);
          if (stats.size > lastSize) {
            const fd = fsSync.openSync(this.logPath, 'r');
            const bufferRead = Buffer.alloc(stats.size - lastSize);
            fsSync.readSync(fd, bufferRead, 0, bufferRead.length, lastSize);
            fsSync.closeSync(fd);

            buffer += bufferRead.toString('utf-8');
            const lines = buffer.split('\n');

            buffer = lines.pop() || '';

            for (const line of lines) {
              if (!line.trim()) continue;

              try {
                const entry = JSON.parse(line) as AuditEntry;

                if (!filter || this.matchesFilter(entry, filter, Date.now())) {
                  yield entry;
                }
              } catch {
                continue;
              }
            }

            lastSize = stats.size;
          }
        }
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        throw error;
      }
    }
  }
}

export let globalAuditLogger: AuditLogger | null = null;

export function initializeGlobalAuditLogger(options?: {
  logDir?: string;
  retentionPolicy?: Partial<RetentionPolicy>;
  minLevel?: LogLevel;
}): AuditLogger {
  if (globalAuditLogger) {
    return globalAuditLogger;
  }

  globalAuditLogger = new AuditLogger(
    options?.logDir,
    options?.retentionPolicy,
    options?.minLevel
  );

  void globalAuditLogger.initialize();

  return globalAuditLogger;
}

export function getGlobalAuditLogger(): AuditLogger | null {
  return globalAuditLogger;
}

export function setGlobalAuditLogger(logger: AuditLogger): void {
  globalAuditLogger = logger;
}
