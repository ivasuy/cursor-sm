import type { Database as DB } from 'better-sqlite3';

export interface Repo {
  id: number;
  path: string;
  name: string;
  addedAt: number;
}

export interface AddRepoInput {
  path: string;
  name: string;
  addedAt: number;
}

export function addRepo(db: DB, input: AddRepoInput): Repo {
  const existing = getRepoByPath(db, input.path);
  if (existing) {
    db.prepare('UPDATE repos SET name = ? WHERE id = ?').run(input.name, existing.id);
    return { ...existing, name: input.name };
  }
  const info = db.prepare(
    'INSERT INTO repos (path, name, added_at) VALUES (?, ?, ?)',
  ).run(input.path, input.name, input.addedAt);
  return {
    id: Number(info.lastInsertRowid),
    path: input.path,
    name: input.name,
    addedAt: input.addedAt,
  };
}

export function getRepoById(db: DB, id: number): Repo | null {
  const row = db.prepare('SELECT id, path, name, added_at FROM repos WHERE id = ?')
    .get(id) as { id: number; path: string; name: string; added_at: number } | undefined;
  return row ? { id: row.id, path: row.path, name: row.name, addedAt: row.added_at } : null;
}

export function getRepoByPath(db: DB, path: string): Repo | null {
  const row = db.prepare('SELECT id, path, name, added_at FROM repos WHERE path = ?')
    .get(path) as { id: number; path: string; name: string; added_at: number } | undefined;
  return row ? { id: row.id, path: row.path, name: row.name, addedAt: row.added_at } : null;
}

export function listRepos(db: DB): Repo[] {
  return (db.prepare('SELECT id, path, name, added_at FROM repos ORDER BY added_at DESC').all() as Array<{
    id: number; path: string; name: string; added_at: number;
  }>).map((r) => ({ id: r.id, path: r.path, name: r.name, addedAt: r.added_at }));
}

export function removeRepo(db: DB, id: number): boolean {
  const exists = db.prepare('SELECT id FROM repos WHERE id = ?').get(id) as { id: number } | undefined;
  if (!exists) return false;

  const tx = db.transaction((repoId: number) => {
    const worktreeRows = db.prepare('SELECT id FROM worktrees WHERE repo_id = ?').all(repoId) as Array<{ id: number }>;
    const deleteFileChanges = db.prepare('DELETE FROM file_changes WHERE worktree_id = ?');
    const deleteActivityWindows = db.prepare('DELETE FROM activity_windows WHERE worktree_id = ?');
    const deleteAttributions = db.prepare('DELETE FROM attributions WHERE worktree_id = ?');

    for (const w of worktreeRows) {
      deleteFileChanges.run(w.id);
      deleteActivityWindows.run(w.id);
      deleteAttributions.run(w.id);
    }

    db.prepare('DELETE FROM worktrees WHERE repo_id = ?').run(repoId);
    db.prepare('DELETE FROM repos WHERE id = ?').run(repoId);
  });

  tx(id);
  return true;
}
