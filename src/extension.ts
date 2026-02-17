import * as vscode from "vscode";
import * as path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import * as https from "https";

const execAsync = promisify(exec);
const SUMMARY_FOLDER = ".cursor-sessions";

function generateSummaryFilename(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  return `session-${yyyy}-${mm}-${dd}_${hh}-${min}-${ss}.md`;
}

// ============================================================================
// FILE EXCLUSION PATTERNS
// ============================================================================

const EXCLUDED_PATTERNS = [
  /^node_modules\//,
  /^dist\//,
  /^build\//,
  /^\.next\//,
  /^coverage\//,
  /^\.git\//,
  /^\.cursor-sessions\//,
  /^\.cursor-session-summary\.md$/,
  /^\.env$/,
  /\.min\.js$/,
  /\.bundle\.js$/,
  /\.map$/,
  /^package-lock\.json$/,
  /^yarn\.lock$/,
  /^pnpm-lock\.yaml$/,
];

function isExcludedFile(filePath: string): boolean {
  return EXCLUDED_PATTERNS.some((pattern) => pattern.test(filePath));
}

// ============================================================================
// TYPES
// ============================================================================

type FileEventType = "create" | "save" | "delete";

type FileCategory = "Logic" | "UI" | "Config" | "Docs" | "Other";

type WorkIntent =
  | "focused-deep-work"
  | "active-iteration"
  | "ui-behavior-work"
  | "experimentation"
  | "exploration"
  | "debugging-thinking"
  | "mixed";

type SessionData = {
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
  modelUsage: {
    modelName: string;
    estimatedTokensUsed: number | null;
  };
};

type SessionAnalysis = {
  primaryFocusFiles: { file: string; reason: string }[];
  workIntent: WorkIntent;
  intentDescription: string;
  sessionFlow: string[];
  conceptsAndAreas: string[];
  whatFiguredOut: string[];
  openThreads: string[];
  untouchedAreas: string[];
  aiInsights: {
    used: boolean;
    intentRefinement: string | null;
    conceptsExtracted: string[] | null;
    resumeAdvice: string | null;
  };
};

type DiffFileSummary = {
  file: string;
  added: number;
  removed: number;
  addedLines: string[];
  removedLines: string[];
};

// ============================================================================
// GROQ AI INTEGRATION
// ============================================================================

const GROQ_API_URL = "api.groq.com";
const GROQ_MODEL = "llama-3.1-8b-instant";
const GROQ_API_KEY_BUILTIN = "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";

async function callGroqAI(
  prompt: string,
  apiKey: string
): Promise<string | null> {
  console.log("[CursorSessionTracker] Making Groq API call...");

  return new Promise((resolve) => {
    const payload = JSON.stringify({
      model: GROQ_MODEL,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 300,
      temperature: 0.3,
    });

    const options = {
      hostname: GROQ_API_URL,
      port: 443,
      path: "/openai/v1/chat/completions",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "Content-Length": Buffer.byteLength(payload),
      },
      timeout: 15000,
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        console.log("[CursorSessionTracker] Groq API response status:", res.statusCode);
        try {
          const json = JSON.parse(data);
          if (json.error) {
            console.error("[CursorSessionTracker] Groq API error:", json.error);
            resolve(null);
            return;
          }
          const content = json?.choices?.[0]?.message?.content;
          console.log("[CursorSessionTracker] Groq API success, got content:", !!content);
          resolve(content ?? null);
        } catch (e) {
          console.error("[CursorSessionTracker] Groq API parse error:", e);
          resolve(null);
        }
      });
    });

    req.on("error", (e) => {
      console.error("[CursorSessionTracker] Groq API request error:", e);
      resolve(null);
    });
    req.on("timeout", () => {
      console.error("[CursorSessionTracker] Groq API timeout");
      req.destroy();
      resolve(null);
    });

    req.write(payload);
    req.end();
  });
}

function getGroqApiKey(): string {
  const config = vscode.workspace.getConfiguration("cursorSessionTracker");
  const settingsKey = config.get<string>("groqApiKey");
  if (settingsKey && settingsKey.trim()) {
    console.log("[CursorSessionTracker] Using Groq API key from settings");
    return settingsKey.trim();
  }
  console.log("[CursorSessionTracker] Using built-in Groq API key");
  return GROQ_API_KEY_BUILTIN;
}

async function aiRefineIntent(
  primaryFiles: string[],
  savePatterns: string,
  apiKey: string
): Promise<string | null> {
  const prompt = `You are helping a developer remember their coding session.

Primary files worked on: ${primaryFiles.join(", ")}
Save patterns: ${savePatterns}

In ONE short paragraph (2-3 sentences), describe what the developer was likely trying to accomplish. Focus on intent and purpose, not file changes. Be specific but don't speculate wildly.`;

  return callGroqAI(prompt, apiKey);
}

