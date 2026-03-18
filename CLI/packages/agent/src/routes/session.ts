import { Router } from 'express';
import path from 'node:path';
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { startSession, endSession, getSession, addNote, getActiveSessions } from '../session-state.js';
import { startWatcher, stopWatcher } from '../watcher.js';
import { getGitDiff, getCurrentBranch, parseGitDiffByFile } from '../core/git.js';
import { analyzeSession } from '../core/analysis.js';
import { runSafetyCheck } from '../core/safety-monitor.js';
import { SessionStore } from '../core/session-store.js';
import { renderSessionMemory } from '../core/renderer.js';
import { generateProjectContext } from '../core/continuity.js';
import { getSessionMemory } from '../core/memory.js';
import { isAuthenticated, callBackend, callBackendBuffer } from '../auth.js';
import { SUMMARY_FOLDER } from '../core/constants.js';

const router = Router();

// POST /session/start
router.post('/start', async (req, res) => {
  const { workspacePath } = req.body;
  if (!workspacePath) return res.status(400).json({ error: 'workspacePath required' });
  const absPath = path.resolve(workspacePath);
  try {
    const branch = await getCurrentBranch(absPath);
    const session = startSession(absPath, branch);
    startWatcher(absPath);
    res.json({ sessionId: session.sessionId, startTime: session.startTime, branch });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

// POST /session/end
router.post('/end', async (req, res) => {
  const { workspacePath, userNote } = req.body;
  if (!workspacePath) return res.status(400).json({ error: 'workspacePath required' });
  const absPath = path.resolve(workspacePath);

  try {
    // 1. Stop watcher, collect session data
    await stopWatcher(absPath);
    const { data: session, notes } = endSession(absPath);

    // 2. Git diff + branch
    const gitDiff = await getGitDiff(absPath);
    session.gitDiff = gitDiff;
    const branch = await getCurrentBranch(absPath);
    session.branch = branch;
    const diffFiles = parseGitDiffByFile(gitDiff || '');

    // 3. Merge notes: CLI end note + mid-session notes
    const allNotes = [...notes];
    if (userNote) allNotes.push(userNote);
    const mergedNote = allNotes.length > 0 ? allNotes.join('\n\n') : null;

    // 4. Run analysis
    const analysis = await analyzeSession(session, mergedNote);

    // 5. Safety check
    const safetyWarnings = runSafetyCheck(diffFiles);

    // 6. Persist to .worktrace/sessions.json
    const store = new SessionStore(absPath);
    await store.saveSession({
      id: session.sessionId,
      startTime: session.startTime,
      endTime: session.endTime || new Date().toISOString(),
      branch: session.branch,
      filesTouched: session.filesTouched,
      saveCounts: session.saveCounts,
      sessionMode: analysis.sessionMode,
      confidence: analysis.confidence.level,
      frictionPoints: analysis.frictionPoints,
      tomorrowChecklist: analysis.tomorrowChecklist,
      intentDescription: analysis.intentDescription,
      safetyWarningCount: safetyWarnings.length,
      linesAdded: diffFiles.reduce((sum, f) => sum + f.added, 0),
      linesRemoved: diffFiles.reduce((sum, f) => sum + f.removed, 0),
    });

    // 7. Load cross-session memory
    const memory = await getSessionMemory(store);
    const projectName = path.basename(absPath);

    // 8. Render local summary
    const sessionsDir = path.join(absPath, SUMMARY_FOLDER);
    await mkdir(sessionsDir, { recursive: true });

    let summaryMarkdown = renderSessionMemory({
      session, analysis, safetyWarnings, memory,
    });
    const now = new Date();
    const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`;
    const summaryFileName = `session-${timestamp}.md`;
    const summaryPath = path.join(sessionsDir, summaryFileName);

    // 9. Generate local project context
    let previousContext: string | null = null;
    const contextPath = path.join(sessionsDir, 'context.md');
    try { previousContext = await readFile(contextPath, 'utf-8'); } catch { /* first time */ }
    let contextMarkdown = generateProjectContext(memory, session, analysis, projectName, previousContext);

    // 10. Optional AI enhancement (if authenticated)
    let aiSummary = false;
    if (await isAuthenticated()) {
      const payload = { session, analysis };
      try {
        const [summaryRes, contextRes] = await Promise.allSettled([
          callBackend('POST', '/api/session/summarize', payload),
          callBackend('POST', '/api/session/context', { ...payload, previousContext }),
        ]);

        if (summaryRes.status === 'fulfilled' && summaryRes.value.ok) {
          const data = await summaryRes.value.json() as { markdown: string };
          if (data.markdown) { summaryMarkdown = data.markdown; aiSummary = true; }
        }
        if (contextRes.status === 'fulfilled' && contextRes.value.ok) {
          const data = await contextRes.value.json() as { context: string };
          if (data.context) { contextMarkdown = data.context; }
        }

        // 11. Generate card if AI summary succeeded
        if (aiSummary) {
          try {
            const linesAdded = diffFiles.reduce((s, f) => s + f.added, 0);
            const linesRemoved = diffFiles.reduce((s, f) => s + f.removed, 0);
            const png = await callBackendBuffer('POST', '/api/card/generate', {
              date: now.toISOString().split('T')[0],
              branch,
              linesAdded,
              linesRemoved,
              filesChanged: session.filesTouched.length,
            });
            const cardPath = path.join(sessionsDir, `${now.toISOString().split('T')[0]}_card.png`);
            await writeFile(cardPath, png);
          } catch { /* card generation is non-critical */ }
        }
      } catch { /* backend calls are non-critical */ }
    }

    // 12. Write files
    await writeFile(summaryPath, summaryMarkdown);
    await writeFile(contextPath, contextMarkdown);

    res.json({
      summaryPath: path.relative(absPath, summaryPath),
      contextPath: path.relative(absPath, contextPath),
      safetyWarnings,
      aiSummary,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /session/note
router.post('/note', (req, res) => {
  const { workspacePath, note } = req.body;
  if (!workspacePath || !note) return res.status(400).json({ error: 'workspacePath and note required' });
  try {
    const notes = addNote(path.resolve(workspacePath), note);
    res.json({ notes });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

// GET /session/status
router.get('/status', (req, res) => {
  const workspace = req.query.workspace as string;
  if (!workspace) return res.status(400).json({ error: 'workspace required' });
  const session = getSession(path.resolve(workspace));
  if (!session) return res.json({ active: false });
  const data = session.data;
  const durationMs = Date.now() - new Date(data.startTime).getTime();
  res.json({
    active: true,
    sessionId: data.sessionId,
    duration: durationMs,
    filesTouched: data.filesTouched.length,
    totalSaves: Object.values(data.saveCounts).reduce((a, b) => a + b, 0),
    branch: data.branch,
    events: data.fileChangeEvents.length,
    notes: session.notes.length,
  });
});

export default router;
