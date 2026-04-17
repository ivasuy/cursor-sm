import { Router } from 'express';
import { getAppContext } from '../report/app-context.js';
import { summarizeByWorktree } from '../report/report-service.js';

const router = Router();

router.get('/', (req, res) => {
  const { db } = getAppContext();
  const since = Number(req.query.since ?? 0);
  const until = Number(req.query.until ?? Date.now());
  const branchFilter = typeof req.query.branch === 'string' ? req.query.branch : undefined;

  const features = summarizeByWorktree(db, { since, until })
    .filter((row) => {
      if (!row.branch) return false;
      if (branchFilter) return row.branch === branchFilter;
      const lower = row.branch.toLowerCase();
      return lower !== 'main' && lower !== 'master' && lower !== 'head';
    })
    .map((row) => ({
      branch: row.branch,
      worktreeId: row.worktreeId,
      repoId: row.repoId,
      path: row.path,
      perProvider: row.perProvider,
    }));

  res.json({ features });
});

router.get('/:branch', (req, res) => {
  const { db } = getAppContext();
  const since = Number(req.query.since ?? 0);
  const files = db.prepare(`
    SELECT file_path, event_type, changed_at, provider, worktree_id
    FROM file_changes
    WHERE branch = ? AND changed_at >= ?
    ORDER BY changed_at DESC
    LIMIT 500
  `).all(req.params.branch, since);
  res.json({ branch: req.params.branch, files });
});

export default router;
