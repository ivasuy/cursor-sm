import type Database from 'better-sqlite3';
import type { ProviderId } from '../providers/_shared/types.js';

export interface WindowRow {
  id: number;
  worktreeId: number;
  fileEventCount: number;
}

export interface DistributeInput {
  delta: number;
  windows: WindowRow[];
}

export interface WindowShare {
  windowId: number;
  worktreeId: number;
  amount: number;
}

export function distributeDelta(input: DistributeInput): WindowShare[] {
  if (input.delta === 0 || input.windows.length === 0) return [];
  const totalWeight = input.windows.reduce((acc, window) => acc + Math.max(window.fileEventCount, 1), 0);
  if (totalWeight === 0) return [];

  return input.windows.map((window) => ({
    windowId: window.id,
    worktreeId: window.worktreeId,
    amount: input.delta * (Math.max(window.fileEventCount, 1) / totalWeight),
  }));
}

export interface WriteAttributionsInput {
  provider: ProviderId;
  unit: string;
  delta: number;
  snapshotId: string;
  since: number;
  until: number;
}

export function writeAttributions(db: Database.Database, input: WriteAttributionsInput): void {
  const rawWindows = db.prepare(`
    SELECT id, worktree_id, file_event_count
    FROM activity_windows
    WHERE window_start >= ? AND window_end <= ?
  `).all(input.since, input.until) as Array<{ id: number; worktree_id: number; file_event_count: number }>;

  const windows: WindowRow[] = rawWindows.map((row) => ({
    id: row.id,
    worktreeId: row.worktree_id,
    fileEventCount: row.file_event_count,
  }));

  const shares = distributeDelta({ delta: input.delta, windows });
  if (shares.length === 0) return;

  const insert = db.prepare(`
    INSERT INTO attributions (attributed_at, provider, worktree_id, window_id, amount, unit, snapshot_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const now = Date.now();
  const tx = db.transaction((rows: WindowShare[]) => {
    for (const share of rows) {
      insert.run(now, input.provider, share.worktreeId, share.windowId, share.amount, input.unit, input.snapshotId);
    }
  });
  tx(shares);
}
