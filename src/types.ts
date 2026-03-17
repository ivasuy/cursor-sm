export type FileEventType = "create" | "save" | "delete";

export type FileCategory = "Logic" | "UI" | "Config" | "Docs" | "Test" | "Other";

export type WorkIntent =
  | "focused-deep-work"
  | "active-iteration"
  | "ui-behavior-work"
  | "experimentation"
  | "exploration"
  | "debugging-thinking"
  | "mixed";

export type SessionData = {
  sessionId: string;
  workspacePath: string;
  startTime: string;
  endTime: string | null;
  filesTouched: string[];
  saveCounts: Record<string, number>;
  fileChangeEvents: {
    file: string;
    eventType: FileEventType;
    timestamp: string;
  }[];
  gitDiff: string | null;
  branch: string | null;
};

export type DiffFileSummary = {
  file: string;
  added: number;
  removed: number;
  addedLines: string[];
  removedLines: string[];
};

export type SessionDelta = {
  created: { file: string; content: string[]; fullContent: string }[];
  updated: {
    file: string;
    added: number;
    removed: number;
    addedLines: string[];
    removedLines: string[];
    fullContent: string;
  }[];
  deleted: {
    file: string;
    affectedFiles: { file: string; content: string }[];
  }[];
};

export type ConfidenceLevel = "Low" | "Medium" | "High";

export type SessionAnalysis = {
  sessionMode: string;
  confidence: { level: ConfidenceLevel; explanation: string };
  delta: SessionDelta;
  frictionPoints: string[];
  tomorrowChecklist: string[];
  explicitlyDidntTouch: string[];
  userNote: string | null;
  primaryFocusFiles: { file: string; reason: string }[];
  intentDescription: string;
};

export type SafetyWarning = {
  severity: "info" | "warning" | "critical";
  category: string;
  message: string;
  file?: string;
  line?: string;
  lineIndex?: number;
  context?: string[];
};

export type CodeChangeSummary = {
  file: string;
  linesAdded: number;
  linesRemoved: number;
  functionsAdded: string[];
  importsChanged: boolean;
};

// ============================================================================
// CROSS-SESSION MEMORY (Phase 2)
// ============================================================================

export type StoredSession = {
  id: string;
  startTime: string;
  endTime: string;
  branch: string | null;
  filesTouched: string[];
  saveCounts: Record<string, number>;
  sessionMode: string;
  confidence: ConfidenceLevel;
  frictionPoints: string[];
  tomorrowChecklist: string[];
  intentDescription: string;
  safetyWarningCount: number;
};

export type ChurnHotspot = {
  file: string;
  sessionCount: number;
  totalSaves: number;
  lastSeen: string;
};

export type SessionMemory = {
  lastSession: StoredSession | null;
  totalSessions: number;
  churnHotspots: ChurnHotspot[];
  recurringFriction: string[];
  recentBranches: string[];
  openTodos: string[];
};
