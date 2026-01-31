import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AuditLogger } from '../src/audit.js';
import { AuditEntry, AuditFilter, RetentionPolicy } from '../src/types.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

describe('AuditLogger', () => {
  const testLogDir = '/tmp/test-audit-logs';
  let auditLogger: AuditLogger;

  beforeEach(async () => {
    await fs.rm(testLogDir, { recursive: true, force: true }).catch(() => {});
    await fs.mkdir(testLogDir, { recursive: true });

    auditLogger = new AuditLogger(testLogDir, undefined, 'info');
    await auditLogger.initialize();
  });

  afterEach(async () => {
    await auditLogger.close();
    await fs.rm(testLogDir, { recursive: true, force: true }).catch(() => {});
  });

  describe('basic logging', () => {
    it('should log an audit entry', async () => {
      await auditLogger.log({
        operation: 'mask',
        sessionId: 'test-session-1',
        level: 'info',
        success: true,
        duration: 10,
        details: {
          category: 'email',
          tokenCount: 1,
          categories: { email: 1 }
        }
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      const entries = await auditLogger.query({});
      expect(entries.length).toBe(1);
      expect(entries[0].operation).toBe('mask');
      expect(entries[0].sessionId).toBe('test-session-1');
      expect(entries[0].success).toBe(true);
    });

    it('should log multiple entries with increasing sequence numbers', async () => {
      await auditLogger.log({
        operation: 'mask',
        sessionId: 'session-1',
        level: 'info',
        success: true,
        duration: 5,
        details: {
          category: 'email',
          tokenCount: 1,
          categories: { email: 1 }
        }
      });

      await auditLogger.log({
        operation: 'unmask',
        sessionId: 'session-1',
        level: 'info',
        success: true,
        duration: 3,
        details: {
          tokenCount: 1,
          categories: ['email']
        }
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      const entries = await auditLogger.query({});
      expect(entries.length).toBe(2);
      expect(entries[0].sequence).toBeLessThan(entries[1].sequence);
    });

    it('should not log PII values', async () => {
      await auditLogger.log({
        operation: 'mask',
        sessionId: 'test-session',
        level: 'info',
        success: true,
        duration: 10,
        details: {
          category: 'email',
          tokenCount: 1,
          categories: { email: 1 }
        }
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      const logPath = auditLogger.getLogPath();
      const logContent = await fs.readFile(logPath, 'utf-8');

      expect(logContent).not.toContain('user@example.com');
      expect(logContent).toContain('email');
      expect(logContent).toContain('tokenCount');
    });
  });

  describe('query functionality', () => {
    it('should filter by session ID', async () => {
      await auditLogger.log({
        operation: 'mask',
        sessionId: 'session-a',
        level: 'info',
        success: true,
        details: {
          category: 'email',
          tokenCount: 1,
          categories: { email: 1 }
        }
      });

      await auditLogger.log({
        operation: 'mask',
        sessionId: 'session-b',
        level: 'info',
        success: true,
        details: {
          category: 'phone',
          tokenCount: 1,
          categories: { phone: 1 }
        }
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      const results = await auditLogger.query({ session: 'session-a' });
      expect(results.length).toBe(1);
      expect(results[0].sessionId).toBe('session-a');
    });

    it('should filter by operation type', async () => {
      await auditLogger.log({
        operation: 'mask',
        sessionId: 'session-1',
        level: 'info',
        success: true,
        details: {
          category: 'email',
          tokenCount: 1,
          categories: { email: 1 }
        }
      });

      await auditLogger.log({
        operation: 'unmask',
        sessionId: 'session-1',
        level: 'info',
        success: true,
        details: {
          tokenCount: 1,
          categories: ['email']
        }
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      const results = await auditLogger.query({ operation: ['mask'] });
      expect(results.length).toBe(1);
      expect(results[0].operation).toBe('mask');
    });

    it('should respect limit parameter', async () => {
      for (let i = 0; i < 10; i++) {
        await auditLogger.log({
          operation: 'mask',
          sessionId: `session-${i}`,
          level: 'info',
          success: true,
          details: {
            category: 'email',
            tokenCount: 1,
            categories: { email: 1 }
          }
        });
      }

      await new Promise(resolve => setTimeout(resolve, 50));

      const results = await auditLogger.query({}, 5);
      expect(results.length).toBe(5);
    });
  });

  describe('stats functionality', () => {
    it('should calculate statistics correctly', async () => {
      await auditLogger.log({
        operation: 'mask',
        sessionId: 'session-1',
        level: 'info',
        success: true,
        duration: 10,
        details: {
          category: 'email',
          tokenCount: 2,
          categories: { email: 2 }
        }
      });

      await auditLogger.log({
        operation: 'mask',
        sessionId: 'session-1',
        level: 'info',
        success: true,
        duration: 15,
        details: {
          category: 'phone',
          tokenCount: 1,
          categories: { phone: 1 }
        }
      });

      await auditLogger.log({
        operation: 'mask',
        sessionId: 'session-2',
        level: 'error',
        success: false,
        duration: 5,
        details: {
          category: 'email',
          tokenCount: 0,
          categories: {}
        }
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      const stats = await auditLogger.stats();
      expect(stats.totalEntries).toBe(3);
      expect(stats.operationCounts.mask).toBe(3);
      expect(stats.categoryCounts.email).toBe(2);
      expect(stats.categoryCounts.phone).toBe(1);
      expect(stats.errorCount).toBe(1);
      expect(stats.successRate).toBeCloseTo(66.67, 1);
    });
  });

  describe('integrity verification', () => {
    it('should verify log integrity for valid logs', async () => {
      await auditLogger.log({
        operation: 'mask',
        sessionId: 'session-1',
        level: 'info',
        success: true,
        details: {
          category: 'email',
          tokenCount: 1,
          categories: { email: 1 }
        }
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      const report = await auditLogger.verify();
      expect(report.valid).toBe(true);
      expect(report.sequenceGaps.length).toBe(0);
      expect(report.duplicateEntries.length).toBe(0);
      expect(report.corruptedLines.length).toBe(0);
      expect(report.checksum).toBeDefined();
    });
  });

  describe('log level filtering', () => {
    it('should only log entries at or above minimum level', async () => {
      const lowLevelLogger = new AuditLogger(testLogDir, undefined, 'warn');
      await lowLevelLogger.initialize();

      await lowLevelLogger.log({
        operation: 'mask',
        sessionId: 'session-1',
        level: 'info',
        success: true,
        details: {
          category: 'email',
          tokenCount: 1,
          categories: { email: 1 }
        }
      });

      await lowLevelLogger.log({
        operation: 'mask',
        sessionId: 'session-1',
        level: 'warn',
        success: false,
        details: {
          category: 'email',
          tokenCount: 0,
          categories: {}
        }
      });

      await new Promise(resolve => setTimeout(resolve, 50));
      await lowLevelLogger.close();

      const results = await lowLevelLogger.query({});
      expect(results.length).toBe(1);
      expect(results[0].level).toBe('warn');
    });
  });

  describe('tail functionality', () => {
    beforeEach(async () => {
      for (let i = 0; i < 15; i++) {
        await auditLogger.log({
          operation: 'mask',
          sessionId: `session-${i}`,
          level: 'info',
          success: true,
          duration: i,
          details: {
            category: 'email',
            tokenCount: 1,
            categories: { email: 1 }
          }
        });
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    it('should return last N entries', () => {
      const entries = auditLogger.tail(5);
      expect(entries.length).toBe(5);
      expect(entries[0].sessionId).toBe('session-10');
      expect(entries[4].sessionId).toBe('session-14');
    });

    it('should return all entries if count exceeds total', () => {
      const entries = auditLogger.tail(100);
      expect(entries.length).toBe(15);
    });

    it('should default to 10 entries when count not specified', () => {
      const entries = auditLogger.tail();
      expect(entries.length).toBe(10);
    });

    it('should return empty array for non-existent log file', async () => {
      const nonExistentDir = '/tmp/non-existent-audit';
      const logger = new AuditLogger(nonExistentDir);
      await logger.initialize();

      const entries = logger.tail(10);
      expect(entries.length).toBe(0);

      await logger.close();
      await fs.rm(nonExistentDir, { recursive: true, force: true }).catch(() => {});
    });
  });

  describe('export functionality', () => {
    beforeEach(async () => {
      await auditLogger.log({
        operation: 'mask',
        sessionId: 'session-1',
        level: 'info',
        success: true,
        duration: 5,
        details: {
          category: 'email',
          tokenCount: 1,
          categories: { email: 1 }
        }
      });

      await auditLogger.log({
        operation: 'unmask',
        sessionId: 'session-1',
        level: 'info',
        success: true,
        duration: 3,
        details: {
          tokenCount: 1,
          categories: ['email']
        }
      });

      await new Promise(resolve => setTimeout(resolve, 50));
    });

    it('should export entries in JSON format', async () => {
      const chunks: string[] = [];
      for await (const chunk of auditLogger.export({}, 'json')) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBe(2);
      const entry1 = JSON.parse(chunks[0]);
      const entry2 = JSON.parse(chunks[1]);
      expect(entry1.operation).toBe('mask');
      expect(entry2.operation).toBe('unmask');
    });

    it('should export entries in CSV format', async () => {
      const chunks: string[] = [];
      for await (const chunk of auditLogger.export({}, 'csv')) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBe(3);
      expect(chunks[0]).toContain('sequence,timestamp,operation');
      expect(chunks[1]).toContain('mask');
      expect(chunks[2]).toContain('unmask');
    });

    it('should filter exports by operation type', async () => {
      const chunks: string[] = [];
      for await (const chunk of auditLogger.export({ operation: ['mask'] }, 'json')) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBe(1);
      const entry = JSON.parse(chunks[0]);
      expect(entry.operation).toBe('mask');
    });
  });

  describe('concurrent writes', () => {
    it('should handle multiple concurrent write operations', async () => {
      const promises = Array.from({ length: 50 }, (_, i) =>
        auditLogger.log({
          operation: 'mask',
          sessionId: `session-${i}`,
          level: 'info',
          success: true,
          details: {
            category: 'email',
            tokenCount: 1,
            categories: { email: 1 }
          }
        })
      );

      await Promise.all(promises);

      const entries = await auditLogger.query({});
      expect(entries.length).toBe(50);

      const sequences = entries.map(e => e.sequence);
      const sorted = [...sequences].sort((a, b) => a - b);
      expect(sequences).toEqual(sorted);
    });
  });

  describe('date range filtering', () => {
    beforeEach(async () => {
      const now = Date.now();

      await auditLogger.log({
        operation: 'mask',
        sessionId: 'session-1',
        level: 'info',
        success: true,
        details: {
          category: 'email',
          tokenCount: 1,
          categories: { email: 1 }
        }
      });

      await auditLogger.log({
        operation: 'unmask',
        sessionId: 'session-2',
        level: 'info',
        success: true,
        details: {
          tokenCount: 1,
          categories: ['email']
        }
      });

      await new Promise(resolve => setTimeout(resolve, 50));
    });

    it('should filter entries by date range', async () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const entries = await auditLogger.query({ start: yesterday, end: now });
      expect(entries.length).toBe(2);
    });
  });

  describe('error handling', () => {
    it('should handle corrupted log lines gracefully', async () => {
      await fs.writeFile(auditLogger.getLogPath(), '{"valid": true}\ninvalid json\n{"also": "valid"}\n');

      const entries = await auditLogger.query({});
      expect(entries.length).toBe(2);
    });

    it('should return empty array when no matching entries', async () => {
      const entries = await auditLogger.query({ session: 'non-existent-session' });
      expect(entries.length).toBe(0);
    });
  });

  describe('retention policy', () => {
    it('should not apply policy when disabled', async () => {
      const logger = new AuditLogger(testLogDir, { enabled: false, maxAgeDays: 0, maxFileSizeMB: 1, compressionEnabled: false });
      await logger.initialize();

      await logger.log({
        operation: 'mask',
        sessionId: 'session',
        level: 'info',
        success: true,
        details: {
          category: 'email',
          tokenCount: 1,
          categories: { email: 1 }
        }
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      const deletedCount = await logger.applyRetentionPolicy();
      expect(deletedCount).toBe(0);

      await logger.close();
    });

    it('should apply policy when enabled and entries are old', async () => {
      const logger = new AuditLogger(testLogDir, { enabled: true, maxAgeDays: -1, maxFileSizeMB: 0, compressionEnabled: false });
      await logger.initialize();

      await logger.log({
        operation: 'mask',
        sessionId: 'session',
        level: 'info',
        success: true,
        details: {
          category: 'email',
          tokenCount: 1,
          categories: { email: 1 }
        }
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      const deletedCount = await logger.applyRetentionPolicy();
      expect(deletedCount).toBeGreaterThan(0);

      await logger.close();
    });
  });

  describe('cleanup', () => {
    it('should close file handle on close', async () => {
      await auditLogger.log({
        operation: 'mask',
        sessionId: 'session',
        level: 'info',
        success: true,
        details: {
          category: 'email',
          tokenCount: 1,
          categories: { email: 1 }
        }
      });

      await new Promise(resolve => setTimeout(resolve, 50));
      await auditLogger.close();

      expect((auditLogger as any).fileHandle).toBeNull();
    });

    it('should process queued entries before closing', async () => {
      await auditLogger.log({
        operation: 'mask',
        sessionId: 'session',
        level: 'info',
        success: true,
        details: {
          category: 'email',
          tokenCount: 1,
          categories: { email: 1 }
        }
      });

      await auditLogger.close();

      const logger = new AuditLogger(testLogDir, undefined, 'info');
      await logger.initialize();
      const entries = await logger.query({});
      expect(entries.length).toBe(1);
      await logger.close();
    });
  });
});
