import crypto from 'node:crypto';
import { secureZero } from '../security.js';
import type { BoundaryId, ContextSnapshot, AgentSentryConfig } from './types.js';

// Prevent unused-import error: AgentSentryConfig is part of the module's public
// surface (callers may pass config to future boundary helpers).
export type { AgentSentryConfig };

// TTL and capacity constants matching SessionManager
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_ENTRIES = 1000;

export function generateBoundaryId(): BoundaryId {
  return crypto.randomBytes(8).toString('hex') as BoundaryId;
}

interface CacheEntry {
  content: string;
  createdAt: number;
}

/**
 * Stores mediator content verbatim so counterfactual re-executions replay
 * identical content across all four regimes without external API variance.
 *
 * Security: content is never logged. Only boundaryId is safe to log.
 */
export class MediatorCache {
  private readonly entries = new Map<BoundaryId, CacheEntry>();

  set(boundaryId: BoundaryId, content: string): void {
    this.pruneOlderThan(CACHE_TTL_MS);
    if (this.entries.size >= MAX_ENTRIES) {
      // Evict oldest entry
      const oldest = [...this.entries.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt)[0];
      if (oldest) this.entries.delete(oldest[0]);
    }
    this.entries.set(boundaryId, { content, createdAt: Date.now() });
  }

  get(boundaryId: BoundaryId): string | undefined {
    const entry = this.entries.get(boundaryId);
    if (!entry) return undefined;
    if (Date.now() - entry.createdAt > CACHE_TTL_MS) {
      this.entries.delete(boundaryId);
      return undefined;
    }
    return entry.content;
  }

  evict(boundaryId: BoundaryId): void {
    this.entries.delete(boundaryId);
  }

  pruneOlderThan(ms: number): void {
    const cutoff = Date.now() - ms;
    for (const [id, entry] of this.entries) {
      if (entry.createdAt < cutoff) {
        this.entries.delete(id);
      }
    }
  }

  get size(): number {
    return this.entries.size;
  }
}

/**
 * Stores ContextSnapshots per session.
 * Bounded ring buffer per session — max windowSize*2 snapshots.
 * Sensitive string fields are NOT zeroed here because JS strings are immutable;
 * the GC will handle them. Only Buffer-backed sensitive data can be zeroed.
 */
export class ContextSnapshotStore {
  private readonly snapshots = new Map<string, ContextSnapshot[]>();
  private readonly maxPerSession: number;

  constructor(windowSize: number = 5) {
    this.maxPerSession = windowSize * 2;
  }

  save(snapshot: ContextSnapshot): void {
    const list = this.snapshots.get(snapshot.sessionId) ?? [];
    list.push(snapshot);
    if (list.length > this.maxPerSession) {
      list.splice(0, list.length - this.maxPerSession);
    }
    this.snapshots.set(snapshot.sessionId, list);
  }

  restore(boundaryId: BoundaryId): ContextSnapshot | undefined {
    for (const list of this.snapshots.values()) {
      const found = list.find(s => s.boundaryId === boundaryId);
      if (found) return found;
    }
    return undefined;
  }

  listBoundaries(sessionId: string): BoundaryId[] {
    return (this.snapshots.get(sessionId) ?? []).map(s => s.boundaryId);
  }

  clearSession(sessionId: string): void {
    this.snapshots.delete(sessionId);
  }
}

// secureZero is imported for use by callers who need to zero Buffer-backed
// sensitive data derived from boundary content. Re-export for convenience.
export { secureZero };
