import { Router } from 'express';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const router = Router();

router.get('/', async (req, res) => {
  const workspace = req.query.workspace as string;
  if (!workspace) return res.status(400).json({ error: 'workspace required' });
  const contextPath = path.join(path.resolve(workspace), 'sessions', 'context.md');
  try {
    const content = await readFile(contextPath, 'utf-8');
    res.json({ context: content });
  } catch {
    res.json({ context: null });
  }
});

export default router;
