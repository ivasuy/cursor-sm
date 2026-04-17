import { Router } from 'express';
import { getWorktreeById, getWorktreeByPath } from '../report/worktree-scanner.js';
import { getAppContext } from '../report/app-context.js';
import { summarizeByWorktree } from '../report/report-service.js';

const router = Router();

router.get('/', (req, res) => {
  const { db } = getAppContext();
  const since = Number(req.query.since ?? 0);
  const until = Number(req.query.until ?? Date.now());
  const path = typeof req.query.path === 'string' ? req.query.path : undefined;
  if (path) {
    const wt = getWorktreeByPath(db, path);
    if (!wt) { res.status(404).json({ error: 'worktree not found' }); return; }
    const summary = summarizeByWorktree(db, { since, until }).find((row) => row.worktreeId === wt.id) ?? null;
    res.json({ worktree: wt, summary });
    return;
  }
  res.json({ worktrees: summarizeByWorktree(db, { since, until }) });
});

router.get('/:id', (req, res) => {
  const { db } = getAppContext();
  const since = Number(req.query.since ?? 0);
  const until = Number(req.query.until ?? Date.now());
  const wt = getWorktreeById(db, Number(req.params.id));
  if (!wt) { res.status(404).json({ error: 'worktree not found' }); return; }
  const summary = summarizeByWorktree(db, { since, until }).find((row) => row.worktreeId === wt.id) ?? null;
  res.json({ worktree: wt, summary });
});

export default router;
