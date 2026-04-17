import type { Database as DB } from 'better-sqlite3';
import { ACTIVITY_WINDOW_MS } from './constants.js';

export type FileEventType = 'create' | 'modify' | 'delete';

export interface FileEventInput {
  worktreeId: number;
  branch: string;
  filePath: string;
  eventType: FileEventType;
  changedAt: number;
  provider: string | null;
}

export function recordFileEvent(db: DB, e: FileEventInput): void {
  db.prepare(`
    INSERT INTO file_changes (changed_at, worktree_id, branch, provider, event_type, file_path)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(e.changedAt, e.worktreeId, e.branch, e.provider, e.eventType, e.filePath);
}

export interface FlushOptions {
  windowMs?: number;
}

export function flushActivityWindows(db: DB, now: number, opts: FlushOptions = {}): number {
  const windowMs = opts.windowMs ?? ACTIVITY_WINDOW_MS;

  const lastRow = db.prepare(
    'SELECT COALESCE(MAX(window_end), 0) AS last_end FROM activity_windows'
  ).get() as { last_end: number };
  const cutoffStart = lastRow.last_end;
  const cutoffEnd = Math.ceil(now / windowMs) * windowMs;
  if (cutoffEnd <= cutoffStart) return 0;

  const groups = db.prepare(`
    SELECT worktree_id, branch,
           CAST(changed_at / ? AS INTEGER) * ? AS window_start,
           COUNT(*) AS cnt
    FROM file_changes
    WHERE changed_at >= ? AND changed_at < ?
    GROUP BY worktree_id, branch, window_start
  `).all(windowMs, windowMs, cutoffStart, cutoffEnd) as Array<{
    worktree_id: number; branch: string; window_start: number; cnt: number;
  }>;

  const insert = db.prepare(`
    INSERT INTO activity_windows (window_start, window_end, worktree_id, branch, file_event_count)
    VALUES (?, ?, ?, ?, ?)
  `);
  const tx = db.transaction((rows: typeof groups) => {
    for (const r of rows) insert.run(r.window_start, r.window_start + windowMs, r.worktree_id, r.branch, r.cnt);
  });
  tx(groups);
  return groups.length;
}
