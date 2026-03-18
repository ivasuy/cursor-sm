import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { StoredSession } from './types.js';

const WORKTRACE_DIR = ".worktrace";
const SESSIONS_FILE = "sessions.json";
const MAX_STORED_SESSIONS = 200;

export class SessionStore {
  private workspacePath: string;

  constructor(workspacePath: string) {
    this.workspacePath = workspacePath;
  }

  private get dirPath(): string {
    return path.join(this.workspacePath, WORKTRACE_DIR);
  }

  private get filePath(): string {
    return path.join(this.dirPath, SESSIONS_FILE);
  }

  async ensureDirectory(): Promise<void> {
    try {
      await mkdir(this.dirPath, { recursive: true });
    } catch {
      // Directory may already exist
    }
  }

  async loadSessions(): Promise<StoredSession[]> {
    try {
      const data = await readFile(this.filePath, 'utf-8');
      return JSON.parse(data);
    } catch {
      return [];
    }
  }

  async saveSession(stored: StoredSession): Promise<void> {
    await this.ensureDirectory();

    const sessions = await this.loadSessions();

    sessions.push(stored);

    // Keep only the most recent sessions
    const trimmed = sessions.slice(-MAX_STORED_SESSIONS);

    await writeFile(this.filePath, JSON.stringify(trimmed, null, 2));
  }

  async getLastSession(): Promise<StoredSession | null> {
    const sessions = await this.loadSessions();
    return sessions.length > 0 ? sessions[sessions.length - 1] : null;
  }

  async searchByFile(filename: string): Promise<StoredSession[]> {
    const sessions = await this.loadSessions();
    const lower = filename.toLowerCase();
    return sessions.filter((s) =>
      s.filesTouched.some((f) => f.toLowerCase().includes(lower))
    );
  }

  async searchByBranch(branch: string): Promise<StoredSession[]> {
    const sessions = await this.loadSessions();
    const lower = branch.toLowerCase();
    return sessions.filter(
      (s) => s.branch && s.branch.toLowerCase().includes(lower)
    );
  }

  async searchByDateRange(
    from: string,
    to: string
  ): Promise<StoredSession[]> {
    const sessions = await this.loadSessions();
    const fromTime = Date.parse(from);
    const toTime = Date.parse(to);
    return sessions.filter((s) => {
      const t = Date.parse(s.startTime);
      return t >= fromTime && t <= toTime;
    });
  }
}
