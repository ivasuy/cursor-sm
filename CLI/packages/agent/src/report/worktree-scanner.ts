import type { Database as DB } from 'better-sqlite3';
import { listWorktrees as gitListWorktrees } from './git.js';
import type { Repo } from './repo-registry.js';

export interface Worktree {
  id: number;
  repoId: number;
  path: string;
  isPrimary: 0 | 1;
  detectedAt: number;
}

export async function syncWorktrees(db: DB, repo: Repo, now: number): Promise<Worktree[]> {
  const found = await gitListWorktrees(repo.path);
  const upsert = db.prepare(`
    INSERT INTO worktrees (repo_id, path, is_primary, detected_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(path) DO UPDATE SET is_primary = excluded.is_primary
  `);
  const tx = db.transaction((items: Array<{ path: string; isPrimary: 0 | 1 }>) => {
    for (const w of items) upsert.run(repo.id, w.path, w.isPrimary, now);
  });
  tx(found.map((w) => ({ path: w.path, isPrimary: (w.path === repo.path ? 1 : 0) as 0 | 1 })));
  return listWorktreesForRepo(db, repo.id);
}

export function listWorktreesForRepo(db: DB, repoId: number): Worktree[] {
  const rows = db.prepare(
    'SELECT id, repo_id, path, is_primary, detected_at FROM worktrees WHERE repo_id = ? ORDER BY is_primary DESC, path ASC'
  ).all(repoId) as Array<{
    id: number; repo_id: number; path: string; is_primary: 0 | 1; detected_at: number;
  }>;
  return rows.map((r) => ({
    id: r.id, repoId: r.repo_id, path: r.path, isPrimary: r.is_primary, detectedAt: r.detected_at,
  }));
}

export function getWorktreeById(db: DB, id: number): Worktree | null {
  const row = db.prepare(
    'SELECT id, repo_id, path, is_primary, detected_at FROM worktrees WHERE id = ?'
  ).get(id) as {
    id: number; repo_id: number; path: string; is_primary: 0 | 1; detected_at: number;
  } | undefined;
  return row ? { id: row.id, repoId: row.repo_id, path: row.path, isPrimary: row.is_primary, detectedAt: row.detected_at } : null;
}

export function getWorktreeByPath(db: DB, path: string): Worktree | null {
  const row = db.prepare(
    'SELECT id, repo_id, path, is_primary, detected_at FROM worktrees WHERE path = ?'
  ).get(path) as {
    id: number; repo_id: number; path: string; is_primary: 0 | 1; detected_at: number;
  } | undefined;
  return row ? { id: row.id, repoId: row.repo_id, path: row.path, isPrimary: row.is_primary, detectedAt: row.detected_at } : null;
}
