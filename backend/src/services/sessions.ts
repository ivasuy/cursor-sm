import { getFirestore } from "firebase-admin/firestore";
import { SessionPayload } from "./vertex";

interface SessionRecord {
  sessionId: string;
  date: string;
  branch: string | null;
  linesAdded: number;
  linesRemoved: number;
  filesTouched: number;
  frictionPoints: string[];
  stuckPoints: string[];
  personalInsights: string[];
  readinessScore: number | null;
  createdAt: string;
}

function parseStuckPoints(markdown: string): string[] {
  const match = markdown.match(
    /## Where I Got Stuck.*?\n([\s\S]*?)(?=\n## |$)/
  );
  if (!match) return [];
  return match[1]
    .split("\n")
    .filter((l) => l.startsWith("- "))
    .map((l) => l.replace(/^- /, "").trim())
    .filter(Boolean)
    .slice(0, 10);
}

function parseReadinessScore(markdown: string): number | null {
  const match = markdown.match(
    /### Readiness Score.*?\n.*?(\d{1,3})/s
  );
  if (!match) return null;
  const score = parseInt(match[1], 10);
  return score >= 0 && score <= 100 ? score : null;
}

function parsePersonalInsights(markdown: string): string[] {
  const insights: string[] = [];

  const intentMatch = markdown.match(
    /## What I Was Trying To Do\n([\s\S]*?)(?=\n## |$)/
  );
  if (intentMatch) {
    const text = intentMatch[1].trim();
    if (text) insights.push(text.slice(0, 500));
  }

  const shareableMatch = markdown.match(
    /## One-Line Shareable Update\n([\s\S]*?)(?=\n## |$)/
  );
  if (shareableMatch) {
    const text = shareableMatch[1].trim();
    if (text) insights.push(text.slice(0, 300));
  }

  return insights;
}

export async function saveSessionSummary(
  uid: string,
  payload: SessionPayload,
  markdown: string | null
): Promise<void> {
  const db = getFirestore();

  const totalAdded = payload.analysis.delta.updated.reduce(
    (s, f) => s + f.added,
    0
  );
  const totalRemoved = payload.analysis.delta.updated.reduce(
    (s, f) => s + f.removed,
    0
  );

  const now = new Date();
  const dateStr = now.toISOString().split("T")[0];

  const record: SessionRecord = {
    sessionId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    date: dateStr,
    branch: payload.session.branch,
    linesAdded: totalAdded,
    linesRemoved: totalRemoved,
    filesTouched: payload.session.filesTouched.length,
    frictionPoints: payload.analysis.frictionPoints.slice(0, 10),
    stuckPoints: markdown ? parseStuckPoints(markdown) : [],
    personalInsights: markdown ? parsePersonalInsights(markdown) : [],
    readinessScore: markdown ? parseReadinessScore(markdown) : null,
    createdAt: now.toISOString(),
  };

  await db
    .collection(`users/${uid}/sessions`)
    .doc(record.sessionId)
    .set(record);
}

export async function getSessionsForDate(
  uid: string,
  date: string
): Promise<SessionRecord[]> {
  const db = getFirestore();
  const snap = await db
    .collection(`users/${uid}/sessions`)
    .where("date", "==", date)
    .get();

  return snap.docs.map((d) => d.data() as SessionRecord);
}

export async function getUserStreak(uid: string): Promise<number> {
  const db = getFirestore();
  const snap = await db
    .collection(`users/${uid}/sessions`)
    .orderBy("date", "desc")
    .limit(365)
    .get();

  if (snap.empty) return 0;

  const uniqueDates = [
    ...new Set(snap.docs.map((d) => d.data().date as string)),
  ].sort((a, b) => (a > b ? -1 : 1));

  let streak = 1;
  for (let i = 1; i < uniqueDates.length; i++) {
    const prev = new Date(uniqueDates[i - 1] + "T00:00:00Z");
    const curr = new Date(uniqueDates[i] + "T00:00:00Z");
    const diffDays =
      (prev.getTime() - curr.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays === 1) {
      streak++;
    } else {
      break;
    }
  }

  return streak;
}
