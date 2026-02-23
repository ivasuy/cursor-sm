import * as vscode from "vscode";
import * as path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import * as http from "http";
import * as https from "https";

const execAsync = promisify(exec);
const SUMMARY_FOLDER = ".cursor-sessions";

let extensionContext: vscode.ExtensionContext;
let statusBarItem: vscode.StatusBarItem;

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
  /^out\//,
  /^target\//,
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
  /^go\.sum$/,
  /^Cargo\.lock$/,
  /^\.gradle\//,
  /^__pycache__\//,
  /^\.venv\//,
  /^vendor\//,
  /^artifacts\//,
  /^\.hardhat\//,
  /^cache\//,
];

function isExcludedFile(filePath: string): boolean {
  return EXCLUDED_PATTERNS.some((pattern) => pattern.test(filePath));
}

// ============================================================================
// TYPES
// ============================================================================

type FileEventType = "create" | "save" | "delete";

type FileCategory = "Logic" | "UI" | "Config" | "Docs" | "Test" | "Other";

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
  branch: string | null;
};

type DiffFileSummary = {
  file: string;
  added: number;
  removed: number;
  addedLines: string[];
  removedLines: string[];
};

type SessionDelta = {
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

type ConfidenceLevel = "Low" | "Medium" | "High";

type SessionAnalysis = {
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
      branch: null,
    };
  }
}

const sessionManager = new SessionManager();

// ============================================================================
// EXTENSION LIFECYCLE
// ============================================================================

