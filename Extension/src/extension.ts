import * as vscode from "vscode";
import * as path from "path";
import { FileEventType } from "./types";
import { SUMMARY_FOLDER, isExcludedFile } from "./constants";
import { SessionManager } from "./session-manager";
import { getGitDiff, getCurrentBranch, parseGitDiffByFile } from "./git";
import { analyzeSession, summarizeCodeChanges } from "./analysis";
import { renderSessionMemory } from "./renderer";
import { runSafetyCheck, showSafetyNotifications } from "./safety-monitor";
import { SessionStore } from "./session-store";
import { getSessionMemory } from "./memory";
import { generateProjectContext } from "./continuity";
import {
  validateBackendConnection,
  getStoredIdToken,
  callBackendSummarize,
  callBackendContext,
  callBackendJson,
  callBackendRaw,
} from "./auth";
import {
  getWorkspaceKeyForUri,
  getWorkspacePathForUri,
  getRelativePathForUri,
  getPrimaryWorkspaceKey,
  getPrimaryWorkspacePath,
  getWorkspaceContextForCommand,
} from "./workspace";

const CONFIG_NAMESPACE = "worktrace";

let extensionContext: vscode.ExtensionContext;
let statusBarItem: vscode.StatusBarItem;
const sessionManager = new SessionManager();

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
// EXTENSION LIFECYCLE
// ============================================================================

