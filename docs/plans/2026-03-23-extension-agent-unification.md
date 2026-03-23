# Extension-Agent Unification Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the agent the single source of truth — extension becomes a thin VS Code UI client that calls agent HTTP routes instead of running inline business logic.

**Architecture:** Extension deletes 11 duplicated core modules and rewires all 9 commands to call the agent daemon on `localhost:9315`. Agent gains 3 new auth routes (`POST /auth/callback`, `POST /auth/logout`, modified `POST /auth/login` with scheme support). Extension auto-starts the agent on activation.

**Tech Stack:** VS Code Extension API, Express (agent), node:http fetch, chokidar (agent file watching)

---

## File Structure

### Agent changes (`CLI/packages/agent/`)
| File | Action | Responsibility |
|---|---|---|
| `src/auth.ts:28-36` | Modify | Change default backend URL to `http://localhost:3000` |
| `src/auth.ts` | Add export | Export `saveCredentials` and `clearCredentials` functions |
| `src/routes/auth.ts` | Modify | Add scheme support to `POST /login`, add `POST /callback`, `POST /logout`, add `userId` to `GET /status` |

### Extension changes (`Extension/`)
| File | Action | Responsibility |
|---|---|---|
| `src/agent-client.ts` | Create | HTTP client + `ensureAgent()` daemon spawner |
| `src/types.ts` | Create (rewrite) | Agent response interfaces only |
| `src/extension.ts` | Rewrite | Thin UI client — all commands call agent HTTP routes |
| `src/workspace.ts` | Keep | VS Code workspace utilities (no changes) |
| `package.json` | Modify | Add `worktrace.agentPath` configuration |
| `src/analysis.ts` | Delete | Moved to agent |
| `src/auth.ts` | Delete | Moved to agent |
| `src/constants.ts` | Delete | Moved to agent |
| `src/continuity.ts` | Delete | Moved to agent |
| `src/delta-builder.ts` | Delete | Moved to agent |
| `src/file-utils.ts` | Delete | Moved to agent |
| `src/git.ts` | Delete | Moved to agent |
| `src/memory.ts` | Delete | Moved to agent |
| `src/renderer.ts` | Delete | Moved to agent |
| `src/safety-monitor.ts` | Delete | Moved to agent |
| `src/session-store.ts` | Delete | Moved to agent |
| `src/session-manager.ts` | Delete | Agent owns session state |

---

## Task 1: Update agent backend URL default

**Files:**
- Modify: `CLI/packages/agent/src/auth.ts:29`

- [ ] **Step 1: Change the default backend URL**

In `CLI/packages/agent/src/auth.ts`, line 29, change the default from `'https://api.worktrace.dev'` to `'http://localhost:3000'`:

```typescript
const defaultUrl = process.env.WORKTRACE_BACKEND_URL || 'http://localhost:3000';
```

- [ ] **Step 2: Verify agent still builds**

Run: `cd CLI && npm run build --workspaces`
Expected: Clean build, no errors.

- [ ] **Step 3: Commit**

```bash
git add CLI/packages/agent/src/auth.ts
git commit -m "feat(agent): default backend URL to localhost:3000, overridable via WORKTRACE_BACKEND_URL"
```

---

## Task 2: Add scheme support and new auth routes to agent

**Files:**
- Modify: `CLI/packages/agent/src/auth.ts` (export `saveCredentials`, add `clearCredentials`)
- Modify: `CLI/packages/agent/src/routes/auth.ts` (add scheme handling, callback, logout routes)

- [ ] **Step 1: Export `saveCredentials` and add `clearCredentials` in `auth.ts`**

In `CLI/packages/agent/src/auth.ts`, change `saveCredentials` from a private function to an exported function. The function at line 52 currently starts with:

```typescript
async function saveCredentials(creds: Credentials): Promise<void> {
```

Change to:

```typescript
export async function saveCredentials(creds: Credentials): Promise<void> {
```

Then add a new exported function after `saveCredentials`:

