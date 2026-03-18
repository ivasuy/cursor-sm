# Worktrace CLI & Agent — v1 Design Spec

## Overview

Build `worktrace-agent` as a local HTTP daemon that owns all core session intelligence, and `worktrace` CLI as a thin client to that agent. Together they bring the full Worktrace extension experience to the terminal — cross-platform, language-agnostic, editor-independent.

**Goal:** Any developer can `npm install -g worktrace`, run `worktrace start` in their project, work in any editor or terminal, run `worktrace end`, and get the same session summaries, safety scans, context files, and shareable cards that the VS Code extension produces.

## Architecture

```
┌─────────────┐         HTTP (localhost:9315)         ┌──────────────────┐
│  worktrace   │ ──────────────────────────────────▶  │  worktrace-agent │
│  CLI (thin)  │                                      │  (daemon)        │
└─────────────┘                                       │                  │
                                                      │  ┌────────────┐ │      ┌────────────────┐
┌─────────────┐         (future client)               │  │  core/     │ │─────▶│ Backend API     │
│  Extension   │ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ▶ │  │  analysis  │ │      │ (cloud, existing│
└─────────────┘                                       │  │  renderer  │ │      │  unchanged)     │
                                                      │  │  safety    │ │
                                                      │  │  git       │ │
                                                      │  │  memory    │ │
                                                      │  │  watcher   │ │
                                                      │  └────────────┘ │
                                                      └──────────────────┘
```

- **`packages/agent/`** — Local HTTP server daemon. Owns all core logic (extracted from extension source). Manages file watchers, session state, git operations, analysis, rendering, safety scanning, memory, auth, and backend API proxying.
- **`packages/cli/`** — Thin client. Parses commands, calls agent API, formats output with modern terminal aesthetics.
- **`extension/`** — Existing VS Code extension. Unchanged for v1. Becomes a second agent client in a future release.
- **`backend/`** — Existing cloud backend. Unchanged except a targeted auth page modification for CLI redirect support (see Backend Change Required section).

## Package Structure

```
worktrace/
├── packages/
│   ├── agent/
│   │   ├── src/
│   │   │   ├── server.ts              # Express HTTP server, localhost:9315
│   │   │   ├── daemon.ts              # Spawn as detached process, PID file, health
│   │   │   ├── routes/
│   │   │   │   ├── session.ts         # POST /session/start, /session/end, GET /session/status
│   │   │   │   ├── context.ts         # GET /context
│   │   │   │   ├── history.ts         # GET /history
│   │   │   │   ├── safety.ts          # POST /safety/check
│   │   │   │   ├── auth.ts            # POST /auth/login, GET /auth/status
│   │   │   │   ├── card.ts            # POST /card/generate
│   │   │   │   ├── profile.ts         # PATCH /profile
│   │   │   │   └── health.ts          # GET /health
│   │   │   ├── core/
│   │   │   │   ├── analysis.ts        # Session analysis (mode, friction, confidence, intent)
│   │   │   │   ├── delta-builder.ts   # Structured session delta from events + git diff
│   │   │   │   ├── git.ts             # Git operations (diff, branch) via execFile
│   │   │   │   ├── file-utils.ts      # File classification, content reading
│   │   │   │   ├── renderer.ts        # Markdown summary rendering
│   │   │   │   ├── safety-monitor.ts  # Safety scanning (secrets, unsafe code, scope)
│   │   │   │   ├── continuity.ts      # Project context generation
│   │   │   │   ├── memory.ts          # Cross-session analysis (churn, friction, TODOs)
│   │   │   │   ├── session-store.ts   # .worktrace/sessions.json persistence
│   │   │   │   ├── constants.ts       # Excluded patterns, limits, defaults
│   │   │   │   └── types.ts           # All shared TypeScript types
│   │   │   ├── watcher.ts             # Chokidar file watcher per workspace
│   │   │   └── auth.ts                # Token storage, refresh, backend API calls
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── cli/
│       ├── src/
│       │   ├── index.ts               # Entry point, commander setup
│       │   ├── commands/
│       │   │   ├── start.ts
│       │   │   ├── end.ts
│       │   │   ├── status.ts
│       │   │   ├── context.ts
│       │   │   ├── history.ts
│       │   │   ├── check.ts
│       │   │   ├── login.ts
│       │   │   └── card.ts
│       │   ├── agent-client.ts        # HTTP client to agent API
│       │   └── output.ts              # Terminal formatting, spinners, colors
│       ├── package.json
│       └── tsconfig.json
│
├── extension/                          # Existing, unchanged
├── backend/                            # Existing, one small auth change
├── package.json                        # Root npm workspaces config
└── tsconfig.base.json                  # Shared TS config
```

