import type { ProviderId, UsageSnapshot } from './types.js';

interface CacheEntry {
  snapshot: UsageSnapshot;
  fetchedAtMs: number;
}

export interface SnapshotCache {
  get(id: ProviderId, ttlMs: number): UsageSnapshot | undefined;
  set(id: ProviderId, snap: UsageSnapshot): void;
  invalidate(id: ProviderId): void;
  clear(): void;
}

export function createSnapshotCache(): SnapshotCache {
  const store = new Map<ProviderId, CacheEntry>();

  return {
    get(id, ttlMs) {
      const entry = store.get(id);
      if (!entry) return undefined;
      if (Date.now() - entry.fetchedAtMs > ttlMs) return undefined;
      return entry.snapshot;
    },
    set(id, snap) {
      store.set(id, { snapshot: snap, fetchedAtMs: Date.now() });
    },
    invalidate(id) {
      store.delete(id);
    },
    clear() {
      store.clear();
    },
  };
}