export function activate(context: vscode.ExtensionContext) {
  extensionContext = context;

  startWorkspaceSession();

  const endSessionCommand = vscode.commands.registerCommand(
    "cursorSessionTracker.endSession",
    async () => {
      await endSessionAndGenerateSummary();
    }
  );

  const addNoteCommand = vscode.commands.registerCommand(
    "cursorSessionTracker.addSessionNote",
    async () => {
      const note = await vscode.window.showInputBox({
        prompt: "Add a session note (shown in summary under My Note)",
        placeHolder:
          "e.g. Blocked on API design; will pick up tomorrow.",
      });
      if (note && note.trim()) {
        const notes =
          extensionContext.workspaceState.get<string[]>("sessionNotes", []);
        notes.push(note.trim());
        await extensionContext.workspaceState.update("sessionNotes", notes);
        vscode.window.showInformationMessage("Session note added.");
      }
    }
  );

  const signInCommand = vscode.commands.registerCommand(
    "cursorSessionTracker.signIn",
    async () => {
      const config =
        vscode.workspace.getConfiguration("cursorSessionTracker");
      const backendUrl =
        config.get<string>("backendUrl") || "http://localhost:3000";
      const scheme = vscode.env.uriScheme;
      const authUrl = `${backendUrl}/api/auth/google?scheme=${encodeURIComponent(scheme)}`;

      // Force open in system default browser (not Cursor's internal browser)
      const { exec } = require("child_process");
      const platform = process.platform;

      if (platform === "darwin") {
        exec(`open "${authUrl}"`);
      } else if (platform === "win32") {
        exec(`start "" "${authUrl}"`);
      } else {
        exec(`xdg-open "${authUrl}"`);
      }
    }
  );

  const signOutCommand = vscode.commands.registerCommand(
    "cursorSessionTracker.signOut",
    async () => {
      await extensionContext.secrets.delete("refreshToken");
      await extensionContext.secrets.delete("idToken");
      await extensionContext.globalState.update("userId", undefined);
      await extensionContext.globalState.update("userEmail", undefined);
      vscode.window.showInformationMessage(
        "Signed out of Cursor Session Tracker."
      );
      updateStatusBar();
    }
  );

  const setDisplayNameCommand = vscode.commands.registerCommand(
    "cursorSessionTracker.setDisplayName",
    async () => {
      const config =
        vscode.workspace.getConfiguration("cursorSessionTracker");
      const current = config.get<string>("displayName") || "";
      const name = await vscode.window.showInputBox({
        prompt: "Enter the name to display on your shareable session cards",
        placeHolder: "e.g. @username or your name",
        value: current,
      });
      if (name === undefined) return;
      const trimmed = name.trim();
      await config.update(
        "displayName",
        trimmed,
        vscode.ConfigurationTarget.Global
      );

      const idToken = await getStoredIdToken();
      if (idToken) {
        try {
          await callBackendJson(
            "PATCH",
            "/api/user/profile",
            { displayName: trimmed },
            idToken
          );
        } catch {
          // Sync failed, local setting still saved
        }
      }
      vscode.window.showInformationMessage(
        trimmed
          ? `Display name set to "${trimmed}".`
          : "Display name cleared."
      );
    }
  );

  const generateCardCommand = vscode.commands.registerCommand(
    "cursorSessionTracker.generateCard",
    async () => {
      const idToken = await getStoredIdToken();
      if (!idToken) {
        const action = await vscode.window.showWarningMessage(
          "Sign in to generate shareable session cards.",
          "Sign In"
        );
        if (action === "Sign In") {
          vscode.commands.executeCommand("cursorSessionTracker.signIn");
        }
        return;
      }

      const today = new Date().toISOString().split("T")[0];
      const dateInput = await vscode.window.showInputBox({
        prompt: "Enter date for the card (YYYY-MM-DD)",
        placeHolder: today,
        value: today,
        validateInput: (value) => {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
            return "Please use YYYY-MM-DD format";
          }
          return null;
        },
      });
      if (!dateInput) return;

      const cardData = await callBackendRaw(
        "GET",
        `/api/card?date=${dateInput}`,
        idToken
      );

      if (!cardData) {
        vscode.window.showErrorMessage(
          "Failed to generate card. Make sure you have sessions for that date."
        );
        return;
      }

      const ctx = getWorkspaceContextForCommand();
      if (!ctx) {
        vscode.window.showWarningMessage("No workspace open.");
        return;
      }

      const sessionsFolderPath = path.join(ctx.summaryDirectory, SUMMARY_FOLDER);
      const sessionsFolderUri = vscode.Uri.file(sessionsFolderPath);
      try {
        await vscode.workspace.fs.createDirectory(sessionsFolderUri);
      } catch {
        // Folder may exist
      }

      const cardFilename = `card-${dateInput}.png`;
      const cardPath = path.join(sessionsFolderPath, cardFilename);

      await vscode.workspace.fs.writeFile(
        vscode.Uri.file(cardPath),
        cardData
      );

      const action = await vscode.window.showInformationMessage(
        `Card saved to ${SUMMARY_FOLDER}/${cardFilename}`,
        "Open Card"
      );
      if (action === "Open Card") {
        await vscode.env.openExternal(vscode.Uri.file(cardPath));
      }
    }
  );

  const uriHandler = vscode.window.registerUriHandler({
    async handleUri(uri: vscode.Uri) {
      if (uri.path === "/auth-callback") {
        const params = new URLSearchParams(uri.query);
        const idToken = params.get("idToken");
        const refreshToken = params.get("refreshToken");
        const email = params.get("email");
        const userId = params.get("userId");

        if (refreshToken) {
          await extensionContext.secrets.store("refreshToken", refreshToken);
        }
        if (idToken) {
          await extensionContext.secrets.store("idToken", idToken);
        }
        if (userId) {
          await extensionContext.globalState.update("userId", userId);
        }
        if (email) {
          await extensionContext.globalState.update("userEmail", email);
        }

        // Create/update user profile in Firestore
        if (idToken && email) {
          try {
            await callBackendJson(
              "POST",
              "/api/user/register",
              { email },
              idToken
            );
          } catch {
            // Profile creation is non-critical, user is still signed in locally
          }
        }

        vscode.window.showInformationMessage(
          `Signed in as ${email || "user"}.`
        );
        updateStatusBar();
      }
    },
  });

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
        recordFileChange(doc.uri);
      }
    }
  );

  const changeListener = vscode.workspace.onDidChangeTextDocument(
    (event: vscode.TextDocumentChangeEvent) => {
      if (
        event.contentChanges.length > 0 &&
        event.document.uri.scheme === "file"
      ) {
        recordFileChange(event.document.uri);
      }
    }
  );

  const activeEditorListener = vscode.window.onDidChangeActiveTextEditor(
    (editor) => {
      if (editor && editor.document.uri.scheme === "file") {
        recordFileChange(editor.document.uri);
      }
    }
  );

  vscode.workspace.textDocuments.forEach((doc) => {
    if (doc.uri.scheme === "file") {
      recordFileChange(doc.uri);
    }
  });

  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  updateStatusBar();
  statusBarItem.show();

  validateBackendConnection();

  context.subscriptions.push(
    endSessionCommand,
    addNoteCommand,
    signInCommand,
    signOutCommand,
    setDisplayNameCommand,
    generateCardCommand,
    uriHandler,
    createListener,
    deleteListener,
    saveListener,
    openListener,
    changeListener,
    activeEditorListener,
    statusBarItem
  );
}

export function deactivate() {}

function updateStatusBar() {
  const email = extensionContext.globalState.get<string>("userEmail");
  if (email) {
    statusBarItem.text = "$(circle-filled) Session Tracker";
    statusBarItem.tooltip = `Signed in as ${email}. Click to end session.`;
    statusBarItem.command = "cursorSessionTracker.endSession";
  } else {
    statusBarItem.text = "$(circle-outline) Session Tracker";
    statusBarItem.tooltip = "Not signed in. Click to sign in for AI summaries.";
    statusBarItem.command = "cursorSessionTracker.signIn";
  }
}

// ============================================================================
// SESSION TRACKING
// ============================================================================

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
  ensureFileTracked(session, relativePath);
}

function recordFileEvent(uri: vscode.Uri, eventType: FileEventType) {
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
}

