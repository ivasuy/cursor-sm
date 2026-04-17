import { Router } from 'express';
import { getAppContext } from '../report/app-context.js';
import { summarizeByFile } from '../report/report-service.js';

const router = Router();

router.get('/', (req, res) => {
  const { db } = getAppContext();
  const since = Number(req.query.since ?? 0);
  const until = Number(req.query.until ?? Date.now());
  const limitRaw = Number(req.query.limit ?? 50);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 50;
  res.json({ files: summarizeByFile(db, { since, until, limit }) });
});

router.get('/detail', (req, res) => {
  const { db } = getAppContext();
  const filePath = typeof req.query.path === 'string' ? req.query.path : '';
  const since = Number(req.query.since ?? 0);
  const until = Number(req.query.until ?? Date.now());
  if (!filePath) { res.status(400).json({ error: 'path required' }); return; }
  const rows = db.prepare(`
    SELECT changed_at, event_type, provider, branch, worktree_id
    FROM file_changes
    WHERE file_path = ? AND changed_at BETWEEN ? AND ?
    ORDER BY changed_at DESC
  `).all(filePath, since, until);
  res.json({ path: filePath, history: rows });
});

export default router;
