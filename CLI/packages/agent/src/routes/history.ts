import { Router } from 'express';
import path from 'node:path';
import { SessionStore } from '../core/session-store.js';

const router = Router();

router.get('/', async (req, res) => {
  const workspace = req.query.workspace as string;
  const query = req.query.query as string | undefined;
  const limit = parseInt(req.query.limit as string || '10', 10);
  if (!workspace) return res.status(400).json({ error: 'workspace required' });

  const store = new SessionStore(path.resolve(workspace));
  const allSessions = await store.loadSessions();

  let results = allSessions;
  if (query) {
    const q = query.toLowerCase();
    results = allSessions.filter(s =>
      s.filesTouched.some(f => f.toLowerCase().includes(q)) ||
      s.branch?.toLowerCase().includes(q) ||
      s.sessionMode?.toLowerCase().includes(q) ||
      s.intentDescription?.toLowerCase().includes(q)
    );
  }

  res.json({ sessions: results.slice(-limit).reverse() });
});

export default router;
