import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { ProviderId, QuotaBar, UsageSnapshot } from '../providers/_shared/types.js';

export interface SnapshotRow {
  snapshotId: string;
  fetchedAt: number;
  unit: string;
  used: number;
  limit?: number;
}

function pickPrimaryQuota(snapshot: UsageSnapshot): QuotaBar | null {
  return snapshot.weekly ?? snapshot.session ?? snapshot.secondary ?? null;
}

export function writeSnapshot(
  db: Database.Database,
  provider: ProviderId,
  snapshot: UsageSnapshot,
): string {
  const primary = pickPrimaryQuota(snapshot);
  if (!primary) return '';
  const snapshotId = randomUUID();
  const fetchedAt = snapshot.updatedAt.getTime();
  db.prepare(`
    INSERT INTO provider_snapshots (snapshot_id, provider, fetched_at, quota_unit, quota_used, quota_limit)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(snapshotId, provider, fetchedAt, primary.unit, primary.used, primary.cap);
  return snapshotId;
}

export function readLatestSnapshot(db: Database.Database, provider: ProviderId): SnapshotRow | null {
  const row = db.prepare(`
    SELECT snapshot_id, fetched_at, quota_unit, quota_used, quota_limit
    FROM provider_snapshots
    WHERE provider = ?
    ORDER BY fetched_at DESC
    LIMIT 1
  `).get(provider) as {
    snapshot_id: string;
    fetched_at: number;
    quota_unit: string;
    quota_used: number;
    quota_limit: number | null;
  } | undefined;
  if (!row) return null;
  return {
    snapshotId: row.snapshot_id,
    fetchedAt: row.fetched_at,
    unit: row.quota_unit,
    used: row.quota_used,
    limit: row.quota_limit ?? undefined,
  };
}