```typescript
export async function clearCredentials(): Promise<void> {
  try {
    const { unlink } = await import('node:fs/promises');
    await unlink(CREDENTIALS_FILE);
  } catch { /* file may not exist */ }
}
```

- [ ] **Step 2: Rewrite `routes/auth.ts` with scheme support, callback, and logout**

Replace the entire content of `CLI/packages/agent/src/routes/auth.ts` with:

```typescript
import { Router } from 'express';
import { login, isAuthenticated, getCredentials, getConfig, saveCredentials, clearCredentials, callBackend } from '../auth.js';

const router = Router();

router.post('/login', async (req, res) => {
  try {
    const { scheme } = req.body || {};

    // Extension flow: return auth URL without opening browser
    if (scheme) {
      const config = await getConfig();
      const authUrl = `${config.backendUrl}/api/auth/google?scheme=${encodeURIComponent(scheme)}`;
      return res.json({ authUrl });
    }

    // CLI flow: full login with browser + local server
    const result = await login();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/callback', async (req, res) => {
  try {
    const { idToken, refreshToken, email, userId } = req.body;
    if (!idToken || !refreshToken || !email || !userId) {
      return res.status(400).json({ error: 'idToken, refreshToken, email, and userId are required' });
    }

    await saveCredentials({
      idToken,
      refreshToken,
      email,
      userId,
      expiresAt: Date.now() + 3600_000,
    });

    // Register user with backend (non-critical)
    try {
      await callBackend('POST', '/api/user/register', { email });
    } catch { /* ignore */ }

    res.json({ email, userId });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/logout', async (_req, res) => {
  try {
    await clearCredentials();
    res.json({ status: 'ok' });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get('/status', async (_req, res) => {
  const authenticated = await isAuthenticated();
  if (!authenticated) return res.json({ authenticated: false });
  const creds = await getCredentials();
  let displayName: string | null = null;
  try {
    const profileRes = await callBackend('GET', '/api/user/profile');
    const profile = await profileRes.json() as { displayName?: string };
    displayName = profile.displayName || null;
  } catch { /* ignore */ }
  res.json({
    authenticated: true,
    email: creds?.email,
    userId: creds?.userId,
    displayName,
  });
});

export default router;
```

- [ ] **Step 3: Verify agent builds**

Run: `cd CLI && npm run build --workspaces`
Expected: Clean build.

- [ ] **Step 4: Smoke test the new routes**

Start the agent and test:

```bash
# Start agent
node CLI/packages/agent/dist/server.js &

# Test login with scheme (should return authUrl, NOT open browser)
curl -s -X POST http://127.0.0.1:9315/auth/login \
  -H "Content-Type: application/json" \
  -d '{"scheme":"vscode"}' | jq .
# Expected: { "authUrl": "http://localhost:3000/api/auth/google?scheme=vscode" }

# Test callback
curl -s -X POST http://127.0.0.1:9315/auth/callback \
  -H "Content-Type: application/json" \
  -d '{"idToken":"test","refreshToken":"test","email":"test@test.com","userId":"uid123"}' | jq .
# Expected: { "email": "test@test.com", "userId": "uid123" }

# Test status (should now show userId)
curl -s http://127.0.0.1:9315/auth/status | jq .
# Expected: { "authenticated": true, "email": "test@test.com", "userId": "uid123", ... }

# Test logout
curl -s -X POST http://127.0.0.1:9315/auth/logout | jq .
# Expected: { "status": "ok" }

# Test status after logout
curl -s http://127.0.0.1:9315/auth/status | jq .
# Expected: { "authenticated": false }

# Kill agent
kill %1
```

- [ ] **Step 5: Commit**

```bash
git add CLI/packages/agent/src/auth.ts CLI/packages/agent/src/routes/auth.ts
git commit -m "feat(agent): add auth scheme support, callback, and logout routes"
```

---

## Task 3: Update extension tsconfig and package.json

**Files:**
- Modify: `Extension/tsconfig.json`
- Modify: `Extension/package.json`

- [ ] **Step 1: Update tsconfig to support `fetch` and `AbortSignal.timeout` types**