async function endSessionAndGenerateSummary() {
  const ctx = getWorkspaceContextForCommand();
  if (!ctx) {
    vscode.window.showWarningMessage(
      "No workspace is open. Session summary not generated."
    );
    return;
  }

  const { workspaceKey, summaryDirectory } = ctx;
  const session = sessionManager.endSession(
    workspaceKey,
    new Date().toISOString()
  );
  if (!session) {
    vscode.window.showWarningMessage(
      "No active session found for this workspace."
    );
    return;
  }

  session.gitDiff = await getGitDiff();
  session.branch = await getCurrentBranch();
  mergeDiffFilesIntoSession(session);

  session.filesTouched = session.filesTouched.filter(
    (f) => !isExcludedFile(f)
  );

  const analysis = await analyzeSession(session);
  let summary = renderSessionMemory(session, analysis);

  await extensionContext.workspaceState.update("sessionNotes", []);

  let usedAiSummary = false;
  const idToken = await getStoredIdToken();
  if (idToken) {
    try {
      const aiSummary = await callBackendSummarize(
        session,
        analysis,
        idToken
      );
      if (aiSummary) {
        summary = aiSummary;
        usedAiSummary = true;
      }
    } catch {
      // Backend unavailable, use local summary
    }
  } else {
    const action = await vscode.window.showInformationMessage(
      "Using local summary. Sign in for AI-powered summaries and shareable session cards.",
      "Sign In"
    );
    if (action === "Sign In") {
      vscode.commands.executeCommand("cursorSessionTracker.signIn");
    }
  }

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
      `Session summary written to ${SUMMARY_FOLDER}/${summaryFilename}`
    );

    const doc = await vscode.workspace.openTextDocument(
      vscode.Uri.file(summaryPath)
    );
    await vscode.window.showTextDocument(doc, { preview: false });

    if (usedAiSummary && idToken) {
      try {
        await fetchAndSaveCard(sessionsFolderPath, idToken);
      } catch {
        // Card generation is non-critical
      }
    }
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown error writing summary.";
    vscode.window.showErrorMessage(
      `Failed to write session summary: ${message}`
    );
  } finally {
    sessionManager.removeSession(workspaceKey);
    startWorkspaceSession();
  }
}

async function fetchAndSaveCard(
  sessionsFolderPath: string,
  idToken: string
): Promise<void> {
  const today = new Date().toISOString().split("T")[0];
  const lastCardDate =
    extensionContext.globalState.get<string>("lastCardDate");
  if (lastCardDate === today) return;

  const cardData = await callBackendRaw(
    "GET",
    `/api/card?date=${today}`,
    idToken
  );
  if (!cardData) return;

  const cardFilename = `card-${today}.png`;
  const cardPath = path.join(sessionsFolderPath, cardFilename);

  await vscode.workspace.fs.writeFile(
    vscode.Uri.file(cardPath),
    cardData
  );
  await extensionContext.globalState.update("lastCardDate", today);

  const action = await vscode.window.showInformationMessage(
    `Your daily session card is ready! Saved to ${SUMMARY_FOLDER}/${cardFilename}`,
    "Open Card"
  );
  if (action === "Open Card") {
    await vscode.env.openExternal(vscode.Uri.file(cardPath));
  }
}

// ============================================================================
// GIT OPERATIONS
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
    return stdout.trim() ? stdout : "";
  } catch {
    return null;
  }
}