async function aiExtractConcepts(
  fileTypes: string[],
  changeDescriptions: string[],
  apiKey: string
): Promise<string[] | null> {
  const prompt = `You are helping a developer remember concepts they worked with.

File types edited: ${fileTypes.join(", ")}
Changes made: ${changeDescriptions.slice(0, 5).join("; ")}

List 3-5 programming concepts or areas touched (e.g., "state management", "event handling", "API integration", "UI layout"). Return ONLY a comma-separated list, nothing else.`;

  const result = await callGroqAI(prompt, apiKey);
  if (!result) {
    return null;
  }
  return result
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

async function aiResumeAdvice(
  lastEditedFile: string,
  hasTodos: boolean,
  incompleteSignals: string[],
  apiKey: string
): Promise<string | null> {
  const prompt = `You are helping a developer resume work tomorrow.

Last edited file: ${lastEditedFile}
Has TODO markers: ${hasTodos ? "yes" : "no"}
Incomplete signals: ${incompleteSignals.join(", ") || "none detected"}

In ONE sentence, suggest where to start next session. Be concrete and actionable.`;

  return callGroqAI(prompt, apiKey);
}

// ============================================================================
// SESSION MANAGER
// ============================================================================

class SessionManager {
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
      modelUsage: {
        modelName: "unavailable (cursor-internal)",
        estimatedTokensUsed: null,
      },
    };
  }
}

const sessionManager = new SessionManager();

// ============================================================================
// EXTENSION LIFECYCLE
// ============================================================================

export function activate(context: vscode.ExtensionContext) {
  console.log("[CursorSessionTracker] Extension activating...");
  const workspaceFolders = vscode.workspace.workspaceFolders;
  console.log("[CursorSessionTracker] Workspace folders:", workspaceFolders?.map(f => f.uri.fsPath) ?? "none");
  startWorkspaceSession();
  console.log("[CursorSessionTracker] Session started for workspace");

  const endSessionCommand = vscode.commands.registerCommand(
    "cursorSessionTracker.endSession",
    async () => {
      console.log("[CursorSessionTracker] End session command triggered");
      await endSessionAndGenerateSummary();
    }
  );

  const createListener = vscode.workspace.onDidCreateFiles(
    (event: vscode.FileCreateEvent) => {
      event.files.forEach((file: vscode.Uri) =>
        recordFileEvent(file, "create")
      );
    }
  );

  const deleteListener = vscode.workspace.onDidDeleteFiles(
    (event: vscode.FileDeleteEvent) => {
      event.files.forEach((file: vscode.Uri) =>
        recordFileEvent(file, "delete")
      );
    }
  );

  const saveListener = vscode.workspace.onDidSaveTextDocument(
    (doc: vscode.TextDocument) => {
      recordFileEvent(doc.uri, "save");
    }
  );

  const openListener = vscode.workspace.onDidOpenTextDocument(
    (doc: vscode.TextDocument) => {
      if (doc.uri.scheme === "file") {
        console.log(`[CursorSessionTracker] Document opened: ${doc.uri.fsPath}`);
        recordFileChange(doc.uri);
      }
    }
  );

  const changeListener = vscode.workspace.onDidChangeTextDocument(
    (event: vscode.TextDocumentChangeEvent) => {
      if (event.contentChanges.length > 0 && event.document.uri.scheme === "file") {
        console.log(`[CursorSessionTracker] Document changed: ${event.document.uri.fsPath}`);
        recordFileChange(event.document.uri);
      }
    }
  );

  const activeEditorListener = vscode.window.onDidChangeActiveTextEditor(
    (editor) => {
      if (editor && editor.document.uri.scheme === "file") {
        console.log(`[CursorSessionTracker] Active editor: ${editor.document.uri.fsPath}`);
        recordFileChange(editor.document.uri);
      }
    }
  );

  vscode.workspace.textDocuments.forEach((doc) => {
    if (doc.uri.scheme === "file") {
      console.log(`[CursorSessionTracker] Already open: ${doc.uri.fsPath}`);
      recordFileChange(doc.uri);
    }
  });

  context.subscriptions.push(
    endSessionCommand,
    createListener,
    deleteListener,
    saveListener,
    openListener,
    changeListener,
    activeEditorListener
  );
}

export function deactivate() {}

function startWorkspaceSession() {
  if (vscode.workspace.workspaceFile) {
    const workspaceKey = getPrimaryWorkspaceKey();
    const workspacePath = getPrimaryWorkspacePath();
    if (workspaceKey && workspacePath) {
      sessionManager.ensureSession(workspaceKey, workspacePath);
    }
    return;
  }
  const folders = vscode.workspace.workspaceFolders ?? [];
  folders.forEach((folder) => {
    sessionManager.ensureSession(folder.uri.fsPath, folder.uri.fsPath);
  });
}

