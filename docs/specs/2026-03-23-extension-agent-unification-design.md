# Extension-Agent Unification Design

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the agent the single source of truth — the extension becomes a thin VS Code UI client that delegates all business logic to the agent daemon on `localhost:9315`.

**Architecture:** Extension keeps all VS Code UI (status bar, notifications, quick picks, text document viewers) but replaces every inline core call with an HTTP request to the agent. 11 duplicated core modules are deleted from the extension. The agent gains three new auth routes to support the extension's native URI scheme login flow.

**Tech Stack:** VS Code Extension API, Express (agent), HTTP fetch, chokidar (agent file watching)

---

## Scope

### In Scope
- Rewire extension to call agent HTTP routes instead of running inline logic
- Delete 11 duplicated core modules from `Extension/src/`
- Auto-start agent daemon from extension activation
- Add `WORKTRACE_BACKEND_URL` env var to agent (default `http://localhost:3000`)
- Add 3 new agent routes: `POST /auth/login` (scheme support), `POST /auth/callback`, `POST /auth/logout`
- Extension login uses VS Code URI scheme handler + forwards tokens to agent
- Extension stops capturing file events (agent's chokidar is the single event source)

### Out of Scope
- Shared npm package for core types (extension uses its own response interfaces)
- Extension publishing or packaging changes
- Dashboard integration
- Provider usage intelligence
- Any new CLI commands

---

## Extension File Changes

### Delete (11 files)
- `Extension/src/analysis.ts`
- `Extension/src/auth.ts`
- `Extension/src/constants.ts`
- `Extension/src/continuity.ts`
- `Extension/src/delta-builder.ts`
- `Extension/src/file-utils.ts`
- `Extension/src/git.ts`
- `Extension/src/memory.ts`
- `Extension/src/renderer.ts`
- `Extension/src/safety-monitor.ts`
- `Extension/src/session-store.ts`

### Keep (1 file, unchanged)
- `Extension/src/workspace.ts` — VS Code workspace utilities

### Rewrite (1 file)
- `Extension/src/extension.ts` — commands, event listeners, status bar, notifications, URI handler. All business logic calls replaced with agent HTTP requests.

### Create (2 files)
- `Extension/src/agent-client.ts` — `ensureAgent()` (health check + spawn daemon), `agentGet()`, `agentPost()`, `agentPatch()` HTTP helpers targeting `http://127.0.0.1:9315`
- `Extension/src/types.ts` — Response interfaces for agent HTTP responses (minimal, only what the extension UI needs to render)

### Result
Extension goes from 15 source files to 4 source files.

---

## Agent Changes

### Backend URL Configuration
- `CLI/packages/agent/src/auth.ts`: `getBackendUrl()` reads `process.env.WORKTRACE_BACKEND_URL`, defaults to `http://localhost:3000`
- Applied everywhere the agent calls the backend (login, register, summarize, context, card)

### Modified Route: `POST /auth/login`
Current behavior: `login()` in `auth.ts` always opens browser + starts local HTTP server for callback.

New behavior: the route handler checks for optional `scheme` body param **before** calling `login()`:
- **Without `scheme`** (CLI flow): calls `login()` as before — opens browser, local HTTP server catches callback, stores credentials
- **With `scheme`** (extension flow): short-circuits before calling `login()`. Constructs and returns `{ authUrl: "{backendUrl}/api/auth/google?scheme={scheme}" }` immediately. Does not open browser or start local server. The `login()` function is not called at all.

Implementation: the route handler in `routes/auth.ts` adds a `scheme` check at the top of the `POST /login` handler, returning early with `{ authUrl }` if present.

### New Route: `POST /auth/callback`
- Accepts body: `{ idToken, refreshToken, email, userId }`
- Computes `expiresAt` as `Date.now() + 3600_000` (1 hour, matching existing CLI login flow)
- Calls `saveCredentials({ idToken, refreshToken, email, userId, expiresAt })` to store in `~/.worktrace/credentials.json` (chmod 600)
- Registers user with backend via `POST /api/user/register`
- Returns `{ email, userId }`

### New Route: `POST /auth/logout`
- Clears `~/.worktrace/credentials.json`
- Returns `{ status: "ok" }`

### Modified Route: `GET /auth/status`
Current response: `{ authenticated, email?, displayName? }`. Updated to also include `userId` (read from credentials file):
- Returns `{ authenticated, email?, userId?, displayName? }`

---

## Login Flows

### CLI Login (unchanged)
1. User runs `worktrace login`
2. CLI calls `POST /auth/login` (no scheme)
3. Agent opens browser to `{backendUrl}/api/auth/google?redirect={localCallbackUrl}`
4. Agent starts local HTTP server on random port
5. User signs in with Google in browser
6. Backend redirects to `http://localhost:{port}/callback?idToken=...&refreshToken=...&email=...&userId=...`
7. Agent's local server receives callback, stores credentials
8. Returns `{ email, userId }` to CLI

### Extension Login (new)
1. User clicks "Sign In" in VS Code
2. Extension calls `POST /auth/login { scheme: "vscode" }` (or `"cursor"`)
3. Agent returns `{ authUrl: "{backendUrl}/api/auth/google?scheme=vscode" }`
4. Extension opens URL via `vscode.env.openExternal(authUrl)`
5. User signs in with Google in browser
6. Backend redirects to `vscode://local.worktrace/auth-callback?idToken=...&refreshToken=...&email=...&userId=...`
7. Extension's `UriHandler.handleUri()` catches the callback
8. Extension extracts query params, calls `POST /auth/callback { idToken, refreshToken, email, userId }`
9. Agent stores credentials in `~/.worktrace/credentials.json`
10. Extension updates status bar to show signed-in state

---

## Extension Command Mapping

| VS Code Command | Before (inline) | After (agent HTTP) |
|---|---|---|
| `worktrace.endSession` | Full pipeline: git diff, delta, analysis, safety, render, optional backend AI | `POST /session/end { workspacePath, userNote }` → open summary file, show safety notifications |
| `worktrace.addSessionNote` | Write to in-memory session | `POST /session/note { workspacePath, note }` |
| `worktrace.signIn` | Open browser, URI callback, store in SecretStorage | `POST /auth/login { scheme }` → open URL → URI callback → `POST /auth/callback` |
| `worktrace.signOut` | Clear SecretStorage | `POST /auth/logout` → update status bar |
| `worktrace.setDisplayName` | Call backend directly | `PATCH /profile { displayName }` |
| `worktrace.generateCard` | Call backend directly with auth tokens | `POST /card/generate { workspacePath, date }` |
| `worktrace.runSafetyCheck` | Run `runSafetyCheck()` inline | `POST /safety/check { workspacePath }` → show warnings |
| `worktrace.showContext` | Read local `.worktrace/` files | `GET /context?workspace={path}` → open in editor |
| `worktrace.searchHistory` | Read local `.worktrace/` files | `GET /history?workspace={path}` → show quick pick |

---

## Extension Activation Flow

```
activate(context):
  1. ensureAgent()
     - GET http://127.0.0.1:9315/health
     - If fails: spawn agent daemon (child_process.spawn, detached)
     - Poll /health up to 3s until ready

  2. GET /auth/status
     - Update status bar: "Worktrace: Signed In (email)" or "Worktrace: Sign In"

  3. GET /session/status?workspace={workspacePath}
     - If session already active: skip start, use existing session
     - If no active session: POST /session/start { workspacePath }
     - Agent starts chokidar watcher + session tracking

  4. "Where I Left Off" continuity notification
     - GET /history?workspace={path}&limit=1
     - If last session exists: show VS Code info notification with summary
     - Replaces the old `showWhereILeftOff()` which read from SessionStore directly

  5. Register all commands as thin HTTP wrappers

  6. Register URI handler for auth callback

  7. Register status bar click → endSession command

deactivate():
  - Fire-and-forget POST /session/end { workspacePath } (do NOT await)
  - The agent completes the full pipeline independently (git diff, analysis, safety, render)
  - VS Code's deactivate() has a ~5s hard timeout; the agent pipeline can take longer
  - By not awaiting, the extension exits immediately and the agent finishes in the background
  - Do NOT stop the agent (other workspaces or CLI may be using it)
```

---

## File Event Handling

**Before:** Extension subscribes to `vscode.workspace.onDidSaveTextDocument`, `onDidCreateFiles`, `onDidDeleteFiles`, `onDidChangeActiveTextEditor` and records events in the in-memory session.

**After:** Extension stops capturing file events entirely. The agent's chokidar watcher (started via `POST /session/start`) monitors the workspace directory and records all file create/save/delete events. This is already implemented and working.

---

## Agent Client in Extension

`Extension/src/agent-client.ts`:
- `AGENT_URL = "http://127.0.0.1:9315"`
- `AGENT_PORT = 9315` (matches agent default)
- `ensureAgent()`: check health, if down → spawn `server.js` from configured agent path
- `agentGet<T>(path)`: fetch GET, parse JSON, throw on error
- `agentPost<T>(path, body)`: fetch POST, parse JSON, throw on error
- `agentPatch<T>(path, body)`: fetch PATCH, parse JSON, throw on error

Agent path resolution: VS Code setting `worktrace.agentPath` pointing to the agent's compiled `server.js`. Defaults to the relative path `../CLI/packages/agent/dist/server.js` from the extension root. For production (packaged `.vsix`), users must set `worktrace.agentPath` to the globally installed agent path (e.g. after `npm install -g @worktrace/agent`). A future task will bundle the agent with the extension or auto-detect the global install path.

Health check polling: 5-second timeout with exponential backoff (100ms, 200ms, 400ms, ...) to handle cold starts on slower machines.

---

## Response Types

`Extension/src/types.ts` — minimal interfaces for what the extension needs:

```typescript
interface SessionStartResponse { sessionId: string; startTime: string; branch: string | null }
interface SessionEndResponse { summaryPath: string; contextPath: string; safetyWarnings: SafetyWarning[]; aiSummary: boolean }
interface SafetyWarning { severity: string; message: string; file?: string; line?: number }
interface SessionStatus { active: boolean; sessionId?: string; startTime?: string; branch?: string; fileCount?: number; saveCount?: number; eventCount?: number }
interface AuthStatus { authenticated: boolean; email?: string; userId?: string; displayName?: string }
interface AuthLoginResponse { authUrl: string }
interface AuthCallbackResponse { email: string; userId: string }
interface HistoryEntry { sessionId: string; date: string; branch: string; duration: number; mode: string; filesChanged: number; intent?: string; summary?: string }
interface CardResponse { cardPath: string }
interface HealthResponse { status: string; uptime: number; version: string; activeSessions: number }
```

---

## Error Handling

- **Agent not running:** `ensureAgent()` tries to start it. If it fails after 3s, show VS Code error notification: "Failed to start Worktrace agent"
- **Agent request fails:** Show VS Code warning notification with the error message. Don't crash the extension.
- **Auth expired:** Agent handles token refresh internally. If refresh fails, `GET /auth/status` returns `{ authenticated: false }`, extension updates status bar.
- **Session already active:** Extension checks `GET /session/status` first; if active, skips start. If a race condition causes a 400 from `POST /session/start`, extension silently continues.
- **Multiple VS Code windows:** Two windows on the same workspace share the same agent session. Both fire-and-forget `POST /session/end` on deactivate; the second gets "No active session" which is harmless.

### Path Handling
The agent returns `summaryPath` and `contextPath` as **relative paths** (relative to the workspace root). The extension reconstructs absolute paths by joining with the workspace root path before opening files in the editor.

---

## What Does NOT Change

- Backend (`Backend/`) — no changes needed
- CLI (`CLI/packages/cli/`) — no changes needed
- Agent core modules (`CLI/packages/agent/src/core/`) — no changes needed
- Agent daemon lifecycle (`CLI/packages/agent/src/daemon.ts`) — no changes needed
- VS Code `package.json` command/configuration contributions — no changes needed
- `.worktrace/` data directory structure — no changes needed
