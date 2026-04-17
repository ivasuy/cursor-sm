import { Router } from 'express';
import { getRepoById, removeRepo } from '../report/repo-registry.js';
import { summarizeByRepo, summarizeByWorktree } from '../report/report-service.js';
import { getAppContext } from '../report/app-context.js';

const router = Router();

router.get('/', (req, res) => {
  const { db } = getAppContext();
  const since = Number(req.query.since ?? 0);
  const until = Number(req.query.until ?? Date.now());
  res.json({ repos: summarizeByRepo(db, { since, until }) });
});

router.get('/:id', (req, res) => {
  const { db } = getAppContext();
  const since = Number(req.query.since ?? 0);
  const until = Number(req.query.until ?? Date.now());
  const id = Number(req.params.id);
  const repo = getRepoById(db, id);
  if (!repo) { res.status(404).json({ error: 'repo not found' }); return; }
  const summary = summarizeByRepo(db, { since, until }).find((row) => row.repoId === id) ?? null;
  const worktrees = summarizeByWorktree(db, { since, until }).filter((row) => row.repoId === id);
  res.json({ repo, summary, worktrees });
});

router.get('/:id/worktrees', (req, res) => {
  const { db } = getAppContext();
  const since = Number(req.query.since ?? 0);
  const until = Number(req.query.until ?? Date.now());
  const id = Number(req.params.id);
  if (!getRepoById(db, id)) { res.status(404).json({ error: 'repo not found' }); return; }
  const worktrees = summarizeByWorktree(db, { since, until }).filter((row) => row.repoId === id);
  res.json({ worktrees });
});

router.delete('/:id', (req, res) => {
  const { db } = getAppContext();
  const ok = removeRepo(db, Number(req.params.id));
  res.status(ok ? 200 : 404).json({ removed: ok });
});

export default router;