async function getCurrentBranch(): Promise<string | null> {
  const cwd = getGitDiffCwd();
  if (!cwd) {
    return null;
  }
  try {
    const { stdout } = await execAsync("git branch --show-current", { cwd });
    return stdout.trim() || null;
  } catch {
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

  if (
    /\.test\.|\.spec\.|__tests__/i.test(basename) ||
    /test|spec/i.test(path.dirname(file).split(path.sep).pop() || "")
  ) {
    return "Test";
  }

  if (ext === ".jsx" || ext === ".tsx") {
    return "UI";
  }
  if ([".css", ".scss", ".sass", ".less", ".html", ".svelte", ".vue"].includes(ext)) {
    return "UI";
  }
  if (basename.includes("component") || basename.includes("page")) {
    return "UI";
  }

  if (
    [".json", ".yaml", ".yml", ".toml", ".ini", ".cfg", ".properties"].includes(ext)
  ) {
    return "Config";
  }
  if (ext === ".env" || basename.startsWith(".")) {
    return "Config";
  }

  if ([".md", ".txt", ".rst", ".adoc"].includes(ext)) {
    return "Docs";
  }

  if (
    [
      ".ts", ".js", ".mjs", ".cjs",
      ".py", ".go", ".rs", ".java", ".kt", ".rb",
      ".php", ".c", ".cpp", ".h", ".hpp",
      ".sol", ".move", ".cairo",
      ".swift", ".dart", ".scala",
    ].includes(ext)
  ) {
    return "Logic";
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
    Test: [],
    Other: [],
  };
  files.forEach((file) => {
    grouped[classifyFile(file)].push(file);
  });
  return grouped;
}

// ============================================================================
// SESSION ANALYSIS
// ============================================================================

async function analyzeSession(session: SessionData): Promise<SessionAnalysis> {
  const diffSummaries = parseGitDiffByFile(session.gitDiff);
  const { description } = detectWorkIntent(session);
  const rankedFiles = rankFilesByImportance(session, diffSummaries);
  const primaryFiles = rankedFiles.slice(0, 5);

  const delta = await buildSessionDelta(session, diffSummaries);
  const sessionMode = detectSessionMode(session);
  const confidence = computeSessionConfidence(session, diffSummaries);
  const frictionPoints = detectFrictionPoints(session, diffSummaries);
  const tomorrowChecklist = buildTomorrowChecklist(session, diffSummaries);
  const explicitlyDidntTouch = inferWhatIDidntTouch(session);

  const notes = extensionContext.workspaceState.get<string[]>(
    "sessionNotes",
    []
  );
  const userNote = notes.length > 0 ? notes.join("\n\n") : null;

  return {
    sessionMode,
    confidence,
    delta,
    frictionPoints,
    tomorrowChecklist,
    explicitlyDidntTouch,
    userNote,
    primaryFocusFiles: primaryFiles,
    intentDescription: description,
  };
}

// ============================================================================
// FILE CONTENT HELPERS
// ============================================================================

const MAX_FILE_CONTENT_LENGTH = 10000;
const MAX_AFFECTED_CONTENT_LENGTH = 5000;
const MAX_AFFECTED_FILES = 10;

async function readFileContent(
  workspacePath: string,
  relativePath: string
): Promise<string> {
  try {
    const fullPath = path.join(workspacePath, relativePath);
    const uri = vscode.Uri.file(fullPath);
    const bytes = await vscode.workspace.fs.readFile(uri);
    const content = Buffer.from(bytes).toString("utf8");
    return content.length > MAX_FILE_CONTENT_LENGTH
      ? content.slice(0, MAX_FILE_CONTENT_LENGTH) + "\n... (truncated)"
      : content;
  } catch {
    return "";
  }
}

async function findAffectedFiles(
  workspacePath: string,
  deletedFile: string
): Promise<{ file: string; content: string }[]> {
  const stem = path.basename(deletedFile, path.extname(deletedFile));
  try {
    const { stdout } = await execAsync(
      `git grep -l "${stem}" -- "*.ts" "*.js" "*.tsx" "*.jsx" "*.py" "*.go" "*.java" "*.rs" "*.rb" "*.php" "*.vue" "*.svelte" "*.sol"`,
      { cwd: workspacePath, maxBuffer: 5 * 1024 * 1024 }
    );
    const files = stdout
      .trim()
      .split("\n")
      .filter((f) => f && f !== deletedFile && !isExcludedFile(f));

    const results: { file: string; content: string }[] = [];
    for (const file of files.slice(0, MAX_AFFECTED_FILES)) {
      const content = await readFileContent(workspacePath, file);
      if (content) {
        results.push({
          file,
          content:
            content.length > MAX_AFFECTED_CONTENT_LENGTH
              ? content.slice(0, MAX_AFFECTED_CONTENT_LENGTH) + "\n... (truncated)"
              : content,
        });
      }
    }
    return results;
  } catch {
    return [];
  }
}

// ============================================================================
// DELTA BUILDER
// ============================================================================

async function buildSessionDelta(
  session: SessionData,
  diffSummaries: DiffFileSummary[]
): Promise<SessionDelta> {
  const createEvents = new Set(
    session.fileChangeEvents
      .filter((e) => e.eventType === "create")
      .map((e) => e.file)
  );
  const deleteEvents = new Set(
    session.fileChangeEvents
      .filter((e) => e.eventType === "delete")
      .map((e) => e.file)
  );

  const diffByFile = new Map(diffSummaries.map((d) => [d.file, d]));
  const deletedFileNames = Array.from(deleteEvents).filter(
    (f) => !createEvents.has(f)
  );

  const created: SessionDelta["created"] = [];
  const updated: SessionDelta["updated"] = [];

  for (const [file, diff] of diffByFile) {
    if (deleteEvents.has(file)) {
      continue;
    }
    if (createEvents.has(file)) {
      const fullContent = await readFileContent(session.workspacePath, file);
      created.push({ file, content: diff.addedLines, fullContent });
    } else {
      const fullContent = await readFileContent(session.workspacePath, file);
      updated.push({
        file,
        added: diff.added,
        removed: diff.removed,
        addedLines: diff.addedLines,
        removedLines: diff.removedLines,
        fullContent,
      });
    }
  }

  for (const file of createEvents) {
    if (!diffByFile.has(file) && !deleteEvents.has(file)) {
      const fullContent = await readFileContent(session.workspacePath, file);
      created.push({ file, content: [], fullContent });
    }
  }

  const deleted: SessionDelta["deleted"] = [];
  for (const file of deletedFileNames) {
    const affectedFiles = await findAffectedFiles(
      session.workspacePath,
      file
    );
    deleted.push({ file, affectedFiles });
  }

  return { created, updated, deleted };
}

// ============================================================================
// SESSION MODE DETECTION
// ============================================================================

function detectSessionMode(session: SessionData): string {
  const events = session.fileChangeEvents;
  if (events.length === 0) {
    return "Minimal Activity";
  }
  if (events.length <= 3) {
    return "Quick Sprint";
  }

  const timestamps = events.map((e) => Date.parse(e.timestamp));
  const start = Math.min(...timestamps);
  const end = Math.max(...timestamps);
  const duration = end - start;

  if (duration < 120000) {
    return "Quick Sprint";
  }

  const thirdDuration = duration / 3;

  function labelPhase(
    phaseEvents: SessionData["fileChangeEvents"]
  ): string {
    if (phaseEvents.length === 0) {
      return "Paused";
    }
    const saves = phaseEvents.filter((e) => e.eventType === "save").length;
    const creates = phaseEvents.filter(
      (e) => e.eventType === "create"
    ).length;
    const deletes = phaseEvents.filter(
      (e) => e.eventType === "delete"
    ).length;
    const uniqueFiles = new Set(phaseEvents.map((e) => e.file)).size;

    if (creates >= 2 && deletes >= 1) {
      return "Experimentation";
    }
    if (creates >= 3) {
      return "Scaffolding";
    }
    if (uniqueFiles >= 5 && saves <= uniqueFiles) {
      return "Exploration";
    }
    if (saves >= 5 && uniqueFiles <= 2) {
      return "Deep Focus";
    }
    if (saves >= 3) {
      return "Iteration";
    }
    return "Exploration";
  }

  const phases: string[] = [];
  for (let i = 0; i < 3; i++) {
    const phaseStart = start + thirdDuration * i;
    const phaseEnd = start + thirdDuration * (i + 1);
    const phaseEvents = events.filter((e) => {
      const t = Date.parse(e.timestamp);
      return t >= phaseStart && (i === 2 ? t <= phaseEnd : t < phaseEnd);
    });
    phases.push(labelPhase(phaseEvents));
  }

  const lastThirdCount = events.filter(
    (e) => Date.parse(e.timestamp) >= start + thirdDuration * 2
  ).length;
  const middleThirdCount = events.filter((e) => {
    const t = Date.parse(e.timestamp);
    return t >= start + thirdDuration && t < start + thirdDuration * 2;
  }).length;

  if (
    lastThirdCount > 0 &&
    middleThirdCount > 0 &&
    lastThirdCount < middleThirdCount / 2
  ) {
    phases[2] = "Winding Down";
  }

  const deduped: string[] = [phases[0]];
  for (let i = 1; i < phases.length; i++) {
    if (phases[i] !== phases[i - 1]) {
      deduped.push(phases[i]);
    }
  }

  return deduped.join(" \u2192 ");
}

// ============================================================================
// FRICTION LOG
// ============================================================================

function detectFrictionPoints(
  session: SessionData,
  _diffSummaries: DiffFileSummary[]
): string[] {
  const points: string[] = [];

  for (const [file, count] of Object.entries(session.saveCounts)) {
    if (count >= 5) {
      points.push(
        `Iterated heavily on \`${path.basename(file)}\` (${count} saves) \u2014 likely resolving uncertainty.`
      );
    }
  }

  const saveEvents = session.fileChangeEvents.filter(
    (e) => e.eventType === "save"
  );
  if (saveEvents.length >= 3) {
    const saveTimes = saveEvents
      .map((e) => Date.parse(e.timestamp))
      .sort((a, b) => a - b);
    for (let i = 0; i < saveTimes.length - 2; i++) {
      if (saveTimes[i + 2] - saveTimes[i] < 60000) {
        const burstFile = saveEvents[i].file;
        const msg = `Rapid save burst on \`${path.basename(burstFile)}\` \u2014 suggests trial-and-error.`;
        if (!points.includes(msg)) {
          points.push(msg);
        }
        break;
      }
    }
  }

  const createdFiles = new Set(
    session.fileChangeEvents
      .filter((e) => e.eventType === "create")
      .map((e) => e.file)
  );
  const deletedFiles = new Set(
    session.fileChangeEvents
      .filter((e) => e.eventType === "delete")
      .map((e) => e.file)
  );
  const cycled = [...createdFiles].filter((f) => deletedFiles.has(f));
  if (cycled.length > 0) {
    points.push(
      "Created and deleted files \u2014 suggests trying different approaches."
    );
  }

  const allTimestamps = session.fileChangeEvents
    .map((e) => Date.parse(e.timestamp))
    .sort((a, b) => a - b);
  for (let i = 1; i < allTimestamps.length; i++) {
    const gapMinutes = (allTimestamps[i] - allTimestamps[i - 1]) / 60000;
    if (gapMinutes > 10) {
      points.push(
        `${Math.round(gapMinutes)}-minute gap detected \u2014 possible debugging or deep thinking.`
      );
      break;
    }
  }

  if (points.length === 0) {
    points.push("No significant friction detected \u2014 smooth session.");
  }

  return points;
}

// ============================================================================
// TOMORROW CHECKLIST
// ============================================================================

function buildTomorrowChecklist(
  session: SessionData,
  diffSummaries: DiffFileSummary[]
): string[] {
  const checklist: string[] = [];

  if (session.fileChangeEvents.length > 0) {
    const lastEvent =
      session.fileChangeEvents[session.fileChangeEvents.length - 1];
    checklist.push(
      `Reopen \`${lastEvent.file}\` \u2014 last edited file.`
    );
  }

  const filesWithDebugLogs = diffSummaries
    .filter((d) =>
      d.addedLines.some((line) =>
        /console\.log|console\.debug|print\(|System\.out\.print/i.test(line)
      )
    )
    .map((d) => path.basename(d.file));
  if (filesWithDebugLogs.length > 0) {
    checklist.push(
      `Remove debug statements from: ${filesWithDebugLogs.join(", ")}.`
    );
  }

  const filesWithTodos = diffSummaries
    .filter((d) =>
      d.addedLines.some((line) => /TODO|FIXME|HACK|XXX/i.test(line))
    )
    .map((d) => path.basename(d.file));
  if (filesWithTodos.length > 0) {
    checklist.push(
      `Address TODO/FIXME markers in: ${filesWithTodos.join(", ")}.`
    );
  }

  const totalChanges = diffSummaries.reduce(
    (sum, d) => sum + d.added + d.removed,
    0
  );
  if (totalChanges > 200) {
    checklist.push(
      `Review ${totalChanges} uncommitted line changes \u2014 consider committing or splitting.`
    );
  }

  if (checklist.length === 0) {
    checklist.push(
      "Pick up where you left off \u2014 session looks clean."
    );
  }

  return checklist;
}

// ============================================================================
// WHAT I DIDN'T TOUCH
// ============================================================================

function inferWhatIDidntTouch(session: SessionData): string[] {
  const untouched: string[] = [];
  const categories = groupFilesByCategory(session.filesTouched);

  if (categories.Test.length === 0) {
    untouched.push("Tests were not modified.");
  }
  if (categories.Docs.length === 0) {
    untouched.push("Documentation was not updated.");
  }
  if (categories.Config.length === 0) {
    untouched.push("Configuration files were not changed.");
  }
  if (categories.UI.length === 0) {
    untouched.push("UI/styling was not modified.");
  }

  if (untouched.length === 0) {
    untouched.push("Session covered all major areas.");
  }

  return untouched;
}

// ============================================================================
// SESSION CONFIDENCE
// ============================================================================

function computeSessionConfidence(
  session: SessionData,
  diffSummaries: DiffFileSummary[]
): { level: ConfidenceLevel; explanation: string } {
  let score = 50;
  const reasons: string[] = [];

  const todoCount = diffSummaries.reduce(
    (sum, d) =>
      sum + d.addedLines.filter((l) => /TODO|FIXME/i.test(l)).length,
    0
  );
  if (todoCount > 0) {
    score -= todoCount * 5;
    reasons.push(`${todoCount} TODO/FIXME markers`);
  }

  const debugCount = diffSummaries.reduce(
    (sum, d) =>
      sum + d.addedLines.filter((l) => /console\.log/i.test(l)).length,
    0
  );
  if (debugCount > 0) {
    score -= debugCount * 3;
    reasons.push(`${debugCount} debug statements`);
  }

  const totalChanges = diffSummaries.reduce(
    (sum, d) => sum + d.added + d.removed,
    0
  );
  if (totalChanges > 500) {
    score -= 15;
    reasons.push("very large uncommitted diff");
  } else if (totalChanges > 200) {
    score -= 8;
    reasons.push("large uncommitted diff");
  }

  const maxSaves = Math.max(...Object.values(session.saveCounts), 0);
  if (maxSaves >= 8) {
    score -= 10;
    reasons.push(`high iteration (${maxSaves} saves on one file)`);
  }

  const createdSet = new Set(
    session.fileChangeEvents
      .filter((e) => e.eventType === "create")
      .map((e) => e.file)
  );
  const deletedSet = new Set(
    session.fileChangeEvents
      .filter((e) => e.eventType === "delete")
      .map((e) => e.file)
  );
  if ([...createdSet].some((f) => deletedSet.has(f))) {
    score -= 10;
    reasons.push("files created and deleted");
  }

  if (todoCount === 0 && debugCount === 0) {
    score += 15;
  }
  if (totalChanges > 0 && totalChanges <= 100) {
    score += 10;
  }

  const level: ConfidenceLevel =
    score >= 60 ? "High" : score >= 35 ? "Medium" : "Low";
  const explanation =
    reasons.length > 0
      ? reasons.join("; ") + "."
      : "Clean session with no unfinished signals.";

  return { level, explanation };
}

// ============================================================================
// WORK INTENT (used internally for descriptions)
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
    const dominant = Object.entries(saveCounts).sort(
      (a, b) => b[1] - a[1]
    )[0];
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

// ============================================================================
// SUMMARY RENDERING
// ============================================================================

function renderSessionMemory(
  session: SessionData,
  analysis: SessionAnalysis
): string {
  const s: string[] = [];

  s.push("# Session Memory");
  s.push("");
  s.push(`**Session Mode:** ${analysis.sessionMode}`);
  s.push("");
  s.push(
    `**Session Confidence:** ${analysis.confidence.level} \u2014 ${analysis.confidence.explanation}`
  );
  s.push("");
  s.push(`**Branch:** \`${session.branch || "unknown"}\``);
  s.push("");
  s.push(
    `**Duration:** ${formatDuration(session.startTime, session.endTime)}`
  );
  s.push("");
  s.push(`**Intent:** ${analysis.intentDescription}`);
  s.push("");

  // Files Changed
  s.push("---");
  s.push("");
  s.push("## Files Changed");
  s.push("");

  if (analysis.delta.created.length > 0) {
    s.push("### Created");
    s.push("");
    analysis.delta.created.forEach((f) => {
      s.push(`- **${f.file}**`);
      if (f.content.length > 0) {
        s.push("  ```");
        f.content.slice(0, 10).forEach((line) => s.push(`  ${line}`));
        if (f.content.length > 10) {
          s.push(`  ... (+${f.content.length - 10} more lines)`);
        }
        s.push("  ```");
      }
    });
    s.push("");
  }

  if (analysis.delta.updated.length > 0) {
    s.push("### Updated");
    s.push("");
    analysis.delta.updated.forEach((f) => {
      s.push(`- **${f.file}** \u2014 +${f.added} / -${f.removed}`);
      if (f.addedLines.length > 0) {
        s.push("  Added:");
        s.push("  ```");
        f.addedLines
          .slice(0, 5)
          .forEach((line) => s.push(`  + ${line}`));
        if (f.addedLines.length > 5) {
          s.push(`  ... (+${f.addedLines.length - 5} more)`);
        }
        s.push("  ```");
      }
      if (f.removedLines.length > 0) {
        s.push("  Removed:");
        s.push("  ```");
        f.removedLines
          .slice(0, 5)
          .forEach((line) => s.push(`  - ${line}`));
        if (f.removedLines.length > 5) {
          s.push(`  ... (+${f.removedLines.length - 5} more)`);
        }
        s.push("  ```");
      }
    });
    s.push("");
  }

  if (analysis.delta.deleted.length > 0) {
    s.push("### Deleted");
    s.push("");
    analysis.delta.deleted.forEach((d) => {
      s.push(`- ~~${d.file}~~`);
      if (d.affectedFiles.length > 0) {
        s.push(
          `  - Affected: ${d.affectedFiles.map((a) => a.file).join(", ")}`
        );
      }
    });
    s.push("");
  }

  if (
    analysis.delta.created.length === 0 &&
    analysis.delta.updated.length === 0 &&
    analysis.delta.deleted.length === 0
  ) {
    s.push("No file changes detected in diff.");
    s.push("");
  }

  // Primary Focus Files
  if (analysis.primaryFocusFiles.length > 0) {
    s.push("### Primary Focus");
    s.push("");
    analysis.primaryFocusFiles.forEach((f) => {
      s.push(`- **${f.file}** \u2014 ${f.reason}`);
    });
    s.push("");
  }

  // Where I Got Stuck
  s.push("---");
  s.push("");
  s.push("## Where I Got Stuck");
  s.push("");
  analysis.frictionPoints.forEach((p) => s.push(`- ${p}`));
  s.push("");

  // Tomorrow, First 10 Minutes
  s.push("---");
  s.push("");
  s.push("## Tomorrow, First 10 Minutes");
  s.push("");
  analysis.tomorrowChecklist.forEach((item, i) =>
    s.push(`${i + 1}. ${item}`)
  );
  s.push("");

  // What I Explicitly Didn't Touch
  s.push("---");
  s.push("");
  s.push("## What I Explicitly Didn't Touch");
  s.push("");
  analysis.explicitlyDidntTouch.forEach((u) => s.push(`- ${u}`));
  s.push("");

  // My Note
  s.push("---");
  s.push("");
  s.push("## My Note");
  s.push("");
  if (analysis.userNote) {
    s.push(analysis.userNote);
  } else {
    s.push(
      "*(No note added. Use 'Add Session Note' command during your session.)*"
    );
  }
  s.push("");

  return s.join("\n");
}

function formatDuration(startTime: string, endTime: string | null): string {
  const start = Date.parse(startTime);
  const end = endTime ? Date.parse(endTime) : Date.now();
  const mins = Math.round((end - start) / 60000);
  if (mins < 1) {
    return "< 1 minute";
  }
  if (mins < 60) {
    return `${mins} minutes`;
  }
  const hrs = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return `${hrs}h ${remainMins}m`;
}

// ============================================================================
// AUTH & BACKEND COMMUNICATION
// ============================================================================

async function validateBackendConnection(): Promise<void> {
  const config = vscode.workspace.getConfiguration("cursorSessionTracker");
  const backendUrl =
    config.get<string>("backendUrl") || "http://localhost:3000";

  try {
    const parsed = new URL(`${backendUrl}/api/config`);
    const isHttps = parsed.protocol === "https:";
    const lib = isHttps ? https : http;

    await new Promise<void>((resolve) => {
      const req = lib.get(
        {
          hostname: parsed.hostname,
          port: parsed.port || (isHttps ? "443" : "80"),
          path: parsed.pathname,
          timeout: 5000,
        },
        (res) => {
          let data = "";
          res.on("data", (chunk: string) => (data += chunk));
          res.on("end", async () => {
            try {
              const json = JSON.parse(data);
              if (json.status === "ok") {
                statusBarItem.tooltip += ` | Backend v${json.version || "?"}`;

                if (json.firebaseApiKey) {
                  const currentKey = config.get<string>("firebaseApiKey");
                  if (!currentKey) {
                    await config.update(
                      "firebaseApiKey",
                      json.firebaseApiKey,
                      vscode.ConfigurationTarget.Global
                    );
                  }
                }

                const email =
                  extensionContext.globalState.get<string>("userEmail");
                const hasSeenPrompt =
                  extensionContext.globalState.get<boolean>(
                    "hasSeenSignInPrompt"
                  );
                if (!email && !hasSeenPrompt) {
                  await extensionContext.globalState.update(
                    "hasSeenSignInPrompt",
                    true
                  );
                  const action = await vscode.window.showInformationMessage(
                    "Sign in to enable AI-powered session summaries and shareable cards.",
                    "Sign In"
                  );
                  if (action === "Sign In") {
                    vscode.commands.executeCommand(
                      "cursorSessionTracker.signIn"
                    );
                  }
                }
              }
            } catch {
              // non-JSON response
            }
            resolve();
          });
        }
      );
      req.on("error", () => resolve());
      req.on("timeout", () => {
        req.destroy();
        resolve();
      });
    });
  } catch {
    // Backend unreachable — extension works offline
  }
}

async function getStoredIdToken(): Promise<string | null> {
  try {
    const refreshToken = await extensionContext.secrets.get("refreshToken");
    if (!refreshToken) {
      return null;
    }

    const config =
      vscode.workspace.getConfiguration("cursorSessionTracker");
    const apiKey = config.get<string>("firebaseApiKey");
    if (!apiKey) {
      return null;
    }

    return await refreshFirebaseIdToken(refreshToken, apiKey);
  } catch {
    return null;
  }
}

function refreshFirebaseIdToken(
  refreshToken: string,
  apiKey: string
): Promise<string | null> {
  return new Promise((resolve) => {
    const payload = JSON.stringify({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });

    const options: https.RequestOptions = {
      hostname: "securetoken.googleapis.com",
      port: 443,
      path: `/v1/token?key=${apiKey}`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
      },
      timeout: 10000,
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk: string) => (data += chunk));
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          resolve(json.id_token || null);
        } catch {
          resolve(null);
        }
      });
    });

    req.on("error", () => resolve(null));
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
    req.write(payload);
    req.end();
  });
}