function recordFileChange(uri: vscode.Uri) {
  if (uri.scheme !== "file") {
    return;
  }
  const workspaceKey = getWorkspaceKeyForUri(uri);
  const workspacePath = getWorkspacePathForUri(uri);
  const relativePath = getRelativePathForUri(uri);

  if (!workspaceKey || !workspacePath || !relativePath) {
    return;
  }

  if (isExcludedFile(relativePath)) {
    return;
  }

  const session = sessionManager.ensureSession(workspaceKey, workspacePath);
  const wasNew = !session.filesTouched.includes(relativePath);
  ensureFileTracked(session, relativePath);

  if (wasNew) {
    console.log(`[CursorSessionTracker] New file tracked: ${relativePath}`);
  }
}

function recordFileEvent(uri: vscode.Uri, eventType: FileEventType) {
  console.log(`[CursorSessionTracker] File event: ${eventType} - ${uri.fsPath}`);

  if (uri.scheme !== "file") {
    console.log("[CursorSessionTracker] Skipped: not a file scheme");
    return;
  }
  const workspaceKey = getWorkspaceKeyForUri(uri);
  const workspacePath = getWorkspacePathForUri(uri);
  const relativePath = getRelativePathForUri(uri);

  if (!workspaceKey || !workspacePath || !relativePath) {
    console.log("[CursorSessionTracker] Skipped: could not resolve workspace context");
    return;
  }

  if (isExcludedFile(relativePath)) {
    console.log("[CursorSessionTracker] Skipped: excluded file pattern");
    return;
  }

  const session = sessionManager.ensureSession(workspaceKey, workspacePath);
  session.fileChangeEvents.push({
    file: relativePath,
    eventType,
    timestamp: new Date().toISOString(),
  });
  ensureFileTracked(session, relativePath);
  if (eventType === "save") {
    session.saveCounts[relativePath] =
      (session.saveCounts[relativePath] ?? 0) + 1;
  }

  console.log(`[CursorSessionTracker] Recorded: ${relativePath} (${eventType})`);
}

async function endSessionAndGenerateSummary() {
  console.log("[CursorSessionTracker] Starting summary generation...");

  const ctx = getWorkspaceContextForCommand();
  if (!ctx) {
    console.log("[CursorSessionTracker] No workspace context found");
    vscode.window.showWarningMessage(
      "No workspace is open. Session summary not generated."
    );
    return;
  }

  console.log("[CursorSessionTracker] Workspace:", ctx.summaryDirectory);

  const { workspaceKey, summaryDirectory } = ctx;
  const session = sessionManager.endSession(
    workspaceKey,
    new Date().toISOString()
  );
  if (!session) {
    console.log("[CursorSessionTracker] No active session found");
    vscode.window.showWarningMessage(
      "No active session found for this workspace."
    );
    return;
  }

  console.log(
    "[CursorSessionTracker] Session has",
    session.filesTouched.length,
    "files touched"
  );

  session.gitDiff = await getGitDiff();
  mergeDiffFilesIntoSession(session);

  session.filesTouched = session.filesTouched.filter(
    (f) => !isExcludedFile(f)
  );

  const analysis = await analyzeSession(session);
  const summary = renderSessionMemory(session, analysis);

  const sessionsFolderPath = path.join(summaryDirectory, SUMMARY_FOLDER);
  const sessionsFolderUri = vscode.Uri.file(sessionsFolderPath);

  try {
    await vscode.workspace.fs.createDirectory(sessionsFolderUri);
  } catch {
    // Folder may already exist
  }

  const summaryFilename = generateSummaryFilename();
  const summaryPath = path.join(sessionsFolderPath, summaryFilename);

  try {
    await vscode.workspace.fs.writeFile(
      vscode.Uri.file(summaryPath),
      Buffer.from(summary, "utf8")
    );
    vscode.window.showInformationMessage(
      `Session memory written to ${SUMMARY_FOLDER}/${summaryFilename}`
    );

    const doc = await vscode.workspace.openTextDocument(
      vscode.Uri.file(summaryPath)
    );
    await vscode.window.showTextDocument(doc, { preview: false });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error writing summary.";
    vscode.window.showErrorMessage(`Failed to write session summary: ${message}`);
    console.error("[CursorSessionTracker] Write error:", error);
  } finally {
    sessionManager.removeSession(workspaceKey);
    startWorkspaceSession();
  }
}

// ============================================================================
// GIT DIFF CAPTURE
// ============================================================================