The extension will use the global `fetch` API (available in VS Code's Node 18+ runtime). Update `Extension/tsconfig.json`:

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2022",
    "outDir": "dist",
    "rootDir": "src",
    "lib": ["ES2022"],
    "types": ["node", "vscode"],
    "sourceMap": true,
    "strict": true,
    "noImplicitAny": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

Key changes: `target` from `ES2020` → `ES2022`, `lib` from `["ES2020"]` → `["ES2022"]`. This adds native `fetch`, `AbortSignal.timeout()`, and other modern APIs.

- [ ] **Step 2: Add `agentPath` and remove unused config properties from `package.json`**

In `Extension/package.json`, replace the `properties` object inside `contributes.configuration` with:

```json
"properties": {
  "worktrace.agentPath": {
    "type": "string",
    "default": "",
    "description": "Path to worktrace-agent server.js. Leave empty for auto-detection (looks for ../CLI/packages/agent/dist/server.js relative to extension)."
  },
  "worktrace.safetyMonitor": {
    "type": "boolean",
    "default": true,
    "description": "Enable real-time safety monitoring for AI-generated code changes."
  }
}
```

Removed `worktrace.backendUrl`, `worktrace.firebaseApiKey`, and `worktrace.displayName` — these are now handled by the agent.

- [ ] **Step 3: Commit**

```bash
git add Extension/tsconfig.json Extension/package.json
git commit -m "feat(extension): update tsconfig to ES2022, add agentPath config, remove unused settings"
```

---

## Task 4: Create extension agent-client

**Files:**
- Create: `Extension/src/agent-client.ts`

- [ ] **Step 1: Write `agent-client.ts`**

Create `Extension/src/agent-client.ts`:

```typescript
import { spawn } from "child_process";
import * as vscode from "vscode";
import * as path from "path";

const AGENT_PORT = 9315;
const AGENT_URL = `http://127.0.0.1:${AGENT_PORT}`;

export function getAgentUrl(): string {
  return AGENT_URL;
}

export async function ensureAgent(): Promise<void> {
  // Check if already running
  if (await isAgentHealthy()) return;

  // Resolve agent server.js path
  const config = vscode.workspace.getConfiguration("worktrace");
  let agentPath = config.get<string>("agentPath") || "";

  if (!agentPath) {
    // Auto-detect: relative to extension directory
    const extensionPath = vscode.extensions.getExtension("local.worktrace")?.extensionPath;
    if (extensionPath) {
      agentPath = path.join(extensionPath, "..", "CLI", "packages", "agent", "dist", "server.js");
    }
  }

  if (!agentPath) {
    throw new Error("Cannot find worktrace-agent. Set worktrace.agentPath in settings.");
  }

  // Spawn detached agent
  const child = spawn(process.execPath, [agentPath], {
    detached: true,
    stdio: ["ignore", "ignore", "ignore"],
    env: { ...process.env, WORKTRACE_AGENT_PORT: String(AGENT_PORT) },
  });
  child.unref();

  // Poll health with exponential backoff (up to 5s)
  let delay = 100;
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, delay));
    if (await isAgentHealthy()) return;
    delay = Math.min(delay * 2, 1000);
  }

  throw new Error("Failed to start worktrace agent within 5 seconds.");
}