## Agent API Contract

Local HTTP server on `127.0.0.1:9315`. All routes return JSON. No auth required (localhost-only).

### Lifecycle Routes

| Method | Route | Body / Query | Response |
|--------|-------|-------------|----------|
| `GET` | `/health` | — | `{ status, uptime, version, activeSessions }` |
| `POST` | `/session/start` | `{ workspacePath }` | `{ sessionId, startTime, branch }` |
| `POST` | `/session/end` | `{ workspacePath, userNote? }` | `{ summaryPath, contextPath, safetyWarnings[], aiSummary: bool }` |
| `POST` | `/session/note` | `{ workspacePath, note }` | `{ notes[] }` |
| `GET` | `/session/status` | `?workspace=<path>` | `{ active, duration, filesTouched, totalSaves, branch }` |

### Intelligence Routes

| Method | Route | Body / Query | Response |
|--------|-------|-------------|----------|
| `GET` | `/context` | `?workspace=<path>` | `{ context: string }` (markdown) |
| `GET` | `/history` | `?workspace=<path>&query=<search>&limit=10` | `{ sessions[] }` |
| `POST` | `/safety/check` | `{ workspacePath }` | `{ warnings[] }` |

### Auth & Cloud Routes

| Method | Route | Body / Query | Response |
|--------|-------|-------------|----------|
| `POST` | `/auth/login` | — | `{ email, userId }` (blocks until browser flow completes) |
| `GET` | `/auth/status` | — | `{ authenticated, email?, displayName? }` |
| `POST` | `/card/generate` | `{ workspacePath, date? }` | `{ cardPath }` (saves PNG locally, see Card Generation Flow) |
| `PATCH` | `/profile` | `{ displayName }` | `{ displayName }` |

### Session End Flow (Internal)

1. Stop file watcher for workspace
2. Collect recorded file events + save counts from in-memory state
3. Run `git diff HEAD` + `git branch --show-current` via `execFile` (no shell)
4. Build `SessionDelta` from diffs (created/updated/deleted with content)
5. Run `analyzeSession(session, userNote)` — mode detection, confidence, friction, intent, tomorrow checklist. Note: `userNote` passed as plain string parameter (not read from VS Code state).
6. Run `runSafetyCheck()` — secrets, unsafe code, scope creep, new deps
7. Persist session to `.worktrace/sessions.json` (sliding window, max 200)
8. Render local Markdown summary via `renderSessionMemory()` → write to `sessions/session-YYYY-MM-DD_HH-MM-SS.md`
9. Generate local project context via `generateProjectContext(memory, session, analysis, projectName, previousContext)` from `continuity.ts` → write to `sessions/context.md`
10. If authenticated: call backend `POST /api/session/summarize` and `POST /api/session/context` in parallel. Replace local files with AI versions on success.
11. If authenticated + AI summary succeeded: compute card stats from session data (linesAdded, linesRemoved, filesChanged), call backend `POST /api/card/generate` with `{ date, branch, linesAdded, linesRemoved, filesChanged }`, receive PNG buffer, save to `sessions/YYYY-MM-DD_card.png`
12. Return summary path + safety warnings to CLI

## CLI Commands