async function getGitDiff(): Promise<string | null> {
  const cwd = getGitDiffCwd();
  if (!cwd) {
    return null;
  }
  try {
    const { stdout } = await execAsync("git diff HEAD", {
      cwd,
      maxBuffer: 10 * 1024 * 1024,
    });
    if (!stdout.trim()) {
      return "";
    }
    return stdout;
  } catch {
    vscode.window.showWarningMessage(
      "No git repo detected. Summary will omit diff-based insights."
    );
    return null;
  }
}

function parseGitDiffByFile(gitDiff: string | null): DiffFileSummary[] {
  if (!gitDiff || !gitDiff.trim()) {
    return [];
  }
  const fileStats = new Map<string, DiffFileSummary>();
  const diffLines = gitDiff.split("\n");
  let currentFile = "";
  const maxSampleLines = 60;

  diffLines.forEach((line) => {
    if (line.startsWith("diff --git")) {
      const match = /diff --git a\/(.+?) b\/(.+)/.exec(line);
      currentFile = match ? match[2] : "";
      if (currentFile && !fileStats.has(currentFile)) {
        fileStats.set(currentFile, {
          file: currentFile,
          added: 0,
          removed: 0,
          addedLines: [],
          removedLines: [],
        });
      }
      return;
    }
    if (!currentFile || line.startsWith("+++ ") || line.startsWith("--- ")) {
      return;
    }
    const stats = fileStats.get(currentFile);
    if (!stats) {
      return;
    }
    if (line.startsWith("+")) {
      stats.added += 1;
      if (stats.addedLines.length < maxSampleLines) {
        stats.addedLines.push(line.slice(1));
      }
    } else if (line.startsWith("-")) {
      stats.removed += 1;
      if (stats.removedLines.length < maxSampleLines) {
        stats.removedLines.push(line.slice(1));
      }
    }
  });

  return Array.from(fileStats.values()).filter((s) => !isExcludedFile(s.file));
}

// ============================================================================
// FILE CLASSIFICATION
// ============================================================================

function classifyFile(file: string): FileCategory {
  const ext = path.extname(file).toLowerCase();
  const basename = path.basename(file).toLowerCase();

  if (ext === ".jsx" || ext === ".tsx") {
    return "UI";
  }
  if (ext === ".css" || ext === ".scss" || ext === ".sass" || ext === ".less") {
    return "UI";
  }
  if (basename.includes("component") || basename.includes("page")) {
    return "UI";
  }

  if (ext === ".ts" || ext === ".js" || ext === ".mjs" || ext === ".cjs") {
    return "Logic";
  }
  if (ext === ".py" || ext === ".go" || ext === ".rs" || ext === ".java") {
    return "Logic";
  }

  if (ext === ".json" || ext === ".yaml" || ext === ".yml" || ext === ".toml") {
    return "Config";
  }
  if (ext === ".env" || basename.startsWith(".")) {
    return "Config";
  }

  if (ext === ".md" || ext === ".txt" || ext === ".rst") {
    return "Docs";
  }

  return "Other";
}

function groupFilesByCategory(
  files: string[]
): Record<FileCategory, string[]> {
  const grouped: Record<FileCategory, string[]> = {
    Logic: [],
    UI: [],
    Config: [],
    Docs: [],
    Other: [],
  };
  files.forEach((file) => {
    grouped[classifyFile(file)].push(file);
  });
  return grouped;
}

// ============================================================================
// WORK INTENT DETECTION
// ============================================================================

function detectWorkIntent(session: SessionData): {
  intent: WorkIntent;
  description: string;
} {
  const events = session.fileChangeEvents;
  const saveCounts = session.saveCounts;
  const files = session.filesTouched;

  if (files.length === 0) {
    return { intent: "mixed", description: "Minimal activity detected." };
  }

  const totalSaves = Object.values(saveCounts).reduce((a, b) => a + b, 0);
  const maxSavesOnSingleFile = Math.max(...Object.values(saveCounts), 0);
  const filesWithMultipleSaves = Object.values(saveCounts).filter(
    (c) => c > 2
  ).length;

  const categories = groupFilesByCategory(files);
  const hasUI = categories.UI.length > 0;
  const hasLogic = categories.Logic.length > 0;

  const createEvents = events.filter((e) => e.eventType === "create").length;
  const deleteEvents = events.filter((e) => e.eventType === "delete").length;

  const timestamps = events.map((e) => Date.parse(e.timestamp)).sort();
  let maxGapMinutes = 0;
  for (let i = 1; i < timestamps.length; i++) {
    const gap = (timestamps[i] - timestamps[i - 1]) / 60000;
    if (gap > maxGapMinutes) {
      maxGapMinutes = gap;
    }
  }

  if (files.length === 1 && totalSaves >= 3) {
    return {
      intent: "focused-deep-work",
      description: `Deep focus on a single file (${files[0]}) with ${totalSaves} saves.`,
    };
  }

  if (maxSavesOnSingleFile >= 5 && filesWithMultipleSaves <= 2) {
    const dominant = Object.entries(saveCounts).sort((a, b) => b[1] - a[1])[0];
    return {
      intent: "active-iteration",
      description: `Iterating heavily on ${dominant[0]} (${dominant[1]} saves).`,
    };
  }

  if (hasUI && hasLogic) {
    return {
      intent: "ui-behavior-work",
      description:
        "Working across UI components and logic, likely building interactive behavior.",
    };
  }

  if (createEvents >= 3 || deleteEvents >= 2) {
    return {
      intent: "experimentation",
      description: `Experimentation phase with ${createEvents} files created and ${deleteEvents} deleted.`,
    };
  }

  if (maxGapMinutes > 10) {
    return {
      intent: "debugging-thinking",
      description: `Session had ${Math.round(maxGapMinutes)} minute gaps, suggesting debugging or deep thinking.`,
    };
  }

  if (files.length >= 5 && filesWithMultipleSaves <= 1) {
    return {
      intent: "exploration",
      description: `Explored ${files.length} files without deep iteration on any single one.`,
    };
  }

  return {
    intent: "mixed",
    description: `Mixed activity across ${files.length} files with ${totalSaves} total saves.`,
  };
}

