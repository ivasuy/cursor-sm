import * as vscode from "vscode";
import * as path from "path";
import {
  ensureAgent,
  agentGet,
  agentPost,
  agentPatch,
  agentPostFireAndForget,
} from "./agent-client";
import {
  SessionStartResponse,
  SessionEndResponse,
  SessionStatus,
  AuthStatus,
  AuthLoginResponse,
  AuthCallbackResponse,
  HistoryResponse,
  ContextResponse,
  SafetyCheckResponse,
  CardResponse,
} from "./types";
import { getPrimaryWorkspacePath, getWorkspaceContextForCommand } from "./workspace";

let statusBarItem: vscode.StatusBarItem;

export async function activate(context: vscode.ExtensionContext) {
  try {
    await ensureAgent();
  } catch (err) {
    vscode.window.showErrorMessage(
      `Failed to start Worktrace agent: ${(err as Error).message}`
    );
    return;
  }

  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);
  await updateStatusBar();

  const workspacePath = getPrimaryWorkspacePath();
  if (workspacePath) {
    try {
      const status = await agentGet<SessionStatus>(
        `/session/status?workspace=${encodeURIComponent(workspacePath)}`
      );
      if (!status.active) {
        await agentPost<SessionStartResponse>("/session/start", { workspacePath });
      }
    } catch {}

    showWhereILeftOff(workspacePath);
  }

  context.subscriptions.push(
    vscode.commands.registerCommand("worktrace.endSession", () => endSession()),
    vscode.commands.registerCommand("worktrace.addSessionNote", () => addNote()),
    vscode.commands.registerCommand("worktrace.signIn", () => signIn()),
    vscode.commands.registerCommand("worktrace.signOut", () => signOut()),
    vscode.commands.registerCommand("worktrace.setDisplayName", () => setDisplayName()),
    vscode.commands.registerCommand("worktrace.generateCard", () => generateCard()),
    vscode.commands.registerCommand("worktrace.runSafetyCheck", () => runSafetyCheck()),
    vscode.commands.registerCommand("worktrace.showContext", () => showContext()),
    vscode.commands.registerCommand("worktrace.searchHistory", () => searchHistory())
  );

  context.subscriptions.push(
    vscode.window.registerUriHandler({
      async handleUri(uri: vscode.Uri) {
        if (uri.path === "/auth-callback") {
          const params = new URLSearchParams(uri.query);
          const idToken = params.get("idToken");
          const refreshToken = params.get("refreshToken");
          const email = params.get("email");
          const userId = params.get("userId");

          if (!idToken || !refreshToken || !email || !userId) {
            vscode.window.showErrorMessage("Incomplete auth callback.");
            return;
          }

          try {
            await agentPost<AuthCallbackResponse>("/auth/callback", {
              idToken, refreshToken, email, userId,
            });
            vscode.window.showInformationMessage(`Signed in as ${email}.`);
            await updateStatusBar();
          } catch (err) {
            vscode.window.showErrorMessage(`Sign-in failed: ${(err as Error).message}`);
          }
        }
      },
    })
  );
}

export function deactivate() {
  const workspacePath = getPrimaryWorkspacePath();
  if (workspacePath) {
    agentPostFireAndForget("/session/end", { workspacePath });
  }
}

async function updateStatusBar(): Promise<void> {
  try {
    const auth = await agentGet<AuthStatus>("/auth/status");
    if (auth.authenticated && auth.email) {
      statusBarItem.text = "$(circle-filled) Worktrace";
      statusBarItem.tooltip = `Signed in as ${auth.email}. Click to end session.`;
      statusBarItem.command = "worktrace.endSession";
    } else {
      statusBarItem.text = "$(circle-outline) Worktrace";
      statusBarItem.tooltip = "Not signed in. Click to sign in for AI summaries.";
      statusBarItem.command = "worktrace.signIn";
    }
  } catch {
    statusBarItem.text = "$(circle-outline) Worktrace";
    statusBarItem.tooltip = "Agent not connected.";
    statusBarItem.command = "worktrace.signIn";
  }
}

async function showWhereILeftOff(workspacePath: string): Promise<void> {
  try {
    const history = await agentGet<HistoryResponse>(
      `/history?workspace=${encodeURIComponent(workspacePath)}&limit=1`
    );
    if (!history.sessions || history.sessions.length === 0) return;

    const last = history.sessions[0];
    const endDate = new Date(last.endTime);
    const hoursAgo = Math.round((Date.now() - endDate.getTime()) / (1000 * 60 * 60));
    if (hoursAgo > 48) return;

    const timeLabel =
      hoursAgo < 1 ? "just now" : hoursAgo < 24 ? `${hoursAgo}h ago` : `${Math.round(hoursAgo / 24)}d ago`;

    const action = await vscode.window.showInformationMessage(
      `Worktrace: Last session (${timeLabel}) — ${last.intentDescription}`,
      "Show Context", "Dismiss"
    );
    if (action === "Show Context") {
      vscode.commands.executeCommand("worktrace.showContext");
    }
  } catch {}
}