```
worktrace start                    # Start session in cwd
worktrace end                      # End session, generate summary
worktrace end -n "Added auth"      # End with a note
worktrace status                   # Current session stats
worktrace context                  # Print project context to stdout
worktrace history                  # List recent sessions
worktrace history -q "auth"        # Search by keyword
worktrace check                    # Safety scan on uncommitted changes
worktrace note "Refactored auth"   # Add note to active session
worktrace login                    # Google sign-in via browser
worktrace card                     # Generate shareable card for today
worktrace card --date 2026-03-15   # Card for specific date
```

### Global Flags

- `--no-color` — disable colors
- `--json` — output JSON instead of formatted text
- `-h, --help` — show help
- `-v, --version` — show version

### CLI Aesthetics — Matrix Terminal Vibe

Dark, cinematic terminal aesthetic. Think the Matrix operator console meets a modern dev tool. The CLI should feel alive — like a system that's watching, thinking, and reporting back.

**Color palette:**
- **Primary green** (`#00FF41`) — Matrix green for success states, active data, and key metrics
- **Dim green** (`#0D4D1A`) — for background text, secondary info, subtle decorations
- **Amber** (`#FFB000`) — warnings, caution states
- **Red** (`#FF0040`) — critical alerts, safety violations
- **Cool white** (`#D0D0D0`) — body text
- **Dark gray** (`#333`) — borders, separators, inactive elements

**Visual elements:**
- **Matrix rain intro** — on first run / `worktrace start`, a brief (0.5s) cascade of falling green characters before the main output. Subtle, not overwhelming. Uses `chalk` + rapid console writes.
- **Typing effect** — short interactive messages print character-by-character with a slight delay (15-30ms per char), like a system talking to you. Only on key messages, not on data output.
- **Glitch transitions** — between major steps, a quick 1-2 frame "glitch" effect (randomized characters that resolve into the real text). Adds personality without slowing things down.
- **Animated spinners** — `ora` spinners with custom Matrix-green frames: `['▰▱▱▱▱', '▰▰▱▱▱', '▰▰▰▱▱', '▰▰▰▰▱', '▰▰▰▰▰', '▱▰▰▰▰', '▱▱▰▰▰', '▱▱▱▰▰', '▱▱▱▱▰']` or similar pulsing bar.
- **Boxed output** — bordered panels using box-drawing characters with green borders for info, amber for warnings, red for critical.
- **Gradient headers** — `gradient-string` with green-to-cyan gradient on the `worktrace` banner.
- **Clean tables** — `cli-table3` with dim green borders, bright green headers.
- **No emoji** — clean typography only. Unicode box-drawing and block characters for visual flair.
- **Respects `NO_COLOR`** and `TERM=dumb` — all effects disabled, plain text fallback.

**Interactive messages — the CLI has personality:**

Short, randomized messages that appear between steps. They make the tool feel alive and fun without being annoying. Pool of ~5-10 variants per event, randomly selected.

On `worktrace start`:
```
  ┌──────────────────────────────────────────────────┐
  │                                                  │
  │   w o r k t r a c e                              │
  │   ─────────────────                              │
  │   the matrix sees your code now.                 │
  │                                                  │
  │   session:  wt_8f3a2b                            │
  │   branch:   feat/auth-flow                       │
  │   watching: /Users/dev/myproject                 │
  │   started:  14:30:00                             │
  │                                                  │
  │   > every keystroke is being recorded.           │
  │                                                  │
  └──────────────────────────────────────────────────┘
```

Start message variants (randomly picked):
- `"the matrix sees your code now."`
- `"jacking in. signal locked."`
- `"trace initialized. the watchers are live."`
- `"you're in. make it count."`
- `"connection established. tracking active."`

On `worktrace end` (step-by-step with personality):
```
  ◐ intercepting file events...
  ✓ 12 events captured across 4 files

  ◐ decoding git diff...
  ✓ +147 / -23 lines — the diff doesn't lie.

  ◐ running analysis...
  ✓ Deep Focus → Active Iteration — you were locked in.

  ◐ scanning for anomalies...
  ⚠ 2 warnings detected — something doesn't smell right.

  ◐ rendering session memory...
  ✓ sessions/session-2026-03-18_14-30-00.md

  > "not bad. the machine remembers everything."
```