// ============================================================================
// SESSION ANALYSIS
// ============================================================================

async function analyzeSession(session: SessionData): Promise<SessionAnalysis> {
  const diffSummaries = parseGitDiffByFile(session.gitDiff);
  const { intent, description } = detectWorkIntent(session);

  const rankedFiles = rankFilesByImportance(session, diffSummaries);
  const primaryFiles = rankedFiles.slice(0, 3);
  const sessionFlow = buildSessionFlow(session);
  const concepts = detectConceptsDeterministic(session, diffSummaries);
  const figuredOut = inferWhatFiguredOut(session, diffSummaries);
  const openThreads = detectOpenThreads(session, diffSummaries);
  const untouched = inferUntouchedAreas(session);
  const aiInsights = await gatherAIInsights(
    session,
    primaryFiles,
    concepts,
    openThreads
  );

  return {
    primaryFocusFiles: primaryFiles,
    workIntent: intent,
    intentDescription: description,
    sessionFlow,
    conceptsAndAreas: aiInsights.conceptsExtracted ?? concepts,
    whatFiguredOut: figuredOut,
    openThreads,
    untouchedAreas: untouched,
    aiInsights,
  };
}

function rankFilesByImportance(
  session: SessionData,
  diffSummaries: DiffFileSummary[]
): { file: string; reason: string }[] {
  const scores = new Map<string, { score: number; reasons: string[] }>();

  Object.entries(session.saveCounts).forEach(([file, count]) => {
    const entry = scores.get(file) || { score: 0, reasons: [] };
    entry.score += count * 10;
    if (count >= 3) {
      entry.reasons.push(`saved ${count} times`);
    }
    scores.set(file, entry);
  });

  diffSummaries.forEach((d) => {
    const entry = scores.get(d.file) || { score: 0, reasons: [] };
    const diffSize = d.added + d.removed;
    entry.score += diffSize;
    if (diffSize >= 20) {
      entry.reasons.push(`${d.added} lines added, ${d.removed} removed`);
    }
    scores.set(d.file, entry);
  });

  session.filesTouched.forEach((file) => {
    const cat = classifyFile(file);
    const entry = scores.get(file) || { score: 0, reasons: [] };
    if (cat === "UI" || cat === "Logic") {
      entry.score += 5;
    }
    scores.set(file, entry);
  });

  return Array.from(scores.entries())
    .sort((a, b) => b[1].score - a[1].score)
    .map(([file, data]) => ({
      file,
      reason: data.reasons.length > 0 ? data.reasons.join("; ") : "touched",
    }));
}

