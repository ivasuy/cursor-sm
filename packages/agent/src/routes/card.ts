import { Router } from 'express';
import path from 'node:path';
import { writeFile, mkdir } from 'node:fs/promises';
import { callBackendBuffer, isAuthenticated } from '../auth.js';
import { SessionStore } from '../core/session-store.js';

const router = Router();

router.post('/', async (req, res) => {
  const { workspacePath, date } = req.body;
  if (!workspacePath) return res.status(400).json({ error: 'workspacePath required' });
  if (!(await isAuthenticated())) return res.status(401).json({ error: 'Not authenticated' });

  const absPath = path.resolve(workspacePath);
  const cardDate = date || new Date().toISOString().split('T')[0];

  // Get session stats from local store
  const store = new SessionStore(absPath);
  const sessions = await store.loadSessions();
  const todaySessions = sessions.filter(s =>
    s.startTime.startsWith(cardDate)
  );

  let linesAdded = 0, linesRemoved = 0, filesChanged = 0;
  let branch: string | null = null;
  for (const s of todaySessions) {
    linesAdded += s.linesAdded || 0;
    linesRemoved += s.linesRemoved || 0;
    filesChanged += s.filesTouched.length;
    branch = branch || s.branch;
  }

  const png = await callBackendBuffer('POST', '/api/card/generate', {
    date: cardDate,
    branch,
    linesAdded,
    linesRemoved,
    filesChanged,
  });

  const sessionsDir = path.join(absPath, 'sessions');
  await mkdir(sessionsDir, { recursive: true });
  const cardPath = path.join(sessionsDir, `${cardDate}_card.png`);
  await writeFile(cardPath, png);
  res.json({ cardPath });
});

export default router;
