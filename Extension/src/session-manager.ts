import { SessionData } from "./types";

export class SessionManager {
  private readonly sessions = new Map<string, SessionData>();

  ensureSession(workspaceKey: string, workspacePath: string): SessionData {
    const existing = this.sessions.get(workspaceKey);
    if (existing) {
      return existing;
    }
    const session = this.createSession(workspacePath);
    this.sessions.set(workspaceKey, session);
    return session;
  }

  getSession(workspaceKey: string): SessionData | undefined {
    return this.sessions.get(workspaceKey);
  }

  endSession(workspaceKey: string, endTime: string): SessionData | undefined {
    const session = this.sessions.get(workspaceKey);
    if (!session) {
      return undefined;
    }
    session.endTime = endTime;
    return session;
  }

  removeSession(workspaceKey: string) {
    this.sessions.delete(workspaceKey);
  }

  private createSession(workspacePath: string): SessionData {
    return {
      sessionId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      workspacePath,
      startTime: new Date().toISOString(),
      endTime: null,
      filesTouched: [],
      saveCounts: {},
      fileChangeEvents: [],
      gitDiff: null,
      branch: null,
    };
  }
}