function buildSessionFlow(session: SessionData): string[] {
  const flow: string[] = [];
  const events = session.fileChangeEvents;

  if (events.length === 0) {
    return ["No file activity detected."];
  }

  const startTime = Date.parse(session.startTime);
  const endTime = session.endTime ? Date.parse(session.endTime) : Date.now();
  const duration = endTime - startTime;

  if (duration < 5 * 60 * 1000) {
    flow.push("Quick session under 5 minutes.");
  } else if (duration < 30 * 60 * 1000) {
    flow.push("Short focused session (under 30 minutes).");
  } else if (duration < 2 * 60 * 60 * 1000) {
    flow.push("Extended working session (30 min to 2 hours).");
  } else {
    flow.push("Long session spanning over 2 hours.");
  }

  const timestamps = events.map((e) => Date.parse(e.timestamp));
  const midpoint = startTime + duration / 2;
  const earlyEvents = timestamps.filter((t) => t < midpoint).length;
  const lateEvents = timestamps.filter((t) => t >= midpoint).length;

  if (earlyEvents > lateEvents * 2) {
    flow.push("Most activity happened early, then tapered off.");
  } else if (lateEvents > earlyEvents * 2) {
    flow.push("Activity ramped up toward the end.");
  } else {
    flow.push("Activity was spread throughout the session.");
  }

  const uniqueFilesInOrder: string[] = [];
  events.forEach((e) => {
    if (!uniqueFilesInOrder.includes(e.file)) {
      uniqueFilesInOrder.push(e.file);
    }
  });

  if (uniqueFilesInOrder.length >= 3) {
    flow.push(
      `Touched files in this order: ${uniqueFilesInOrder.slice(0, 4).join(" → ")}${uniqueFilesInOrder.length > 4 ? " → ..." : ""}`
    );
  }

  return flow;
}

