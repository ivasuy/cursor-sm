import type Database from 'better-sqlite3';

export interface TimeRange {
  since: number;
  until: number;
}

export interface ProviderAmount {
  provider: string;
  amount: number;
  unit: string;
}

export interface RepoSummary {
  repoId: number;
  name: string;
  path: string;
  perProvider: ProviderAmount[];
}

export interface WorktreeSummary {
  worktreeId: number;
  repoId: number;
  path: string;
  isPrimary: boolean;
  branch: string | null;
  perProvider: ProviderAmount[];
}

export interface FileSummary {
  path: string;
  worktreeId: number;
  branch: string;
  eventCount: number;
}

export function summarizeByRepo(db: Database.Database, range: TimeRange): RepoSummary[] {
  const repos = db.prepare(
    'SELECT id, name, path FROM repos ORDER BY name ASC'
  ).all() as Array<{ id: number; name: string; path: string }>;

  return repos.map((repo) => {
    const perProvider = db.prepare(`
      SELECT a.provider AS provider, SUM(a.amount) AS amount, a.unit AS unit
      FROM attributions a
      JOIN worktrees w ON w.id = a.worktree_id
      WHERE w.repo_id = ? AND a.attributed_at BETWEEN ? AND ?
      GROUP BY a.provider, a.unit
      ORDER BY amount DESC
    `).all(repo.id, range.since, range.until) as ProviderAmount[];
    return {
      repoId: repo.id,
      name: repo.name,
      path: repo.path,
      perProvider,
    };
  });
}

export function summarizeByWorktree(db: Database.Database, range: TimeRange): WorktreeSummary[] {
  const worktrees = db.prepare(
    'SELECT id, repo_id, path, is_primary FROM worktrees ORDER BY path ASC'
  ).all() as Array<{ id: number; repo_id: number; path: string; is_primary: 0 | 1 }>;

  return worktrees.map((worktree) => {
    const perProvider = db.prepare(`
      SELECT provider, SUM(amount) AS amount, unit
      FROM attributions
      WHERE worktree_id = ? AND attributed_at BETWEEN ? AND ?
      GROUP BY provider, unit
      ORDER BY amount DESC
    `).all(worktree.id, range.since, range.until) as ProviderAmount[];

    const latestBranch = db.prepare(
      'SELECT branch FROM file_changes WHERE worktree_id = ? ORDER BY changed_at DESC LIMIT 1'
    ).get(worktree.id) as { branch: string } | undefined;

    return {
      worktreeId: worktree.id,
      repoId: worktree.repo_id,
      path: worktree.path,
      isPrimary: worktree.is_primary === 1,
      branch: latestBranch?.branch ?? null,
      perProvider,
    };
  });
}

export function summarizeByFile(
  db: Database.Database,
  range: TimeRange & { limit?: number },
): FileSummary[] {
  const limit = range.limit ?? 50;
  const rows = db.prepare(`
    SELECT file_path, worktree_id, branch, COUNT(*) AS event_count
    FROM file_changes
    WHERE changed_at BETWEEN ? AND ?
    GROUP BY file_path, worktree_id, branch
    ORDER BY event_count DESC, file_path ASC
    LIMIT ?
  `).all(range.since, range.until, limit) as Array<{
    file_path: string;
    worktree_id: number;
    branch: string;
    event_count: number;
  }>;

  return rows.map((row) => ({
    path: row.file_path,
    worktreeId: row.worktree_id,
    branch: row.branch,
    eventCount: row.event_count,
  }));
}