export function activate(context: vscode.ExtensionContext) {
  extensionContext = context;

  startWorkspaceSession();

  const endSessionCommand = vscode.commands.registerCommand(
    "worktrace.endSession",
    async () => {
      await endSessionAndGenerateSummary();
    }
  );

  const addNoteCommand = vscode.commands.registerCommand(
    "worktrace.addSessionNote",
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
    "worktrace.signIn",
    async () => {
      const config = vscode.workspace.getConfiguration(CONFIG_NAMESPACE);
      const backendUrl =
        config.get<string>("backendUrl") || "http://localhost:3000";
      const scheme = vscode.env.uriScheme;
      const authUrl = `${backendUrl}/api/auth/google?scheme=${encodeURIComponent(scheme)}`;

      const platform = process.platform;
      const { execFile } = require("child_process");

      if (platform === "darwin") {
        execFile("open", [authUrl]);
      } else if (platform === "win32") {
        execFile("cmd", ["/c", "start", "", authUrl]);
      } else {
        execFile("xdg-open", [authUrl]);
      }
    }
  );

  const signOutCommand = vscode.commands.registerCommand(
    "worktrace.signOut",
    async () => {
      await extensionContext.secrets.delete("refreshToken");
      await extensionContext.secrets.delete("idToken");
      await extensionContext.globalState.update("userId", undefined);
      await extensionContext.globalState.update("userEmail", undefined);
      vscode.window.showInformationMessage("Signed out of Worktrace.");
      updateStatusBar();
    }
  );

  const setDisplayNameCommand = vscode.commands.registerCommand(
    "worktrace.setDisplayName",
    async () => {
      const config = vscode.workspace.getConfiguration(CONFIG_NAMESPACE);
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

      const idToken = await getStoredIdToken(extensionContext);
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
    "worktrace.generateCard",
    async () => {
      const idToken = await getStoredIdToken(extensionContext);
      if (!idToken) {
        const action = await vscode.window.showWarningMessage(
          "Sign in to generate shareable session cards.",
          "Sign In"
        );
        if (action === "Sign In") {
          vscode.commands.executeCommand("worktrace.signIn");
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

  const runSafetyCheckCommand = vscode.commands.registerCommand(
    "worktrace.runSafetyCheck",
    async () => {
      const diff = await getGitDiff();
      if (!diff) {
        vscode.window.showInformationMessage("Worktrace Safety: No uncommitted changes to scan.");
        return;
      }
      const diffSummaries = parseGitDiffByFile(diff);
      const warnings = runSafetyCheck(diffSummaries);
      if (warnings.length === 0) {
        vscode.window.showInformationMessage("Worktrace Safety: No issues found. Code looks clean.");
      } else {
        showSafetyNotifications(warnings);
      }
    }
  );

  const showContextCommand = vscode.commands.registerCommand(
    "worktrace.showContext",
    async () => {
      const ctx = getWorkspaceContextForCommand();
      if (!ctx) {
        vscode.window.showWarningMessage("No workspace open.");
        return;
      }

      const contextPath = path.join(
        ctx.summaryDirectory,
        SUMMARY_FOLDER,
        "context.md"
      );

      try {
        const contextBytes = await vscode.workspace.fs.readFile(
          vscode.Uri.file(contextPath)
        );
        const content = Buffer.from(contextBytes).toString("utf8");

        const doc = await vscode.workspace.openTextDocument({
          content,
          language: "markdown",
        });
        await vscode.window.showTextDocument(doc, { preview: true });

        await vscode.env.clipboard.writeText(content);
        vscode.window.showInformationMessage(
          "Project context copied to clipboard. Paste into any AI tool."
        );
      } catch {
        vscode.window.showInformationMessage(
          "No project context yet. End a session first to generate context."
        );
      }
    }
  );

  const searchHistoryCommand = vscode.commands.registerCommand(
    "worktrace.searchHistory",
    async () => {
      const ctx = getWorkspaceContextForCommand();
      if (!ctx) {
        vscode.window.showWarningMessage("No workspace open.");
        return;
      }

      const store = new SessionStore(ctx.summaryDirectory);
      const sessions = await store.loadSessions();

      if (sessions.length === 0) {
        vscode.window.showInformationMessage("No session history yet.");
        return;
      }

      const query = await vscode.window.showInputBox({
        prompt: "Search sessions by file name, branch, or keyword",
        placeHolder: "e.g. auth.ts, main, refactor",
      });

      if (!query || !query.trim()) return;

      const lower = query.trim().toLowerCase();
      const matches = sessions.filter((s) => {
        if (s.branch && s.branch.toLowerCase().includes(lower)) return true;
        if (s.filesTouched.some((f) => f.toLowerCase().includes(lower))) return true;
        if (s.intentDescription.toLowerCase().includes(lower)) return true;
        if (s.sessionMode.toLowerCase().includes(lower)) return true;
        return false;
      });

      if (matches.length === 0) {
        vscode.window.showInformationMessage(`No sessions found matching "${query}".`);
        return;
      }

      const items = matches.slice(-20).reverse().map((s) => {
        const date = new Date(s.startTime).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
        return {
          label: `${date} — ${s.sessionMode}`,
          description: s.branch ? `on ${s.branch}` : "",
          detail: s.intentDescription,
          session: s,
        };
      });

      const picked = await vscode.window.showQuickPick(items, {
        placeHolder: `${matches.length} session(s) found`,
      });

      if (picked) {
        const s = picked.session;
        const lines = [
          `# Session: ${s.sessionMode}`,
          "",
          `- **Date:** ${new Date(s.startTime).toLocaleString()}`,
          `- **Branch:** \`${s.branch || "unknown"}\``,
          `- **Confidence:** ${s.confidence}`,
          `- **Intent:** ${s.intentDescription}`,
          `- **Files:** ${s.filesTouched.length}`,
          "",
          "## Files Touched",
          "",
          ...s.filesTouched.map((f) => `- \`${f}\``),
          "",
          "## Friction Points",
          "",
          ...s.frictionPoints.map((p) => `- ${p}`),
          "",
          "## Tomorrow Checklist",
          "",
          ...s.tomorrowChecklist.map((t, i) => `${i + 1}. ${t}`),
        ];

        const doc = await vscode.workspace.openTextDocument({
          content: lines.join("\n"),
          language: "markdown",
        });
        await vscode.window.showTextDocument(doc, { preview: true });
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

        if (idToken && email) {
          try {
            await callBackendJson(
              "POST",
              "/api/user/register",
              { email },
              idToken
            );
          } catch {
            // Profile creation is non-critical
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

  validateBackendConnection(extensionContext, statusBarItem);

  context.subscriptions.push(
    endSessionCommand,
    addNoteCommand,
    signInCommand,
    signOutCommand,
    setDisplayNameCommand,
    generateCardCommand,
    runSafetyCheckCommand,
    showContextCommand,
    searchHistoryCommand,
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

// ============================================================================
// STATUS BAR
// ============================================================================

function updateStatusBar() {
  const email = extensionContext.globalState.get<string>("userEmail");
  if (email) {
    statusBarItem.text = "$(circle-filled) Worktrace";
    statusBarItem.tooltip = `Signed in as ${email}. Click to end session.`;
    statusBarItem.command = "worktrace.endSession";
  } else {
    statusBarItem.text = "$(circle-outline) Worktrace";
    statusBarItem.tooltip = "Not signed in. Click to sign in for AI summaries.";
    statusBarItem.command = "worktrace.signIn";
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
      showWhereILeftOff(workspacePath);
    }
    return;
  }
  const folders = vscode.workspace.workspaceFolders ?? [];
  folders.forEach((folder) => {
    sessionManager.ensureSession(folder.uri.fsPath, folder.uri.fsPath);
  });
  // Show context from first folder
  if (folders.length > 0) {
    showWhereILeftOff(folders[0].uri.fsPath);
  }
}

async function showWhereILeftOff(workspacePath: string): Promise<void> {
  try {
    const store = new SessionStore(workspacePath);
    const lastSession = await store.getLastSession();
    if (!lastSession) return;

    const endDate = new Date(lastSession.endTime);
    const now = new Date();
    const hoursAgo = Math.round(
      (now.getTime() - endDate.getTime()) / (1000 * 60 * 60)
    );

    // Only show if last session was within 48 hours
    if (hoursAgo > 48) return;

    const timeLabel =
      hoursAgo < 1
        ? "just now"
        : hoursAgo < 24
        ? `${hoursAgo}h ago`
        : `${Math.round(hoursAgo / 24)}d ago`;

    const action = await vscode.window.showInformationMessage(
      `Worktrace: Last session (${timeLabel}) — ${lastSession.intentDescription}`,
      "Show Context",
      "Dismiss"
    );

    if (action === "Show Context") {
      vscode.commands.executeCommand("worktrace.showContext");
    }
  } catch {
    // Non-critical
  }
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

  const analysis = await analyzeSession(session, extensionContext);

  // Run safety check
  const diffSummaries = parseGitDiffByFile(session.gitDiff);
  const safetyWarnings = runSafetyCheck(diffSummaries);
  if (safetyWarnings.length > 0) {
    showSafetyNotifications(safetyWarnings);
  }

  // Persist session to .worktrace/ store
  const store = new SessionStore(summaryDirectory);
  try {
    await store.saveSession(session, analysis, safetyWarnings);
  } catch {
    // Non-critical — session still gets a summary
  }

  // Load cross-session memory
  const memory = await getSessionMemory(store);
  const projectName = path.basename(summaryDirectory);
  const codeChanges = summarizeCodeChanges(analysis.delta);

  const sessionsFolderPath = path.join(summaryDirectory, SUMMARY_FOLDER);
  const sessionsFolderUri = vscode.Uri.file(sessionsFolderPath);

  try {
    await vscode.workspace.fs.createDirectory(sessionsFolderUri);
  } catch {
    // Folder may already exist
  }

  // Read previous context if it exists
  const contextPath = path.join(sessionsFolderPath, "context.md");
  let previousContext: string | null = null;
  try {
    const contextBytes = await vscode.workspace.fs.readFile(
      vscode.Uri.file(contextPath)
    );
    previousContext = Buffer.from(contextBytes).toString("utf8");
  } catch {
    // No previous context — first session
  }

  // Generate local summary (no context block embedded — context is separate)
  let summary = renderSessionMemory({
    session,
    analysis,
    safetyWarnings,
    codeChanges,
    memory,
  });

  // Generate local context (deterministic fallback)
  let context = generateProjectContext(
    memory,
    session,
    analysis,
    projectName,
    previousContext
  );

  await extensionContext.workspaceState.update("sessionNotes", []);

  let usedAiSummary = false;
  const idToken = await getStoredIdToken(extensionContext);
  if (idToken) {
    try {
      // Fire both summary and context generation in parallel
      const [aiSummary, aiContext] = await Promise.all([
        callBackendSummarize(session, analysis, idToken),
        callBackendContext(session, analysis, previousContext, idToken),
      ]);

      if (aiSummary) {
        summary = aiSummary;
        usedAiSummary = true;
      }
      if (aiContext) {
        context = aiContext;
      }
    } catch {
      // Backend unavailable, use local summary + context
    }
  } else {
    const action = await vscode.window.showInformationMessage(
      "Using local summary. Sign in for AI-powered summaries and shareable session cards.",
      "Sign In"
    );
    if (action === "Sign In") {
      vscode.commands.executeCommand("worktrace.signIn");
    }
  }

  const summaryFilename = generateSummaryFilename();
  const summaryPath = path.join(sessionsFolderPath, summaryFilename);

  try {
    // Write session summary and context file in parallel
    await Promise.all([
      vscode.workspace.fs.writeFile(
        vscode.Uri.file(summaryPath),
        Buffer.from(summary, "utf8")
      ),
      vscode.workspace.fs.writeFile(
        vscode.Uri.file(contextPath),
        Buffer.from(context, "utf8")
      ),
    ]);

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
// HELPERS
// ============================================================================

function ensureFileTracked(session: { filesTouched: string[] }, relativePath: string) {
  if (!session.filesTouched.includes(relativePath)) {
    session.filesTouched.push(relativePath);
  }
}

function mergeDiffFilesIntoSession(session: { gitDiff: string | null; filesTouched: string[] }) {
  const diffSummaries = parseGitDiffByFile(session.gitDiff);
  diffSummaries.forEach((summary) => {
    if (!isExcludedFile(summary.file)) {
      if (!session.filesTouched.includes(summary.file)) {
        session.filesTouched.push(summary.file);
      }
    }
  });
}
