export interface SessionStartResponse {
  sessionId: string;
  startTime: string;
  branch: string | null;
}

export interface SessionEndResponse {
  summaryPath: string;
  contextPath: string;
  safetyWarnings: SafetyWarning[];
  aiSummary: boolean;
}

export interface SafetyWarning {
  severity: string;
  message: string;
  file?: string;
  line?: number;
}

export interface SessionStatus {
  active: boolean;
  sessionId?: string;
  duration?: number;
  branch?: string;
  filesTouched?: number;
  totalSaves?: number;
  events?: number;
  notes?: number;
}

export interface AuthStatus {
  authenticated: boolean;
  email?: string;
  userId?: string;
  displayName?: string;
}

export interface AuthLoginResponse {
  authUrl: string;
}

export interface AuthCallbackResponse {
  email: string;
  userId: string;
}

export interface HistorySession {
  id: string;
  startTime: string;
  endTime: string;
  branch: string | null;
  filesTouched: string[];
  sessionMode: string;
  confidence: string;
  frictionPoints: string[];
  tomorrowChecklist: string[];
  intentDescription: string;
  linesAdded?: number;
  linesRemoved?: number;
}

export interface HistoryResponse {
  sessions: HistorySession[];
}

export interface ContextResponse {
  context: string | null;
}

export interface SafetyCheckResponse {
  warnings: SafetyWarning[];
}

export interface CardResponse {
  cardPath: string;
}

export interface HealthResponse {
  status: string;
  uptime: number;
  version: string;
  activeSessions: number;
}