function callBackendSummarize(
  session: SessionData,
  analysis: SessionAnalysis,
  idToken: string
): Promise<string | null> {
  return new Promise((resolve) => {
    const config =
      vscode.workspace.getConfiguration("cursorSessionTracker");
    const backendUrl =
      config.get<string>("backendUrl") || "http://localhost:3000";

    const payload = JSON.stringify({
      session: {
        branch: session.branch,
        startTime: session.startTime,
        endTime: session.endTime,
        filesTouched: session.filesTouched,
        saveCounts: session.saveCounts,
        fileChangeEvents: session.fileChangeEvents,
        gitDiff: session.gitDiff,
      },
      analysis,
    });

    const parsed = new URL(`${backendUrl}/api/session/summarize`);
    const isHttps = parsed.protocol === "https:";
    const lib = isHttps ? https : http;

    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? "443" : "80"),
      path: parsed.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
        "Content-Length": String(Buffer.byteLength(payload)),
      },
      timeout: 30000,
    };

    const req = lib.request(options, (res) => {
      let data = "";
      res.on("data", (chunk: string) => (data += chunk));
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          resolve(json.markdown || null);
        } catch {
          resolve(null);
        }
      });
    });

    req.on("error", () => resolve(null));
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
    req.write(payload);
    req.end();
  });
}