End message variants:
- `"not bad. the machine remembers everything."`
- `"session archived. the trace is permanent."`
- `"logged, sealed, remembered. see you next time."`
- `"the record is clean. or is it?"`
- `"another session in the book. the matrix grows."`

On `worktrace status`:
```
  ┌─ SESSION ACTIVE ──────────────────────────┐
  │                                           │
  │  duration    01h 42m 15s                  │
  │  branch      feat/auth-flow               │
  │  files       7 touched                    │
  │  saves       34 total                     │
  │  events      89 captured                  │
  │                                           │
  │  > the system is watching. keep going.    │
  │                                           │
  └───────────────────────────────────────────┘
```

Status message variants:
- `"the system is watching. keep going."`
- `"still tracing. you're doing fine."`
- `"signal strong. session active."`
- `"the watchers report: all systems nominal."`

On `worktrace check` (safety):
```
  ◐ scanning for threats...

  ┌─ ANOMALY DETECTED ───────────────────────────────┐
  │                                                   │
  │  CRITICAL  Hardcoded API key found                │
  │            src/config.ts:23                        │
  │            > const key = "sk-proj-abc123..."       │
  │                                                   │
  │  WARNING   Unsafe code pattern detected           │
  │            src/utils.ts:45                         │
  │            > dynamic code execution found          │
  │                                                   │
  │  WARNING   Scope creep — 18 files modified        │
  │            Expected focused change, got sprawl     │
  │                                                   │
  │  > "i'd fix those before someone else finds them." │
  │                                                   │
  └───────────────────────────────────────────────────┘
```

Safety message variants (when issues found):
- `"i'd fix those before someone else finds them."`
- `"the scan found something. you should look."`
- `"red flags detected. your call, operator."`
- `"anomalies in the codebase. proceed with caution."`

Safety message variants (clean scan):
- `"scan complete. the codebase is clean. for now."`
- `"no anomalies. the code checks out."`
- `"all clear. the matrix approves."`

On `worktrace login`:
```
  ◐ opening secure channel...
  ✓ browser launched — complete sign-in to authenticate.
  ◐ waiting for credentials...
  ✓ identity confirmed.

  > "welcome back, vasu. the system recognizes you."
```

On `worktrace history`:
```
  ┌─ SESSION ARCHIVE ────────────────────────────────────────────────┐
  │                                                                  │
  │  #  Date        Duration  Branch            Mode     Files  +/-  │
  │  ── ──────────  ────────  ────────────────  ───────  ─────  ──── │
  │  1  2026-03-18  01h 42m   feat/auth-flow    focused    7   +147  │
  │  2  2026-03-17  02h 10m   fix/card-render   debug      4    +53  │
  │  3  2026-03-16  00h 55m   main              explore   12   +210  │
  │  4  2026-03-15  03h 20m   feat/safety       focused    9   +340  │
  │                                                                  │
  │  > "4 sessions recovered from the archive."                      │
  │                                                                  │
  └──────────────────────────────────────────────────────────────────┘
```

On `worktrace context`:
- No box, no personality — outputs raw markdown to stdout for piping. This is a utility command. Clean output only.

On `worktrace card`:
```
  ◐ generating session card...
  ✓ card saved to sessions/2026-03-18_card.png

  > "your proof of work. share it with the world."
```

**Implementation notes:**
- All personality messages stored in a `messages.ts` module — arrays of variants per event, selected via `Math.random()`
- Typing effect is a simple `async` function that writes char-by-char with `process.stdout.write()` + `setTimeout`
- Matrix rain is a brief animation on `start` only — ~20 columns of random katakana/latin chars falling for 0.5s then clearing
- Glitch effect: print a line of random chars, wait 50ms, overwrite with real text via `\r` carriage return
- All effects respect `--no-color` flag and `NO_COLOR` env — when disabled, output is plain with no delays
- Effects also disabled when `--json` flag is used
- Keep all animations fast — total added delay per command should be under 1s. The tool should feel snappy, not slow.

