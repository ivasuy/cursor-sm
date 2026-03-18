import { Router } from 'express';
import path from 'node:path';
import { getGitDiff, parseGitDiffByFile } from '../core/git.js';
import { runSafetyCheck } from '../core/safety-monitor.js';

const router = Router();

router.post('/', async (req, res) => {
  const { workspacePath } = req.body;
  if (!workspacePath) return res.status(400).json({ error: 'workspacePath required' });

  const absPath = path.resolve(workspacePath);
  const gitDiff = await getGitDiff(absPath);
  const diffFiles = parseGitDiffByFile(gitDiff || '');
  const warnings = runSafetyCheck(diffFiles);
  res.json({ warnings });
});

export default router;