function callBackendJson(
  method: string,
  apiPath: string,
  body: Record<string, unknown> | null,
  idToken: string
): Promise<Record<string, unknown> | null> {
  return new Promise((resolve) => {
    const config =
      vscode.workspace.getConfiguration("cursorSessionTracker");
    const backendUrl =
      config.get<string>("backendUrl") || "http://localhost:3000";

    const payload = body ? JSON.stringify(body) : "";
    const parsed = new URL(`${backendUrl}${apiPath}`);
    const isHttps = parsed.protocol === "https:";
    const lib = isHttps ? https : http;

    const options: http.RequestOptions = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? "443" : "80"),
      path: parsed.pathname + parsed.search,
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
        ...(payload ? { "Content-Length": String(Buffer.byteLength(payload)) } : {}),
      },
      timeout: 15000,
    };

    const req = lib.request(options, (res) => {
      let data = "";
      res.on("data", (chunk: string) => (data += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(null);
        }
      });
    });

    req.on("error", () => resolve(null));
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
    if (payload) req.write(payload);
    req.end();
  });
}

function callBackendRaw(
  method: string,
  apiPath: string,
  idToken: string
): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const config =
      vscode.workspace.getConfiguration("cursorSessionTracker");
    const backendUrl =
      config.get<string>("backendUrl") || "http://localhost:3000";

    const parsed = new URL(`${backendUrl}${apiPath}`);
    const isHttps = parsed.protocol === "https:";
    const lib = isHttps ? https : http;

    const options: http.RequestOptions = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? "443" : "80"),
      path: parsed.pathname + parsed.search,
      method,
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
      timeout: 15000,
    };

    const req = lib.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve(Buffer.concat(chunks));
        } else {
          resolve(null);
        }
      });
    });

    req.on("error", () => resolve(null));
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
    req.end();
  });
}

// ============================================================================
// WORKSPACE UTILITIES
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