### Help Screen

```
  ┌──────────────────────────────────────────────┐
  │                                              │
  │   w o r k t r a c e                          │
  │   ─────────────────                          │
  │   the operating system for AI-assisted dev   │
  │                                              │
  └──────────────────────────────────────────────┘

  Usage: worktrace <command> [options]

  Commands:
    start       Start tracking a session
    end         End session and generate summary
    status      Show current session stats
    context     Print project context (stdout, pipeable)
    history     Browse past sessions
    check       Run safety scan on uncommitted changes
    note        Add note to active session
    login       Sign in with Google
    card        Generate shareable session card

  Global:
    --no-color  Disable colors and animations
    --json      Output as JSON (no effects)
    -h, --help  Show help
    -v          Show version

  > "type a command. the system is ready."
```

## VS Code API Decoupling Requirements

Every module extracted from the extension into `packages/agent/core/` must have all `vscode.*` dependencies removed. This is the inventory of what changes per module:

| Module | VS Code Dependency | Node.js Replacement |
|--------|-------------------|---------------------|
| `analysis.ts` | `vscode.ExtensionContext.workspaceState.get("sessionNotes")` | Accept `userNote: string \| null` as a plain function parameter. Notes accumulated via `POST /session/note` agent route. |
| `session-store.ts` | `vscode.workspace.fs.readFile`, `writeFile`, `createDirectory` | `fs/promises` (`readFile`, `writeFile`, `mkdir`) |
| `delta-builder.ts` | Calls `readFileContent()` and `findAffectedFiles()` from `file-utils.ts` which may use VS Code fs | Ensure `file-utils.ts` uses `fs/promises` only |
| `file-utils.ts` | `vscode.workspace.fs.readFile` for content reading | `fs/promises.readFile` with same size caps (10KB summary, 5KB affected) |
| `git.ts` | `vscode.workspace.workspaceFolders` in `getGitDiffCwd()` | Accept `workspacePath: string` as parameter. Signatures become `getGitDiff(workspacePath)` and `getCurrentBranch(workspacePath)` |
| `continuity.ts` | `vscode.workspace.fs` for reading previous context file | `fs/promises.readFile` |
| `renderer.ts` | No VS Code dependency | Direct extraction, no changes needed |
| `safety-monitor.ts` | No VS Code dependency | Direct extraction, no changes needed |
| `memory.ts` | No VS Code dependency (operates on `StoredSession[]`) | Direct extraction, no changes needed |
| `constants.ts` | No VS Code dependency | Direct extraction. Note: `EXCLUDED_PATTERNS` are regexes in the extension; the chokidar watcher needs glob equivalents (e.g., `**/node_modules/**`). Add a `WATCHER_IGNORED_GLOBS` array alongside the existing regex patterns. |
| `types.ts` | No VS Code dependency | Direct extraction, no changes needed |

**Rule:** No file in `packages/agent/` may import `vscode`. If it compiles without the `@types/vscode` package, it's clean.

## Agent Daemon Lifecycle

### Startup

- CLI checks `~/.worktrace/agent.pid` → hits `GET /health`
- If agent not running: spawns via `child_process.spawn` with `detached: true`, `stdio: 'ignore'`, `unref()`
- On Windows: uses `shell: true` for proper detach
- Waits up to 3s for `/health` to respond
- If unreachable after 3s: error with "Failed to start worktrace agent"

### Runtime

- PID written to `~/.worktrace/agent.pid`
- Logs written to `~/.worktrace/agent.log` (rotated, last 1MB)
- Binds to `127.0.0.1:9315` only — no external access. Port configurable via `WORKTRACE_AGENT_PORT` env var.
- If port is occupied: agent checks `/health` — if it responds with a valid agent payload, it's already running (reuse it). If it responds with unexpected content, exit with error: "Port 9315 is in use by another process."
- Manages multiple workspaces concurrently (one watcher per active session)
- Active sessions tracked in `~/.worktrace/active-sessions.json`

