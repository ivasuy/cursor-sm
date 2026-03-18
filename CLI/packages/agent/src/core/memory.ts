import { StoredSession, SessionMemory, ChurnHotspot } from './types.js';
import { SessionStore } from './session-store.js';

export async function getSessionMemory(
  store: SessionStore
): Promise<SessionMemory> {
  const sessions = await store.loadSessions();
  const lastSession = sessions.length > 0 ? sessions[sessions.length - 1] : null;

  return {
    lastSession,
    totalSessions: sessions.length,
    churnHotspots: detectChurnHotspots(sessions),
    recurringFriction: detectRecurringFriction(sessions),
    recentBranches: getRecentBranches(sessions),
    openTodos: getOpenTodos(sessions),
  };
}

function detectChurnHotspots(sessions: StoredSession[]): ChurnHotspot[] {
  const recent = sessions.slice(-30);
  const fileStats = new Map<
    string,
    { sessionCount: number; totalSaves: number; lastSeen: string }
  >();

  for (const session of recent) {
    for (const file of session.filesTouched) {
      const existing = fileStats.get(file) || {
        sessionCount: 0,
        totalSaves: 0,
        lastSeen: session.startTime,
      };
      existing.sessionCount += 1;
      existing.totalSaves += session.saveCounts[file] || 0;
      if (session.startTime > existing.lastSeen) {
        existing.lastSeen = session.startTime;
      }
      fileStats.set(file, existing);
    }
  }

  const hotspots: ChurnHotspot[] = [];
  for (const [file, stats] of fileStats) {
    if (stats.sessionCount >= 3) {
      hotspots.push({
        file,
        sessionCount: stats.sessionCount,
        totalSaves: stats.totalSaves,
        lastSeen: stats.lastSeen,
      });
    }
  }

  return hotspots
    .sort((a, b) => b.sessionCount - a.sessionCount)
    .slice(0, 10);
}

function detectRecurringFriction(sessions: StoredSession[]): string[] {
  const recent = sessions.slice(-20);
  const frictionCounts = new Map<string, number>();

  for (const session of recent) {
    for (const point of session.frictionPoints) {
      const normalized = normalizeFrictionPoint(point);
      frictionCounts.set(
        normalized,
        (frictionCounts.get(normalized) || 0) + 1
      );
    }
  }

  const recurring: string[] = [];
  for (const [point, count] of frictionCounts) {
    if (count >= 2) {
      recurring.push(`${point} (seen in ${count} sessions)`);
    }
  }

  return recurring.sort().slice(0, 5);
}

function normalizeFrictionPoint(point: string): string {
  const fileMatch = /`([^`]+)`/.exec(point);
  if (fileMatch) {
    return `Friction on ${fileMatch[1]}`;
  }
  if (point.includes("gap detected")) {
    return "Long pauses (debugging/thinking)";
  }
  if (point.includes("Created and deleted")) {
    return "File churn (create/delete cycles)";
  }
  if (point.includes("Rapid save burst")) {
    return "Rapid iteration bursts";
  }
  return point.slice(0, 60);
}

function getRecentBranches(sessions: StoredSession[]): string[] {
  const recent = sessions.slice(-10);
  const branches = new Set<string>();
  for (const session of recent) {
    if (session.branch) {
      branches.add(session.branch);
    }
  }
  return Array.from(branches);
}

function getOpenTodos(sessions: StoredSession[]): string[] {
  if (sessions.length === 0) return [];
  const last = sessions[sessions.length - 1];
  return last.tomorrowChecklist || [];
}
