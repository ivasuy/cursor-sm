import * as vscode from "vscode";
import * as path from "path";
import {
  SessionData,
  SessionAnalysis,
  StoredSession,
  SafetyWarning,
} from "./types";

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
      await vscode.workspace.fs.createDirectory(vscode.Uri.file(this.dirPath));
    } catch {
      // Directory may already exist
    }
  }

  async loadSessions(): Promise<StoredSession[]> {
    try {
      const bytes = await vscode.workspace.fs.readFile(
        vscode.Uri.file(this.filePath)
      );
      const data = JSON.parse(Buffer.from(bytes).toString("utf8"));
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  async saveSession(
    session: SessionData,
    analysis: SessionAnalysis,
    safetyWarnings: SafetyWarning[]
  ): Promise<void> {
    await this.ensureDirectory();

    const sessions = await this.loadSessions();

    const stored: StoredSession = {
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
    };

    sessions.push(stored);

    // Keep only the most recent sessions
    const trimmed = sessions.slice(-MAX_STORED_SESSIONS);

    await vscode.workspace.fs.writeFile(
      vscode.Uri.file(this.filePath),
      Buffer.from(JSON.stringify(trimmed, null, 2), "utf8")
    );
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