async function endSession(): Promise<void> {
  const ctx = getWorkspaceContextForCommand();
  if (!ctx) { vscode.window.showWarningMessage("No workspace is open."); return; }

  try {
    const data = await agentPost<SessionEndResponse>("/session/end", {
      workspacePath: ctx.summaryDirectory,
    });

    const summaryAbsPath = path.join(ctx.summaryDirectory, data.summaryPath);
    try {
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(summaryAbsPath));
      await vscode.window.showTextDocument(doc, { preview: false });
    } catch {}

    vscode.window.showInformationMessage(`Session summary written to ${data.summaryPath}`);

    if (data.safetyWarnings.length > 0) {
      const criticals = data.safetyWarnings.filter((w) => w.severity === "critical");
      const warnings = data.safetyWarnings.filter((w) => w.severity === "warning");
      const infos = data.safetyWarnings.filter((w) => w.severity === "info");

      if (criticals.length > 0) {
        vscode.window.showErrorMessage(`Worktrace Safety: ${criticals.length} critical issue(s) found.`);
      }
      if (warnings.length > 0) {
        vscode.window.showWarningMessage(`Worktrace Safety: ${warnings.length} warning(s).`);
      }
      if (infos.length === 0) {
      } else if (criticals.length === 0 && warnings.length === 0) {
        vscode.window.showInformationMessage(`Worktrace Safety: ${infos.length} info note(s).`);
      }
    }

    if (!data.aiSummary) {
      const action = await vscode.window.showInformationMessage(
        "Using local summary. Sign in for AI-powered summaries.", "Sign In"
      );
      if (action === "Sign In") vscode.commands.executeCommand("worktrace.signIn");
    }

    try {
      await agentPost<SessionStartResponse>("/session/start", { workspacePath: ctx.summaryDirectory });
    } catch {}
  } catch (err) {
    vscode.window.showErrorMessage(`Failed to end session: ${(err as Error).message}`);
  }
}

async function addNote(): Promise<void> {
  const ctx = getWorkspaceContextForCommand();
  if (!ctx) { vscode.window.showWarningMessage("No workspace open."); return; }

  const note = await vscode.window.showInputBox({
    prompt: "Add a session note (shown in summary under My Note)",
    placeHolder: "e.g. Blocked on API design; will pick up tomorrow.",
  });
  if (!note || !note.trim()) return;

  try {
    await agentPost("/session/note", { workspacePath: ctx.summaryDirectory, note: note.trim() });
    vscode.window.showInformationMessage("Session note added.");
  } catch (err) {
    vscode.window.showErrorMessage(`Failed to add note: ${(err as Error).message}`);
  }
}

async function signIn(): Promise<void> {
  try {
    const scheme = vscode.env.uriScheme;
    const data = await agentPost<AuthLoginResponse>("/auth/login", { scheme });
    await vscode.env.openExternal(vscode.Uri.parse(data.authUrl));
  } catch (err) {
    vscode.window.showErrorMessage(`Sign-in failed: ${(err as Error).message}`);
  }
}

async function signOut(): Promise<void> {
  try {
    await agentPost("/auth/logout");
    vscode.window.showInformationMessage("Signed out of Worktrace.");
    await updateStatusBar();
  } catch (err) {
    vscode.window.showErrorMessage(`Sign-out failed: ${(err as Error).message}`);
  }
}

async function setDisplayName(): Promise<void> {
  const name = await vscode.window.showInputBox({
    prompt: "Enter the name to display on your shareable session cards",
    placeHolder: "e.g. @username or your name",
  });
  if (name === undefined) return;
  const trimmed = name.trim();

  try {
    await agentPatch("/profile", { displayName: trimmed });
    vscode.window.showInformationMessage(
      trimmed ? `Display name set to "${trimmed}".` : "Display name cleared."
    );
  } catch (err) {
    vscode.window.showErrorMessage(`Failed to update display name: ${(err as Error).message}`);
  }
}

async function generateCard(): Promise<void> {
  const ctx = getWorkspaceContextForCommand();
  if (!ctx) { vscode.window.showWarningMessage("No workspace open."); return; }

  try {
    const auth = await agentGet<AuthStatus>("/auth/status");
    if (!auth.authenticated) {
      const action = await vscode.window.showWarningMessage(
        "Sign in to generate shareable session cards.", "Sign In"
      );
      if (action === "Sign In") vscode.commands.executeCommand("worktrace.signIn");
      return;
    }
  } catch { vscode.window.showErrorMessage("Cannot reach agent."); return; }

  const today = new Date().toISOString().split("T")[0];
  const dateInput = await vscode.window.showInputBox({
    prompt: "Enter date for the card (YYYY-MM-DD)",
    placeHolder: today, value: today,
    validateInput: (v) => !/^\d{4}-\d{2}-\d{2}$/.test(v) ? "Please use YYYY-MM-DD format" : null,
  });
  if (!dateInput) return;

  try {
    const data = await agentPost<CardResponse>("/card/generate", {
      workspacePath: ctx.summaryDirectory, date: dateInput,
    });
    const action = await vscode.window.showInformationMessage(`Card saved to ${data.cardPath}`, "Open Card");
    if (action === "Open Card") {
      const absPath = path.isAbsolute(data.cardPath)
        ? data.cardPath : path.join(ctx.summaryDirectory, data.cardPath);
      await vscode.env.openExternal(vscode.Uri.file(absPath));
    }
  } catch (err) {
    vscode.window.showErrorMessage(`Failed to generate card: ${(err as Error).message}`);
  }
}