function detectConceptsDeterministic(
  session: SessionData,
  diffSummaries: DiffFileSummary[]
): string[] {
  const concepts: Set<string> = new Set();
  const categories = groupFilesByCategory(session.filesTouched);

  if (categories.UI.length > 0) {
    concepts.add("UI components");
  }
  if (categories.Logic.length > 0) {
    concepts.add("Application logic");
  }
  if (categories.Config.length > 0) {
    concepts.add("Configuration/tooling");
  }

  diffSummaries.forEach((d) => {
    const combined = [...d.addedLines, ...d.removedLines].join("\n");

    if (/useState|useEffect|useReducer|useContext/i.test(combined)) {
      concepts.add("React state management");
    }
    if (/addEventListener|onClick|onChange|onSubmit/i.test(combined)) {
      concepts.add("Event handling");
    }
    if (/fetch|axios|api|endpoint/i.test(combined)) {
      concepts.add("API integration");
    }
    if (/async|await|Promise|\.then/i.test(combined)) {
      concepts.add("Async operations");
    }
    if (/interface|type\s+\w+\s*=/i.test(combined)) {
      concepts.add("Type definitions");
    }
    if (/class\s+\w+|extends|implements/i.test(combined)) {
      concepts.add("Object-oriented patterns");
    }
    if (/test|describe|it\(|expect/i.test(combined)) {
      concepts.add("Testing");
    }
    if (/import|export|require/i.test(combined)) {
      concepts.add("Module organization");
    }
  });

  return Array.from(concepts);
}

function inferWhatFiguredOut(
  session: SessionData,
  diffSummaries: DiffFileSummary[]
): string[] {
  const insights: string[] = [];
  const { intent } = detectWorkIntent(session);

  if (intent === "focused-deep-work") {
    insights.push(
      "Gained deeper understanding of a specific area through focused iteration."
    );
  }

  if (intent === "ui-behavior-work") {
    insights.push("Clarified how UI and logic connect in this part of the app.");
  }

  if (intent === "experimentation") {
    insights.push(
      "Explored different approaches; some ideas were created and discarded."
    );
  }

  const totalRemoved = diffSummaries.reduce((sum, d) => sum + d.removed, 0);
  const totalAdded = diffSummaries.reduce((sum, d) => sum + d.added, 0);

  if (totalRemoved > totalAdded && totalRemoved > 30) {
    insights.push("Simplified code by removing more than was added.");
  }

  if (insights.length === 0) {
    insights.push("Session captured for future reference.");
  }

  return insights;
}

function detectOpenThreads(
  session: SessionData,
  diffSummaries: DiffFileSummary[]
): string[] {
  const threads: string[] = [];

  const hasTodos = diffSummaries.some((d) =>
    d.addedLines.some((line) => /TODO|FIXME|HACK|XXX/i.test(line))
  );
  if (hasTodos) {
    threads.push("TODO/FIXME markers were added — review before shipping.");
  }

  const hasConsoleLog = diffSummaries.some((d) =>
    d.addedLines.some((line) => /console\.log/i.test(line))
  );
  if (hasConsoleLog) {
    threads.push("Debug console.log statements remain — consider cleanup.");
  }

  const categories = groupFilesByCategory(session.filesTouched);
  const hasTests = categories.Logic.some((f) =>
    /test|spec/i.test(path.basename(f))
  );
  const hasLargeAdditions = diffSummaries.some((d) => d.added > 50);
  if (hasLargeAdditions && !hasTests) {
    threads.push("Significant code added without corresponding tests.");
  }

  if (session.fileChangeEvents.length > 0) {
    const lastEvent =
      session.fileChangeEvents[session.fileChangeEvents.length - 1];
    threads.push(`Last edited: ${lastEvent.file}`);
  }

  if (threads.length === 0) {
    threads.push("No obvious open threads detected.");
  }

  return threads;
}

function inferUntouchedAreas(session: SessionData): string[] {
  const untouched: string[] = [];
  const categories = groupFilesByCategory(session.filesTouched);

  if (categories.Docs.length === 0) {
    untouched.push("Documentation was not updated.");
  }
  if (categories.Config.length === 0) {
    untouched.push("No configuration changes made.");
  }

  const hasTests = session.filesTouched.some((f) => /test|spec/i.test(f));
  if (!hasTests) {
    untouched.push("Tests were not modified.");
  }

  if (untouched.length === 0) {
    untouched.push("Session covered multiple areas.");
  }

  return untouched;
}

// ============================================================================
// AI INSIGHTS
// ============================================================================

async function gatherAIInsights(
  session: SessionData,
  primaryFiles: { file: string; reason: string }[],
  deterministicConcepts: string[],
  openThreads: string[]
): Promise<SessionAnalysis["aiInsights"]> {
  console.log("[CursorSessionTracker] Gathering AI insights...");

  const apiKey = getGroqApiKey();
  console.log("[CursorSessionTracker] API key found, making AI calls...");

  const fileNames = primaryFiles.map((f) => f.file);
  const savePatterns = Object.entries(session.saveCounts)
    .map(([f, c]) => `${path.basename(f)}: ${c} saves`)
    .join(", ");

  console.log("[CursorSessionTracker] Primary files for AI:", fileNames);
  console.log("[CursorSessionTracker] Save patterns:", savePatterns);

  const [intentResult, conceptsResult, resumeResult] = await Promise.all([
    aiRefineIntent(fileNames, savePatterns, apiKey).catch((e) => {
      console.error("[CursorSessionTracker] Intent AI call failed:", e);
      return null;
    }),
    aiExtractConcepts(
      fileNames.map((f) => path.extname(f)),
      deterministicConcepts,
      apiKey
    ).catch((e) => {
      console.error("[CursorSessionTracker] Concepts AI call failed:", e);
      return null;
    }),
    aiResumeAdvice(
      fileNames[0] || "unknown",
      openThreads.some((t) => /TODO|FIXME/i.test(t)),
      openThreads.filter((t) => !/Last edited/i.test(t)),
      apiKey
    ).catch((e) => {
      console.error("[CursorSessionTracker] Resume AI call failed:", e);
      return null;
    }),
  ]);

  console.log("[CursorSessionTracker] AI results - intent:", !!intentResult, "concepts:", !!conceptsResult, "resume:", !!resumeResult);

  return {
    used: !!(intentResult || conceptsResult || resumeResult),
    intentRefinement: intentResult,
    conceptsExtracted: conceptsResult,
    resumeAdvice: resumeResult,
  };
}

// ============================================================================
// SUMMARY RENDERING
// ============================================================================

function renderSessionMemory(
  session: SessionData,
  analysis: SessionAnalysis
): string {
  const sections: string[] = [];

  sections.push("# Session Memory");
  sections.push("");

  sections.push("## What I Was Working On");
  sections.push(analysis.intentDescription);
  if (analysis.aiInsights.intentRefinement) {
    sections.push("");
    sections.push(`*AI-assisted insight:* ${analysis.aiInsights.intentRefinement}`);
  }
  sections.push("");

  sections.push("## Primary Focus Files");
  if (analysis.primaryFocusFiles.length === 0) {
    sections.push("No significant file activity detected.");
  } else {
    analysis.primaryFocusFiles.forEach((f) => {
      sections.push(`- **${f.file}** — ${f.reason}`);
    });
  }
  sections.push("");

  sections.push("## What Changed (Context, Not Diff)");
  const changeContext = buildChangeContext(session);
  sections.push(changeContext);
  sections.push("");

  sections.push("## How the Session Evolved");
  analysis.sessionFlow.forEach((line) => sections.push(`- ${line}`));
  sections.push("");

  sections.push("## Concepts & Areas Touched");
  analysis.conceptsAndAreas.forEach((c) => sections.push(`- ${c}`));
  if (analysis.aiInsights.used && analysis.aiInsights.conceptsExtracted) {
    sections.push("");
    sections.push("*(concepts above refined by AI)*");
  }
  sections.push("");

  sections.push("## What I Figured Out");
  analysis.whatFiguredOut.forEach((w) => sections.push(`- ${w}`));
  sections.push("");

  sections.push("## Open Threads / Resume Points");
  analysis.openThreads.forEach((t) => sections.push(`- ${t}`));
  if (analysis.aiInsights.resumeAdvice) {
    sections.push("");
    sections.push(`*AI suggestion:* ${analysis.aiInsights.resumeAdvice}`);
  }
  sections.push("");

  sections.push("## What This Session Was NOT");
  analysis.untouchedAreas.forEach((u) => sections.push(`- ${u}`));
  sections.push("");

  sections.push("## AI Usage Disclosure");
  sections.push(
    "- Cursor AI activity is unavailable to extensions by design. Model name and token usage cannot be tracked."
  );
  if (analysis.aiInsights.used) {
    sections.push(
      "- Groq AI (free tier) was used for high-level insight extraction only — not for code generation."
    );
    sections.push("- All file tracking and core analysis is deterministic.");
  } else {
    sections.push(
      "- This summary was generated entirely from file system events and git metadata, without AI inference."
    );
  }

  return sections.join("\n");
}

function buildChangeContext(session: SessionData): string {
  const categories = groupFilesByCategory(session.filesTouched);
  const parts: string[] = [];

  const catDescriptions: { cat: FileCategory; desc: string }[] = [
    { cat: "UI", desc: "UI components" },
    { cat: "Logic", desc: "application logic" },
    { cat: "Config", desc: "configuration" },
    { cat: "Docs", desc: "documentation" },
  ];

  catDescriptions.forEach(({ cat, desc }) => {
    if (categories[cat].length > 0) {
      parts.push(`${categories[cat].length} ${desc} file(s)`);
    }
  });

  if (parts.length === 0) {
    return "No meaningful code changes detected.";
  }

  const totalSaves = Object.values(session.saveCounts).reduce(
    (a, b) => a + b,
    0
  );

  return `This session modified ${parts.join(", ")} across ${totalSaves} total saves.`;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function getWorkspaceKeyForUri(uri: vscode.Uri): string | null {
  if (vscode.workspace.workspaceFile) {
    return vscode.workspace.workspaceFile.fsPath;
  }
  const folder = vscode.workspace.getWorkspaceFolder(uri);
  return folder ? folder.uri.fsPath : null;
}

function getWorkspacePathForUri(uri: vscode.Uri): string | null {
  if (vscode.workspace.workspaceFile) {
    return path.dirname(vscode.workspace.workspaceFile.fsPath);
  }
  const folder = vscode.workspace.getWorkspaceFolder(uri);
  return folder ? folder.uri.fsPath : null;
}

function getRelativePathForUri(uri: vscode.Uri): string | null {
  const folder = vscode.workspace.getWorkspaceFolder(uri);
  if (!folder) {
    return null;
  }
  const relativePath = path.relative(folder.uri.fsPath, uri.fsPath);
  if (vscode.workspace.workspaceFile) {
    return path.join(folder.name, relativePath);
  }
  return relativePath;
}

function getPrimaryWorkspaceKey(): string | null {
  if (vscode.workspace.workspaceFile) {
    return vscode.workspace.workspaceFile.fsPath;
  }
  const folder = vscode.workspace.workspaceFolders?.[0];
  return folder ? folder.uri.fsPath : null;
}

function getPrimaryWorkspacePath(): string | null {
  if (vscode.workspace.workspaceFile) {
    return path.dirname(vscode.workspace.workspaceFile.fsPath);
  }
  const folder = vscode.workspace.workspaceFolders?.[0];
  return folder ? folder.uri.fsPath : null;
}

function getWorkspaceContextForCommand(): {
  workspaceKey: string;
  summaryDirectory: string;
} | null {
  const activeUri = vscode.window.activeTextEditor?.document.uri;
  if (activeUri) {
    const workspaceKey = getWorkspaceKeyForUri(activeUri);
    const summaryDirectory = getWorkspacePathForUri(activeUri);
    if (workspaceKey && summaryDirectory) {
      return { workspaceKey, summaryDirectory };
    }
  }
  const workspaceKey = getPrimaryWorkspaceKey();
  const summaryDirectory = getPrimaryWorkspacePath();
  if (!workspaceKey || !summaryDirectory) {
    return null;
  }
  return { workspaceKey, summaryDirectory };
}

function getGitDiffCwd(): string | null {
  const folders = vscode.workspace.workspaceFolders;
  if (folders && folders.length > 0) {
    return folders[0].uri.fsPath;
  }
  if (vscode.workspace.workspaceFile) {
    return path.dirname(vscode.workspace.workspaceFile.fsPath);
  }
  return null;
}

function ensureFileTracked(session: SessionData, relativePath: string) {
  if (!session.filesTouched.includes(relativePath)) {
    session.filesTouched.push(relativePath);
  }
}

function mergeDiffFilesIntoSession(session: SessionData) {
  const diffSummaries = parseGitDiffByFile(session.gitDiff);
  diffSummaries.forEach((summary) => {
    if (!isExcludedFile(summary.file)) {
      ensureFileTracked(session, summary.file);
    }
  });
}