### Shutdown

- Graceful on `SIGTERM` — stops all watchers, closes server, removes PID file
- On Windows: listens for `SIGINT` and `SIGBREAK`

### Crash Recovery

- If agent crashes: in-memory file events for active sessions are lost
- User must `worktrace start` again
- Acceptable for v1. Persistent event journaling deferred.

## File Watcher

- **Library:** `chokidar` (cross-platform: FSEvents on macOS, inotify on Linux, ReadDirectoryChangesW on Windows)
- **Scope:** watches workspace root recursively
- **Events tracked:** `add` (create), `change` (save), `unlink` (delete)
- **Ignored patterns:** Translated from extension `constants.ts` `EXCLUDED_PATTERNS` (regexes) into chokidar-compatible globs: `**/node_modules/**`, `**/dist/**`, `**/build/**`, `**/.next/**`, `**/out/**`, `**/target/**`, `**/coverage/**`, `**/.git/**`, `**/sessions/**`, `**/.worktrace/**`, `**/.env*`, `**/*.min.js`, `**/*.map`, `**/package-lock.json`, `**/yarn.lock`, `**/pnpm-lock.yaml`, `**/.gradle/**`, `**/__pycache__/**`, `**/venv/**`, `**/vendor/**`, `**/.hardhat/**`, `**/cache/**`
- **In-memory state per workspace:**
  - `fileChangeEvents[]` — `{ file, eventType, timestamp }`
  - `filesTouched` — deduplicated set of relative paths
  - `saveCounts` — `{ [relativePath]: number }` incremented on each `change` event
- All file paths stored relative to workspace root
- Watcher destroyed on `session/end` or agent shutdown

## Authentication

### Login Flow

1. CLI sends `POST /auth/login` to agent
2. Agent spins up temporary HTTP server on random available port (e.g., `localhost:54321`)
3. Agent opens default browser (via `open` npm package) to: `{backendUrl}/api/auth/google?redirect=http://localhost:54321/callback`
4. User completes Google Sign-In via Firebase popup on the auth page
5. Auth page JavaScript redirects to `http://localhost:54321/callback?idToken=...&refreshToken=...&email=...&userId=...`
6. Agent captures tokens, writes to `~/.worktrace/credentials.json` (mode `0600`)
7. Agent calls `POST {backendUrl}/api/user/register` to ensure Firestore user doc exists
8. Temporary server shuts down
9. Agent returns `{ email, userId }` to CLI
10. CLI prints: `Signed in as user@example.com`

### Token Storage

- File: `~/.worktrace/credentials.json`
- Permissions: `0600` (Unix). No-op on Windows (acceptable for v1).
- Contents: `{ idToken, refreshToken, userId, email, expiresAt }`

### Token Refresh

- Before any backend API call, agent checks `expiresAt`
- If expired: refreshes via Firebase REST API (`https://securetoken.googleapis.com/v1/token?key={apiKey}`)
- Updates `credentials.json` with new `idToken` and `expiresAt`
- Firebase API key fetched from backend `GET /api/config` on first use, cached in `~/.worktrace/config.json`

### No-Auth Mode

Everything except cards, AI summaries, and AI context works without login. Agent skips backend calls when no credentials exist. Local deterministic summaries and context always generate.

## Backend Change Required

Modification to `backend/src/routes/auth.ts`:

The existing `/api/auth/google` route serves an HTML page with client-side JavaScript that uses `firebase.auth().signInWithPopup()`. After sign-in, the JavaScript constructs a callback URL using the `scheme` query parameter as a URI prefix: `scheme + '://local.worktrace/auth-callback?' + params`. This is client-side redirect logic, not a server-side redirect.

**What needs to change:** The client-side JavaScript on the auth page must handle two modes:

1. **URI scheme mode (existing):** When only `scheme` is provided (e.g., `?scheme=cursor`), construct `cursor://local.worktrace/auth-callback?idToken=...` and redirect via `window.location.href`. This is current behavior — unchanged.

