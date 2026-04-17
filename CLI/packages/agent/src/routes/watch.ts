import { Router } from 'express';
import { basename, resolve } from 'node:path';
import { addRepo, getRepoByPath, removeRepo } from '../report/repo-registry.js';
import { syncWorktrees } from '../report/worktree-scanner.js';
import { getAppContext } from '../report/app-context.js';
import { startWatcher, stopWatcher } from '../watcher.js';

const router = Router();

router.post('/', async (req, res) => {
  const { db } = getAppContext();
  const raw = typeof req.body?.path === 'string' ? req.body.path : undefined;
  if (!raw) { res.status(400).json({ error: 'path required' }); return; }
  const path = resolve(raw);
  const repo = addRepo(db, { path, name: basename(path), addedAt: Date.now() });
  await syncWorktrees(db, repo, Date.now());
  startWatcher(path);
  res.json({ repo });
});

router.delete('/', async (req, res) => {
  const { db } = getAppContext();
  const raw = typeof req.body?.path === 'string' ? req.body.path
    : (typeof req.query.path === 'string' ? req.query.path : undefined);
  if (!raw) { res.status(400).json({ error: 'path required' }); return; }
  const path = resolve(raw);
  await stopWatcher(path);
  const repo = getRepoByPath(db, path);
  if (!repo) { res.json({ removed: false }); return; }
  res.json({ removed: removeRepo(db, repo.id) });
});

export default router;
