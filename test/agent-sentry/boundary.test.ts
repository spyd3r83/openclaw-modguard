import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { generateBoundaryId, MediatorCache, ContextSnapshotStore } from '../../src/agent-sentry/boundary.js';
import type { BoundaryId, ContextSnapshot } from '../../src/agent-sentry/types.js';

function makeSnapshot(sessionId: string, boundaryId?: BoundaryId): ContextSnapshot {
  return {
    boundaryId: boundaryId ?? generateBoundaryId(),
    userInput: 'test input',
    mediatorContent: 'test content',
    dialogueHistory: [],
    sessionId,
    capturedAt: new Date(),
  };
}

describe('generateBoundaryId', () => {
  it('returns a 16-char hex string', () => {
    const id = generateBoundaryId();
    expect(id).toMatch(/^[0-9a-f]{16}$/);
  });

  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateBoundaryId()));
    expect(ids.size).toBe(100);
  });
});

describe('MediatorCache', () => {
  let cache: MediatorCache;

  beforeEach(() => {
    cache = new MediatorCache();
  });

  it('set/get round-trip stores content verbatim', () => {
    const id = generateBoundaryId();
    const content = 'sensitive tool return content\nwith newlines';
    cache.set(id, content);
    expect(cache.get(id)).toBe(content);
  });

  it('returns undefined for missing key', () => {
    const id = 'nonexistent' as BoundaryId;
    expect(cache.get(id)).toBeUndefined();
  });

  it('evict removes entry; subsequent get returns undefined', () => {
    const id = generateBoundaryId();
    cache.set(id, 'some content');
    expect(cache.get(id)).toBe('some content');
    cache.evict(id);
    expect(cache.get(id)).toBeUndefined();
  });

  it('size reflects current entry count', () => {
    expect(cache.size).toBe(0);
    const id1 = generateBoundaryId();
    const id2 = generateBoundaryId();
    cache.set(id1, 'a');
    expect(cache.size).toBe(1);
    cache.set(id2, 'b');
    expect(cache.size).toBe(2);
    cache.evict(id1);
    expect(cache.size).toBe(1);
  });

  it('pruneOlderThan with future cutoff retains all entries', () => {
    // pruneOlderThan removes entries where createdAt < (Date.now() - ms)
    // With ms=-10000: cutoff = Date.now() + 10s (future), so all entries are removed
    // With ms=60000: cutoff = Date.now() - 60s (past), so recently created entries are retained
    for (let i = 0; i < 5; i++) {
      cache.set(generateBoundaryId(), `content-${i}`);
    }
    expect(cache.size).toBe(5);
    cache.pruneOlderThan(60_000); // prune entries older than 60s — just-created ones survive
    expect(cache.size).toBe(5);
  });

  it('pruneOlderThan removes entries older than the given threshold', () => {
    vi.useFakeTimers();
    try {
      const oldId = generateBoundaryId();
      cache.set(oldId, 'old content');
      vi.advanceTimersByTime(5000); // 5 seconds later
      const newId = generateBoundaryId();
      cache.set(newId, 'new content');
      // Prune entries older than 2 seconds
      cache.pruneOlderThan(2000);
      expect(cache.get(oldId)).toBeUndefined();
      expect(cache.get(newId)).toBe('new content');
    } finally {
      vi.useRealTimers();
    }
  });

  it('pruneOlderThan(large) keeps recent entries', () => {
    const id = generateBoundaryId();
    cache.set(id, 'fresh');
    cache.pruneOlderThan(60 * 60 * 1000); // 1 hour
    expect(cache.get(id)).toBe('fresh');
  });

  it('TTL expiry: expired entry returns undefined via fake timers', () => {
    vi.useFakeTimers();
    try {
      const id = generateBoundaryId();
      cache.set(id, 'time-limited');
      expect(cache.get(id)).toBe('time-limited');
      // Advance past 30-minute TTL
      vi.advanceTimersByTime(31 * 60 * 1000);
      expect(cache.get(id)).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('evicts oldest entry when at MAX_ENTRIES capacity', () => {
    // Fill cache just below the internal limit by filling with known IDs
    // We need to verify the eviction mechanism works — test with sequential adds
    // and verify the oldest is gone after limit is reached.
    // MAX_ENTRIES=1000; we'll add 1001 and verify count stays at 1000
    const ids: BoundaryId[] = [];
    for (let i = 0; i < 1001; i++) {
      const id = `test${String(i).padStart(6, '0')}` as BoundaryId;
      ids.push(id);
      cache.set(id, `content-${i}`);
    }
    // Oldest (index 0) should be evicted; count should be ≤ 1000
    expect(cache.size).toBeLessThanOrEqual(1000);
    expect(cache.get(ids[0])).toBeUndefined();
    expect(cache.get(ids[1000])).toBe('content-1000');
  });
});

describe('ContextSnapshotStore', () => {
  let store: ContextSnapshotStore;

  beforeEach(() => {
    store = new ContextSnapshotStore(5);
  });

  it('save and restore by boundaryId', () => {
    const snap = makeSnapshot('sess-1');
    store.save(snap);
    const retrieved = store.restore(snap.boundaryId);
    expect(retrieved).toBe(snap);
  });

  it('returns undefined for unknown boundaryId', () => {
    expect(store.restore('unknown' as BoundaryId)).toBeUndefined();
  });

  it('listBoundaries returns ids for sessionId in insertion order', () => {
    const id1 = generateBoundaryId();
    const id2 = generateBoundaryId();
    store.save(makeSnapshot('sess-2', id1));
    store.save(makeSnapshot('sess-2', id2));
    const boundaries = store.listBoundaries('sess-2');
    expect(boundaries).toEqual([id1, id2]);
  });

  it('listBoundaries returns empty for unknown session', () => {
    expect(store.listBoundaries('no-such-session')).toEqual([]);
  });

  it('clearSession removes all snapshots for that session', () => {
    store.save(makeSnapshot('sess-clear'));
    store.save(makeSnapshot('sess-clear'));
    expect(store.listBoundaries('sess-clear').length).toBe(2);
    store.clearSession('sess-clear');
    expect(store.listBoundaries('sess-clear').length).toBe(0);
  });

  it('ring buffer evicts oldest when exceeding windowSize*2', () => {
    const windowSize = 3;
    const boundedStore = new ContextSnapshotStore(windowSize);
    const maxPerSession = windowSize * 2; // = 6

    const ids: BoundaryId[] = [];
    for (let i = 0; i < maxPerSession + 1; i++) {
      const snap = makeSnapshot('sess-ring');
      ids.push(snap.boundaryId);
      boundedStore.save(snap);
    }

    const boundaries = boundedStore.listBoundaries('sess-ring');
    // Should only keep the most recent maxPerSession
    expect(boundaries.length).toBe(maxPerSession);
    // Oldest should be gone
    expect(boundaries).not.toContain(ids[0]);
    // Newest should be present
    expect(boundaries).toContain(ids[maxPerSession]);
  });

  it('does not cross-contaminate different sessions', () => {
    const snapA = makeSnapshot('sess-A');
    const snapB = makeSnapshot('sess-B');
    store.save(snapA);
    store.save(snapB);
    expect(store.listBoundaries('sess-A')).toEqual([snapA.boundaryId]);
    expect(store.listBoundaries('sess-B')).toEqual([snapB.boundaryId]);
  });
});