2. **Direct URL mode (new for CLI):** When a `redirect` query parameter is provided (e.g., `?redirect=http://localhost:54321/callback`), use that URL directly as the callback target: `redirect + '?idToken=...'`. The JavaScript checks for `redirect` first; if present, uses it; if absent, falls back to scheme-based construction.

This is a change to the inline JavaScript in the HTML template served by the auth route, not to the Express route handler itself.

## Cross-Platform Guarantees

| Concern | Approach |
|---------|----------|
| File paths | `path.join()` / `path.resolve()` everywhere, `os.homedir()` for home dir |
| Process detach | `detached: true` + `unref()` on Unix; `shell: true` on Windows |
| Process kill | `process.kill(pid)` with `taskkill /PID` fallback on Windows |
| File watching | Chokidar handles OS-specific APIs internally |
| Browser open | `open` npm package (cross-platform) |
| Git commands | `child_process.execFile('git', [...])` — no shell, no injection risk |
| Line endings | Handles both `\n` and `\r\n` in file reads and diff parsing |
| Credentials | `fs.chmod(0o600)` on Unix, no-op on Windows |
| Localhost | `127.0.0.1` binding works identically on all platforms |

## Language-Agnostic Guarantees

- **No language detection required** — session tracking is file-event + git-diff based
- **File classification by extension** — `file-utils.ts` covers `.ts`, `.js`, `.py`, `.go`, `.rs`, `.sol`, `.java`, `.kt`, `.rb`, `.php`, `.c`, `.cpp`, `.cs`, `.swift`, `.vue`, `.svelte`, and more. Falls back to `Other`.
- **Git is the only external dependency** — analysis runs on `git diff` output, language-independent
- **Safety scanner** — regex pattern matching on any text file, not language-specific
- **No project manifest assumptions** — works in any git repo. Works even without git (falls back to no-diff mode with reduced analysis).
- **Excluded patterns** — covers universal noise: `node_modules/`, `dist/`, `build/`, `target/`, `__pycache__/`, `.gradle/`, `vendor/`, `Pods/`, etc.

## Output Files

Same locations as extension — full parity:

- `{workspace}/sessions/session-YYYY-MM-DD_HH-MM-SS.md` — session summary (matches extension naming convention)
- `{workspace}/sessions/context.md` — persistent project context
- `{workspace}/sessions/YYYY-MM-DD_card.png` — shareable card (when authenticated)
- `{workspace}/.worktrace/sessions.json` — session history store (max 200, sliding window)

## Dependencies

### Agent (`packages/agent/`)

- `express` — HTTP server
- `chokidar` — file watching
- `open` — open browser for auth
- `chalk` — colored log output

### CLI (`packages/cli/`)

- `commander` — command parsing
- `ora` — animated spinners
- `chalk` — colors
- `gradient-string` — gradient text for headers
- `cli-table3` — formatted tables
- `boxen` — boxed output panels
- Built-in `fetch` — HTTP client to agent (Node 18+ global fetch)

### Shared

- TypeScript, `tsconfig.base.json` with `ES2022` target, `NodeNext` module resolution

## Distribution

- Published to npm as a **single package**: `npm install -g worktrace`
- The CLI package (`packages/cli/`) depends on the agent package (`packages/agent/`) as a workspace dependency
- At publish time, both are bundled into one npm package named `worktrace`
- `bin` entry in root `package.json`: `{ "worktrace": "./packages/cli/dist/index.js" }`
- The CLI imports the agent's `daemon.ts` module directly to spawn/manage the agent process
- Node.js 18+ required (for global `fetch`, modern ESM support)

## What Is NOT In v1

- Extension refactoring to use the agent (extension stays as-is)
- Provider usage intelligence / CodexBar integration
- `worktrace logout` / `worktrace config` / `worktrace stop` commands (user can `kill` via PID file if needed)
- Persistent event journaling for crash recovery
- Standalone binary builds (pkg/bun compile)
- Web dashboard sync
- Team features, reports, exports