async function isAgentHealthy(): Promise<boolean> {
  try {
    const res = await fetch(`${AGENT_URL}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    const data = (await res.json()) as { status?: string };
    return data.status === "ok";
  } catch {
    return false;
  }
}

export async function agentGet<T>(urlPath: string): Promise<T> {
  const res = await fetch(`${AGENT_URL}${urlPath}`);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `Agent error: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function agentPost<T>(urlPath: string, body?: unknown): Promise<T> {
  const res = await fetch(`${AGENT_URL}${urlPath}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || `Agent error: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function agentPatch<T>(urlPath: string, body: unknown): Promise<T> {
  const res = await fetch(`${AGENT_URL}${urlPath}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || `Agent error: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

/** Fire-and-forget POST — does not await response. Used in deactivate(). */
export function agentPostFireAndForget(urlPath: string, body?: unknown): void {
  fetch(`${AGENT_URL}${urlPath}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  }).catch(() => {
    // Intentionally swallowed — used for deactivate cleanup
  });
}
```

- [ ] **Step 2: Verify extension compiles**

Run: `cd Extension && npm run compile`
Expected: May have errors (types.ts and extension.ts not yet updated). That's fine — this file should compile independently.

- [ ] **Step 3: Commit**

```bash
git add Extension/src/agent-client.ts
git commit -m "feat(extension): add agent HTTP client with ensureAgent and fire-and-forget"
```

---

## Task 5: Create extension response types

**Files:**
- Create: `Extension/src/types.ts` (replaces old types.ts which will be deleted)

- [ ] **Step 1: Write new `types.ts` with agent response interfaces**

Delete the existing `Extension/src/types.ts` and replace with:

```typescript
// Agent response types — minimal interfaces for what the extension UI needs

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
```

- [ ] **Step 2: Commit**

```bash
git add Extension/src/types.ts
git commit -m "feat(extension): replace core types with agent response interfaces"
```

---

## Task 6: Delete duplicated extension modules

**Files:**
- Delete: `Extension/src/analysis.ts`
- Delete: `Extension/src/auth.ts`
- Delete: `Extension/src/constants.ts`
- Delete: `Extension/src/continuity.ts`
- Delete: `Extension/src/delta-builder.ts`
- Delete: `Extension/src/file-utils.ts`
- Delete: `Extension/src/git.ts`
- Delete: `Extension/src/memory.ts`
- Delete: `Extension/src/renderer.ts`
- Delete: `Extension/src/safety-monitor.ts`
- Delete: `Extension/src/session-store.ts`
- Delete: `Extension/src/session-manager.ts`

- [ ] **Step 1: Delete all 12 files**

```bash
cd Extension/src
rm -f analysis.ts auth.ts constants.ts continuity.ts delta-builder.ts \
  file-utils.ts git.ts memory.ts renderer.ts safety-monitor.ts \
  session-store.ts session-manager.ts
```

Verify only 4 files remain:

```bash
ls Extension/src/
# Expected: agent-client.ts  extension.ts  types.ts  workspace.ts
```

- [ ] **Step 2: Commit**

```bash
git add -u Extension/src/
git commit -m "refactor(extension): delete 12 duplicated core modules, agent is source of truth"
```

---

## Task 7: Rewrite extension.ts as thin agent client

**Files:**
- Rewrite: `Extension/src/extension.ts`

This is the largest task. The extension keeps all VS Code UI but every business logic call becomes an agent HTTP request.

- [ ] **Step 1: Replace entire `extension.ts`**

Replace `Extension/src/extension.ts` with:

```typescript
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

// ============================================================================
// EXTENSION LIFECYCLE
// ============================================================================

export async function activate(context: vscode.ExtensionContext) {
  // 1. Start agent daemon
  try {
    await ensureAgent();
  } catch (err) {
    vscode.window.showErrorMessage(
      `Failed to start Worktrace agent: ${(err as Error).message}`
    );
    return;
  }

  // 2. Status bar
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);
  await updateStatusBar();

  // 3. Start session (check if already active first)
  const workspacePath = getPrimaryWorkspacePath();
  if (workspacePath) {
    try {
      const status = await agentGet<SessionStatus>(
        `/session/status?workspace=${encodeURIComponent(workspacePath)}`
      );
      if (!status.active) {
        await agentPost<SessionStartResponse>("/session/start", { workspacePath });
      }
    } catch {
      // Agent may not be fully ready — non-critical
    }

    // 4. "Where I Left Off" notification
    showWhereILeftOff(workspacePath);
  }

  // 5. Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand("worktrace.endSession", () =>
      endSession()
    ),
    vscode.commands.registerCommand("worktrace.addSessionNote", () =>
      addNote()
    ),
    vscode.commands.registerCommand("worktrace.signIn", () => signIn()),
    vscode.commands.registerCommand("worktrace.signOut", () => signOut()),
    vscode.commands.registerCommand("worktrace.setDisplayName", () =>
      setDisplayName()
    ),
    vscode.commands.registerCommand("worktrace.generateCard", () =>
      generateCard()
    ),
    vscode.commands.registerCommand("worktrace.runSafetyCheck", () =>
      runSafetyCheck()
    ),
    vscode.commands.registerCommand("worktrace.showContext", () =>
      showContext()
    ),
    vscode.commands.registerCommand("worktrace.searchHistory", () =>
      searchHistory()
    )
  );

  // 6. URI handler for auth callback
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
              idToken,
              refreshToken,
              email,
              userId,
            });
            vscode.window.showInformationMessage(
              `Signed in as ${email}.`
            );
            await updateStatusBar();
          } catch (err) {
            vscode.window.showErrorMessage(
              `Sign-in failed: ${(err as Error).message}`
            );
          }
        }
      },
    })
  );
}

export function deactivate() {
  const workspacePath = getPrimaryWorkspacePath();
  if (workspacePath) {
    // Fire-and-forget — agent completes the pipeline independently
    agentPostFireAndForget("/session/end", { workspacePath });
  }
}

// ============================================================================
// STATUS BAR
// ============================================================================

async function updateStatusBar(): Promise<void> {
  try {
    const auth = await agentGet<AuthStatus>("/auth/status");
    if (auth.authenticated && auth.email) {
      statusBarItem.text = "$(circle-filled) Worktrace";
      statusBarItem.tooltip = `Signed in as ${auth.email}. Click to end session.`;
      statusBarItem.command = "worktrace.endSession";
    } else {
      statusBarItem.text = "$(circle-outline) Worktrace";
      statusBarItem.tooltip =
        "Not signed in. Click to sign in for AI summaries.";
      statusBarItem.command = "worktrace.signIn";
    }
  } catch {
    statusBarItem.text = "$(circle-outline) Worktrace";
    statusBarItem.tooltip = "Agent not connected.";
    statusBarItem.command = "worktrace.signIn";
  }
}

// ============================================================================
// "WHERE I LEFT OFF"
// ============================================================================

async function showWhereILeftOff(workspacePath: string): Promise<void> {
  try {
    const history = await agentGet<HistoryResponse>(
      `/history?workspace=${encodeURIComponent(workspacePath)}&limit=1`
    );
    if (!history.sessions || history.sessions.length === 0) return;

    const last = history.sessions[0];
    const endDate = new Date(last.endTime);
    const hoursAgo = Math.round(
      (Date.now() - endDate.getTime()) / (1000 * 60 * 60)
    );

    if (hoursAgo > 48) return;

    const timeLabel =
      hoursAgo < 1
        ? "just now"
        : hoursAgo < 24
        ? `${hoursAgo}h ago`
        : `${Math.round(hoursAgo / 24)}d ago`;

    const action = await vscode.window.showInformationMessage(
      `Worktrace: Last session (${timeLabel}) — ${last.intentDescription}`,
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

// ============================================================================
// COMMANDS
// ============================================================================

async function endSession(): Promise<void> {
  const ctx = getWorkspaceContextForCommand();
  if (!ctx) {
    vscode.window.showWarningMessage("No workspace is open.");
    return;
  }

  try {
    const data = await agentPost<SessionEndResponse>("/session/end", {
      workspacePath: ctx.summaryDirectory,
    });

    // Open summary in editor
    const summaryAbsPath = path.join(ctx.summaryDirectory, data.summaryPath);
    try {
      const doc = await vscode.workspace.openTextDocument(
        vscode.Uri.file(summaryAbsPath)
      );
      await vscode.window.showTextDocument(doc, { preview: false });
    } catch {
      // File may not exist yet if agent is still writing
    }

    vscode.window.showInformationMessage(
      `Session summary written to ${data.summaryPath}`
    );

    // Show safety warnings as notifications
    if (data.safetyWarnings.length > 0) {
      const criticals = data.safetyWarnings.filter(
        (w) => w.severity === "critical"
      );
      const warnings = data.safetyWarnings.filter(
        (w) => w.severity === "warning"
      );
      const infos = data.safetyWarnings.filter((w) => w.severity === "info");

      if (criticals.length > 0) {
        vscode.window.showErrorMessage(
          `Worktrace Safety: ${criticals.length} critical issue(s) found. Check the summary.`
        );
      }
      if (warnings.length > 0) {
        vscode.window.showWarningMessage(
          `Worktrace Safety: ${warnings.length} warning(s). Check the summary.`
        );
      }
      if (infos.length > 0 && criticals.length === 0 && warnings.length === 0) {
        vscode.window.showInformationMessage(
          `Worktrace Safety: ${infos.length} info note(s). Check the summary.`
        );
      }
    }

    if (!data.aiSummary) {
      const action = await vscode.window.showInformationMessage(
        "Using local summary. Sign in for AI-powered summaries.",
        "Sign In"
      );
      if (action === "Sign In") {
        vscode.commands.executeCommand("worktrace.signIn");
      }
    }

    // Restart session tracking
    try {
      await agentPost<SessionStartResponse>("/session/start", {
        workspacePath: ctx.summaryDirectory,
      });
    } catch {
      // May already be active — that's fine
    }
  } catch (err) {
    vscode.window.showErrorMessage(
      `Failed to end session: ${(err as Error).message}`
    );
  }
}

async function addNote(): Promise<void> {
  const ctx = getWorkspaceContextForCommand();
  if (!ctx) {
    vscode.window.showWarningMessage("No workspace open.");
    return;
  }

  const note = await vscode.window.showInputBox({
    prompt: "Add a session note (shown in summary under My Note)",
    placeHolder: "e.g. Blocked on API design; will pick up tomorrow.",
  });

  if (!note || !note.trim()) return;

  try {
    await agentPost("/session/note", {
      workspacePath: ctx.summaryDirectory,
      note: note.trim(),
    });
    vscode.window.showInformationMessage("Session note added.");
  } catch (err) {
    vscode.window.showErrorMessage(
      `Failed to add note: ${(err as Error).message}`
    );
  }
}

async function signIn(): Promise<void> {
  try {
    const scheme = vscode.env.uriScheme;
    const data = await agentPost<AuthLoginResponse>("/auth/login", { scheme });
    await vscode.env.openExternal(vscode.Uri.parse(data.authUrl));
  } catch (err) {
    vscode.window.showErrorMessage(
      `Sign-in failed: ${(err as Error).message}`
    );
  }
}

async function signOut(): Promise<void> {
  try {
    await agentPost("/auth/logout");
    vscode.window.showInformationMessage("Signed out of Worktrace.");
    await updateStatusBar();
  } catch (err) {
    vscode.window.showErrorMessage(
      `Sign-out failed: ${(err as Error).message}`
    );
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
      trimmed
        ? `Display name set to "${trimmed}".`
        : "Display name cleared."
    );
  } catch (err) {
    vscode.window.showErrorMessage(
      `Failed to update display name: ${(err as Error).message}`
    );
  }
}

async function generateCard(): Promise<void> {
  const ctx = getWorkspaceContextForCommand();
  if (!ctx) {
    vscode.window.showWarningMessage("No workspace open.");
    return;
  }

  // Check auth
  try {
    const auth = await agentGet<AuthStatus>("/auth/status");
    if (!auth.authenticated) {
      const action = await vscode.window.showWarningMessage(
        "Sign in to generate shareable session cards.",
        "Sign In"
      );
      if (action === "Sign In") {
        vscode.commands.executeCommand("worktrace.signIn");
      }
      return;
    }
  } catch {
    vscode.window.showErrorMessage("Cannot reach agent.");
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

  try {
    const data = await agentPost<CardResponse>("/card/generate", {
      workspacePath: ctx.summaryDirectory,
      date: dateInput,
    });

    const action = await vscode.window.showInformationMessage(
      `Card saved to ${data.cardPath}`,
      "Open Card"
    );
    if (action === "Open Card") {
      const absPath = path.isAbsolute(data.cardPath)
        ? data.cardPath
        : path.join(ctx.summaryDirectory, data.cardPath);
      await vscode.env.openExternal(vscode.Uri.file(absPath));
    }
  } catch (err) {
    vscode.window.showErrorMessage(
      `Failed to generate card: ${(err as Error).message}`
    );
  }
}

async function runSafetyCheck(): Promise<void> {
  const ctx = getWorkspaceContextForCommand();
  if (!ctx) {
    vscode.window.showWarningMessage("No workspace open.");
    return;
  }

  try {
    const data = await agentPost<SafetyCheckResponse>("/safety/check", {
      workspacePath: ctx.summaryDirectory,
    });

    if (data.warnings.length === 0) {
      vscode.window.showInformationMessage(
        "Worktrace Safety: No issues found. Code looks clean."
      );
    } else {
      const criticals = data.warnings.filter(
        (w) => w.severity === "critical"
      );
      const warns = data.warnings.filter((w) => w.severity === "warning");

      if (criticals.length > 0) {
        vscode.window.showErrorMessage(
          `Worktrace Safety: ${criticals.length} critical, ${warns.length} warnings found. Run "End Session" for details.`
        );
      } else {
        vscode.window.showWarningMessage(
          `Worktrace Safety: ${data.warnings.length} issue(s) found. Run "End Session" for details.`
        );
      }
    }
  } catch (err) {
    vscode.window.showErrorMessage(
      `Safety check failed: ${(err as Error).message}`
    );
  }
}

async function showContext(): Promise<void> {
  const ctx = getWorkspaceContextForCommand();
  if (!ctx) {
    vscode.window.showWarningMessage("No workspace open.");
    return;
  }

  try {
    const data = await agentGet<ContextResponse>(
      `/context?workspace=${encodeURIComponent(ctx.summaryDirectory)}`
    );

    if (!data.context) {
      vscode.window.showInformationMessage(
        "No project context yet. End a session first to generate context."
      );
      return;
    }

    const doc = await vscode.workspace.openTextDocument({
      content: data.context,
      language: "markdown",
    });
    await vscode.window.showTextDocument(doc, { preview: true });

    await vscode.env.clipboard.writeText(data.context);
    vscode.window.showInformationMessage(
      "Project context copied to clipboard. Paste into any AI tool."
    );
  } catch (err) {
    vscode.window.showErrorMessage(
      `Failed to load context: ${(err as Error).message}`
    );
  }
}

async function searchHistory(): Promise<void> {
  const ctx = getWorkspaceContextForCommand();
  if (!ctx) {
    vscode.window.showWarningMessage("No workspace open.");
    return;
  }

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
      vscode.window.showInformationMessage(
        `No sessions found matching "${query}".`
      );
      return;
    }

    const items = data.sessions.map((s) => {
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
      placeHolder: `${data.sessions.length} session(s) found`,
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
  } catch (err) {
    vscode.window.showErrorMessage(
      `History search failed: ${(err as Error).message}`
    );
  }
}
```

- [ ] **Step 2: Verify extension compiles**

Run: `cd Extension && npm run compile`
Expected: Clean build with 0 errors. Only 4 source files: `extension.ts`, `agent-client.ts`, `types.ts`, `workspace.ts`.

- [ ] **Step 3: Commit**

```bash
git add Extension/src/extension.ts
git commit -m "feat(extension): rewrite as thin agent client, all commands use agent HTTP routes"
```

---

## Task 8: Clean up dist and verify full build

**Files:**
- Clean: `Extension/dist/` (remove stale compiled files from deleted modules)

- [ ] **Step 1: Clean old dist files**

```bash
cd Extension && rm -rf dist/ && npm run compile
```

Expected: Only 4 `.js` and 4 `.d.ts` files in `dist/`:
- `extension.js`, `agent-client.js`, `types.js`, `workspace.js`

- [ ] **Step 2: Verify agent still builds**

```bash
cd CLI && npm run build --workspaces
```

Expected: Clean build.

- [ ] **Step 3: Verify extension lists only 4 source files**

```bash
ls Extension/src/
# Expected: agent-client.ts  extension.ts  types.ts  workspace.ts
```

- [ ] **Step 4: Commit**

```bash
git add -A Extension/
git commit -m "chore(extension): clean dist, remove stale compiled files from deleted modules"
```

---

## Task 9: End-to-end smoke test

- [ ] **Step 1: Start the agent manually**

```bash
cd CLI && node packages/agent/dist/server.js &
```

Expected: `worktrace-agent listening on 127.0.0.1:9315`

- [ ] **Step 2: Test session lifecycle via curl**

```bash
# Start session
curl -s -X POST http://127.0.0.1:9315/session/start \
  -H "Content-Type: application/json" \
  -d "{\"workspacePath\": \"$(pwd)\"}" | jq .

# Check status
curl -s "http://127.0.0.1:9315/session/status?workspace=$(pwd)" | jq .

# Add note
curl -s -X POST http://127.0.0.1:9315/session/note \
  -H "Content-Type: application/json" \
  -d "{\"workspacePath\": \"$(pwd)\", \"note\": \"test note\"}" | jq .

# End session
curl -s -X POST http://127.0.0.1:9315/session/end \
  -H "Content-Type: application/json" \
  -d "{\"workspacePath\": \"$(pwd)\"}" | jq .
# Expected: { summaryPath, contextPath, safetyWarnings, aiSummary }
```

- [ ] **Step 3: Test auth routes**

```bash
# Login with scheme (extension flow)
curl -s -X POST http://127.0.0.1:9315/auth/login \
  -H "Content-Type: application/json" \
  -d '{"scheme":"vscode"}' | jq .
# Expected: { "authUrl": "http://localhost:3000/api/auth/google?scheme=vscode" }

# Auth status
curl -s http://127.0.0.1:9315/auth/status | jq .
# Expected: { "authenticated": false }
```

- [ ] **Step 4: Test in VS Code/Cursor**

Open the `Extension/` directory in VS Code, press F5 to launch Extension Development Host:

1. Check status bar shows "Worktrace" (agent should auto-start)
2. Run "Worktrace: Run Safety Check" from command palette
3. Run "Worktrace: End Session" — should open a summary markdown file
4. Run "Worktrace: Show Session Context" — should open context or show "no context yet"
5. Run "Worktrace: Search Session History" — should show search input

- [ ] **Step 5: Kill agent and commit**

```bash
kill %1
```

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "test: verify extension-agent unification end-to-end"
```

---

## Task 10: Update CLAUDE.md and documentation

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update Extension Module Structure in CLAUDE.md**

Replace the Extension Module Structure table in `CLAUDE.md` with:

```markdown
### Extension Module Structure

| Module | Purpose |
| --- | --- |
| `Extension/src/extension.ts` | Entry point — activate/deactivate, command registration, URI handler, all commands as thin agent HTTP wrappers |
| `Extension/src/agent-client.ts` | HTTP client to agent daemon — `ensureAgent()`, `agentGet()`, `agentPost()`, `agentPatch()`, `agentPostFireAndForget()` |
| `Extension/src/types.ts` | Agent response interfaces — minimal types for what the extension UI needs |
| `Extension/src/workspace.ts` | VS Code workspace utility functions |

Key data flow: Extension activates → `ensureAgent()` starts agent daemon → `POST /session/start` begins tracking → agent's chokidar watcher records file events → user ends session → `POST /session/end` triggers full pipeline in agent → extension opens summary in editor.
```

- [ ] **Step 2: Update the architecture description**

In the Architecture section of `CLAUDE.md`, update the Extension bullet:

```markdown
- **Extension** (`Extension/src/`) — Thin VS Code UI client. Registers commands, manages status bar, shows notifications and quick picks. All business logic delegated to the agent daemon via HTTP on `localhost:9315`. Auto-starts the agent on activation.
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md to reflect extension-agent unification"
```
