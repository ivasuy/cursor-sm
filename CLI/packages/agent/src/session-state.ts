import path from 'node:path';
import os from 'node:os';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { SessionData, FileEventType } from './core/types.js';

interface ActiveSession {
  data: SessionData;
  notes: string[];
}

const activeSessions = new Map<string, ActiveSession>();
const ACTIVE_SESSIONS_FILE = path.join(os.homedir(), '.worktrace', 'active-sessions.json');

async function persistActiveSessions(): Promise<void> {
  const entries = Array.from(activeSessions.entries()).map(([k, v]) => ({
    workspacePath: k,
    sessionId: v.data.sessionId,
    startTime: v.data.startTime,
    branch: v.data.branch,
  }));
  await mkdir(path.dirname(ACTIVE_SESSIONS_FILE), { recursive: true });
  await writeFile(ACTIVE_SESSIONS_FILE, JSON.stringify(entries, null, 2));
}

export function startSession(workspacePath: string, branch: string | null): SessionData {
  const absPath = path.resolve(workspacePath);
  if (activeSessions.has(absPath)) {
    throw new Error(`Session already active for ${absPath}`);
  }
  const session: SessionData = {
    sessionId: `wt_${Date.now().toString(36)}`,
    workspacePath: absPath,
    startTime: new Date().toISOString(),
    endTime: null,
    filesTouched: [],
    saveCounts: {},
    fileChangeEvents: [],
    gitDiff: null,
    branch,
  };
  activeSessions.set(absPath, { data: session, notes: [] });
  persistActiveSessions().catch(() => {});
  return session;
}

export function getSession(workspacePath: string): ActiveSession | undefined {
  return activeSessions.get(path.resolve(workspacePath));
}

export function addFileEvent(workspacePath: string, file: string, eventType: FileEventType): void {
  const session = activeSessions.get(path.resolve(workspacePath));
  if (!session) return;
  const relativePath = path.relative(session.data.workspacePath, file);
  session.data.fileChangeEvents.push({
    file: relativePath,
    eventType,
    timestamp: new Date().toISOString(),
  });
  if (!session.data.filesTouched.includes(relativePath)) {
    session.data.filesTouched.push(relativePath);
  }
  if (eventType === 'save') {
    session.data.saveCounts[relativePath] = (session.data.saveCounts[relativePath] || 0) + 1;
  }
}

export function addNote(workspacePath: string, note: string): string[] {
  const session = activeSessions.get(path.resolve(workspacePath));
  if (!session) throw new Error('No active session');
  session.notes.push(note);
  return session.notes;
}

export function endSession(workspacePath: string): ActiveSession {
  const absPath = path.resolve(workspacePath);
  const session = activeSessions.get(absPath);
  if (!session) throw new Error('No active session');
  session.data.endTime = new Date().toISOString();
  activeSessions.delete(absPath);
  persistActiveSessions().catch(() => {});
  return session;
}

export function getActiveSessions(): Map<string, ActiveSession> {
  return activeSessions;
}