async function runSafetyCheck(): Promise<void> {
  const ctx = getWorkspaceContextForCommand();
  if (!ctx) { vscode.window.showWarningMessage("No workspace open."); return; }

  try {
    const data = await agentPost<SafetyCheckResponse>("/safety/check", {
      workspacePath: ctx.summaryDirectory,
    });
    if (data.warnings.length === 0) {
      vscode.window.showInformationMessage("Worktrace Safety: No issues found. Code looks clean.");
    } else {
      const criticals = data.warnings.filter((w) => w.severity === "critical");
      const warns = data.warnings.filter((w) => w.severity === "warning");
      if (criticals.length > 0) {
        vscode.window.showErrorMessage(
          `Worktrace Safety: ${criticals.length} critical, ${warns.length} warnings found.`
        );
      } else {
        vscode.window.showWarningMessage(`Worktrace Safety: ${data.warnings.length} issue(s) found.`);
      }
    }
  } catch (err) {
    vscode.window.showErrorMessage(`Safety check failed: ${(err as Error).message}`);
  }
}

async function showContext(): Promise<void> {
  const ctx = getWorkspaceContextForCommand();
  if (!ctx) { vscode.window.showWarningMessage("No workspace open."); return; }

  try {
    const data = await agentGet<ContextResponse>(
      `/context?workspace=${encodeURIComponent(ctx.summaryDirectory)}`
    );
    if (!data.context) {
      vscode.window.showInformationMessage("No project context yet. End a session first.");
      return;
    }
    const doc = await vscode.workspace.openTextDocument({ content: data.context, language: "markdown" });
    await vscode.window.showTextDocument(doc, { preview: true });
    await vscode.env.clipboard.writeText(data.context);
    vscode.window.showInformationMessage("Project context copied to clipboard.");
  } catch (err) {
    vscode.window.showErrorMessage(`Failed to load context: ${(err as Error).message}`);
  }
}

async function searchHistory(): Promise<void> {
  const ctx = getWorkspaceContextForCommand();
  if (!ctx) { vscode.window.showWarningMessage("No workspace open."); return; }

  const query = await vscode.window.showInputBox({
    prompt: "Search sessions by file name, branch, or keyword",
    placeHolder: "e.g. auth.ts, main, refactor",
  });
  if (!query || !query.trim()) return;

  try {
    const data = await agentGet<HistoryResponse>(
      `/history?workspace=${encodeURIComponent(ctx.summaryDirectory)}&query=${encodeURIComponent(query.trim())}&limit=20`
    );
    if (!data.sessions || data.sessions.length === 0) {
      vscode.window.showInformationMessage(`No sessions found matching "${query}".`);
      return;
    }

    const items = data.sessions.map((s) => {
      const date = new Date(s.startTime).toLocaleDateString("en-US", {
        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
      });
      return {
        label: `${date} — ${s.sessionMode}`,
        description: s.branch ? `on ${s.branch}` : "",
        detail: s.intentDescription,
        session: s,
      };
    });

    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: `${data.sessions.length} session(s) found`,
    });

    if (picked) {
      const s = picked.session;
      const lines = [
        `# Session: ${s.sessionMode}`, "",
        `- **Date:** ${new Date(s.startTime).toLocaleString()}`,
        `- **Branch:** \`${s.branch || "unknown"}\``,
        `- **Confidence:** ${s.confidence}`,
        `- **Intent:** ${s.intentDescription}`,
        `- **Files:** ${s.filesTouched.length}`, "",
        "## Files Touched", "",
        ...s.filesTouched.map((f) => `- \`${f}\``), "",
        "## Friction Points", "",
        ...s.frictionPoints.map((p) => `- ${p}`), "",
        "## Tomorrow Checklist", "",
        ...s.tomorrowChecklist.map((t, i) => `${i + 1}. ${t}`),
      ];
      const doc = await vscode.workspace.openTextDocument({ content: lines.join("\n"), language: "markdown" });
      await vscode.window.showTextDocument(doc, { preview: true });
    }
  } catch (err) {
    vscode.window.showErrorMessage(`History search failed: ${(err as Error).message}`);
  }
}
