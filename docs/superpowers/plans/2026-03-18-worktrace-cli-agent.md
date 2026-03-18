# Worktrace CLI & Agent Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `worktrace-agent` (local HTTP daemon) and `worktrace` CLI (thin client) that replicate the VS Code extension's full session tracking, analysis, safety scanning, and cloud features — cross-platform, language-agnostic.

**Architecture:** Agent-first design. `packages/agent/` owns all core logic extracted from the extension with VS Code APIs replaced by Node.js equivalents. `packages/cli/` is a thin client that talks to the agent over HTTP on `localhost:9315`. The CLI auto-starts the agent daemon when needed.

**Tech Stack:** TypeScript, Node.js 18+, Express, Chokidar, Commander, Ora, Chalk, Gradient-string

**Spec:** `docs/superpowers/specs/2026-03-18-worktrace-cli-agent-design.md`

---

## File Structure

### Root

- Create: `package.json` — npm workspaces root
- Create: `tsconfig.base.json` — shared TS config

### Agent Package (`packages/agent/`)

- Create: `packages/agent/package.json`
- Create: `packages/agent/tsconfig.json`
- Create: `packages/agent/src/core/types.ts` — extracted from `extension/src/types.ts` (no changes)
- Create: `packages/agent/src/core/constants.ts` — extracted from `extension/src/constants.ts` + `WATCHER_IGNORED_GLOBS`
- Create: `packages/agent/src/core/file-utils.ts` — extracted, `vscode.workspace.fs` → `fs/promises`
- Create: `packages/agent/src/core/git.ts` — extracted, accept `workspacePath` param
- Create: `packages/agent/src/core/delta-builder.ts` — extracted, no vscode deps
- Create: `packages/agent/src/core/analysis.ts` — extracted, `userNote` as plain param
- Create: `packages/agent/src/core/safety-monitor.ts` — extracted, drop `showSafetyNotifications()`
- Create: `packages/agent/src/core/memory.ts` — extracted, no changes
- Create: `packages/agent/src/core/session-store.ts` — extracted, `vscode.workspace.fs` → `fs/promises`
- Create: `packages/agent/src/core/renderer.ts` — extracted, no changes
- Create: `packages/agent/src/core/continuity.ts` — extracted, no changes
- Create: `packages/agent/src/watcher.ts` — new, chokidar file watcher
- Create: `packages/agent/src/session-state.ts` — new, in-memory session state manager
- Create: `packages/agent/src/auth.ts` — new, token storage/refresh/backend calls
- Create: `packages/agent/src/server.ts` — new, Express HTTP server
- Create: `packages/agent/src/daemon.ts` — new, daemon spawn/PID/health
- Create: `packages/agent/src/routes/health.ts` — new
- Create: `packages/agent/src/routes/session.ts` — new
- Create: `packages/agent/src/routes/context.ts` — new
- Create: `packages/agent/src/routes/history.ts` — new
- Create: `packages/agent/src/routes/safety.ts` — new
- Create: `packages/agent/src/routes/auth.ts` — new
- Create: `packages/agent/src/routes/card.ts` — new
- Create: `packages/agent/src/routes/profile.ts` — new

### CLI Package (`packages/cli/`)

- Create: `packages/cli/package.json`
- Create: `packages/cli/tsconfig.json`
- Create: `packages/cli/src/index.ts` — entry point, commander setup
- Create: `packages/cli/src/agent-client.ts` — HTTP client to agent
- Create: `packages/cli/src/output.ts` — Matrix terminal effects, colors, boxes
- Create: `packages/cli/src/messages.ts` — personality message pools
- Create: `packages/cli/src/commands/start.ts`
- Create: `packages/cli/src/commands/end.ts`
- Create: `packages/cli/src/commands/status.ts`
- Create: `packages/cli/src/commands/context.ts`
- Create: `packages/cli/src/commands/history.ts`
- Create: `packages/cli/src/commands/check.ts`
- Create: `packages/cli/src/commands/note.ts`
- Create: `packages/cli/src/commands/login.ts`
- Create: `packages/cli/src/commands/card.ts`

### Backend Change

- Modify: `backend/src/routes/auth.ts` — add `redirect` query param support to client-side JS

---

## Task 1: Monorepo Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `packages/agent/package.json`
- Create: `packages/agent/tsconfig.json`
- Create: `packages/cli/package.json`
- Create: `packages/cli/tsconfig.json`

- [ ] **Step 1: Create root `package.json` with npm workspaces**

```json
{
  "name": "worktrace-monorepo",
  "private": true,
  "workspaces": [
    "packages/agent",
    "packages/cli"
  ]
}
```

- [ ] **Step 2: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "outDir": "dist"
  }
}
```

- [ ] **Step 3: Create `packages/agent/package.json`**

```json
{
  "name": "@worktrace/agent",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "dist/server.js",
  "exports": {
    ".": "./dist/server.js",
    "./daemon": "./dist/daemon.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc -w"
  },
  "dependencies": {
    "express": "^4.21.2",
    "chokidar": "^4.0.3",
    "open": "^10.1.0",
    "chalk": "^5.4.1"
  },
  "devDependencies": {
    "@types/express": "^5.0.0",
    "@types/node": "^22.0.0",
    "typescript": "^5.7.0"
  }
}
```

- [ ] **Step 4: Create `packages/agent/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src"]
}
```

- [ ] **Step 5: Create `packages/cli/package.json`**

```json
{
  "name": "worktrace",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "worktrace": "dist/index.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc -w"
  },
  "dependencies": {
    "@worktrace/agent": "*",
    "commander": "^13.1.0",
    "ora": "^8.1.1",
    "chalk": "^5.4.1",
    "gradient-string": "^3.0.0",
    "cli-table3": "^0.6.5",
    "boxen": "^8.0.1"
  },
  "devDependencies": {
    "@types/gradient-string": "^1.1.6",
    "@types/node": "^22.0.0",
    "typescript": "^5.7.0"
  }
}
```

- [ ] **Step 6: Create `packages/cli/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src"]
}
```

- [ ] **Step 7: Create directory structure**

```bash
mkdir -p packages/agent/src/{core,routes}
mkdir -p packages/cli/src/commands
```

- [ ] **Step 8: Install dependencies**

```bash
npm install
```

- [ ] **Step 9: Verify workspaces resolve**

```bash
npm ls --workspaces
```

- [ ] **Step 10: Commit**

```bash
git add package.json tsconfig.base.json packages/agent/package.json packages/agent/tsconfig.json packages/cli/package.json packages/cli/tsconfig.json
git commit -m "feat: scaffold monorepo with agent and CLI packages"
```

---

## Task 2: Extract Core Types and Constants

**Files:**
- Create: `packages/agent/src/core/types.ts` — from `extension/src/types.ts`
- Create: `packages/agent/src/core/constants.ts` — from `extension/src/constants.ts`

**ESM import note (applies to ALL extraction tasks 2-6):** The extension uses CommonJS-style imports (`import * as path from "path"`). The agent package uses `"type": "module"` (ESM). When extracting, update all imports:
- `import * as path from "path"` → `import path from 'node:path'`
- `import * as fs from "fs"` → `import fs from 'node:fs'`
- `import * as os from "os"` → `import os from 'node:os'`
- All local imports must use `.js` extensions: `import { X } from './types.js'`

- [ ] **Step 1: Copy `types.ts` verbatim**

Copy `extension/src/types.ts` to `packages/agent/src/core/types.ts`. This file has zero vscode dependencies — direct copy, update import style to ESM if needed.

- [ ] **Step 2: Verify no vscode imports in types.ts**

```bash
grep -n "vscode" packages/agent/src/core/types.ts
```
Expected: no matches.

- [ ] **Step 3: Copy `constants.ts` and add watcher globs**

Copy `extension/src/constants.ts` to `packages/agent/src/core/constants.ts`. Then add the `WATCHER_IGNORED_GLOBS` array after the existing `EXCLUDED_PATTERNS`:

```typescript
export const WATCHER_IGNORED_GLOBS = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/.next/**',
  '**/out/**',
  '**/target/**',
  '**/coverage/**',
  '**/.git/**',
  '**/sessions/**',
  '**/.worktrace/**',
  '**/.env*',
  '**/*.min.js',
  '**/*.map',
  '**/package-lock.json',
  '**/yarn.lock',
  '**/pnpm-lock.yaml',
  '**/.gradle/**',
  '**/__pycache__/**',
  '**/venv/**',
  '**/.venv/**',
  '**/vendor/**',
  '**/.hardhat/**',
  '**/cache/**',
  '**/*.bundle.js',
  '**/go.sum',
  '**/Cargo.lock',
  '**/artifacts/**',
];
```

- [ ] **Step 4: Verify build compiles**

```bash
cd packages/agent && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/agent/src/core/types.ts packages/agent/src/core/constants.ts
git commit -m "feat: extract types and constants into agent core"
```

---

## Task 3: Extract File Utils (VS Code Decoupling)

**Files:**
- Create: `packages/agent/src/core/file-utils.ts` — from `extension/src/file-utils.ts`

- [ ] **Step 1: Copy `file-utils.ts` and replace vscode APIs**

Copy `extension/src/file-utils.ts` to `packages/agent/src/core/file-utils.ts`. Make these changes:

1. Remove `import * as vscode from 'vscode';`
2. Add `import { readFile } from 'fs/promises';` and `import path from 'path';`
3. Replace `readFileContent()`:
   - Remove `vscode.Uri.file(filePath)` and `vscode.workspace.fs.readFile(uri)`
   - Use `await readFile(filePath, 'utf-8')` instead
   - Keep the same `MAX_FILE_CONTENT_LENGTH` truncation logic
4. Replace `findAffectedFiles()`:
   - The `execFile` call to `git grep` stays the same (already uses `child_process`)
   - Remove the `cwd` parameter if it was derived from vscode — accept `workspacePath: string` as a parameter

- [ ] **Step 2: Verify no vscode imports remain**

```bash
grep -n "vscode" packages/agent/src/core/file-utils.ts
```
Expected: no matches.

- [ ] **Step 3: Verify build compiles**

```bash
cd packages/agent && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add packages/agent/src/core/file-utils.ts
git commit -m "feat: extract file-utils with Node.js fs/promises"
```

---

## Task 4: Extract Git Module (VS Code Decoupling)

**Files:**
- Create: `packages/agent/src/core/git.ts` — from `extension/src/git.ts`

- [ ] **Step 1: Copy `git.ts` and replace vscode APIs**

Copy `extension/src/git.ts` to `packages/agent/src/core/git.ts`. Make these changes:

1. Remove `import * as vscode from 'vscode';`
2. Delete `getGitDiffCwd()` function entirely (it reads `vscode.workspace.workspaceFolders`)
3. Change `getGitDiff()` signature to accept `workspacePath: string` — pass it directly as the `cwd` option to `execFile`
4. Change `getCurrentBranch()` signature to accept `workspacePath: string` — pass it as `cwd`
5. `parseGitDiffByFile()` has no vscode deps — keep as-is
6. Fix `/dev/null` cross-platform: replace the hardcoded `/dev/null` in untracked file diff with: `const devNull = process.platform === 'win32' ? 'NUL' : '/dev/null';`

- [ ] **Step 2: Verify no vscode imports remain**

```bash
grep -n "vscode" packages/agent/src/core/git.ts
```
Expected: no matches.

- [ ] **Step 3: Verify build compiles**

```bash
cd packages/agent && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add packages/agent/src/core/git.ts
git commit -m "feat: extract git module with workspacePath parameter"
```

---

## Task 5: Extract Delta Builder, Analysis, Safety Monitor

**Files:**
- Create: `packages/agent/src/core/delta-builder.ts`
- Create: `packages/agent/src/core/analysis.ts`
- Create: `packages/agent/src/core/safety-monitor.ts`

- [ ] **Step 1: Copy `delta-builder.ts` verbatim**

Copy `extension/src/delta-builder.ts` to `packages/agent/src/core/delta-builder.ts`. No vscode deps. Fix import paths to reference local `./types`, `./file-utils`, `./constants`.

- [ ] **Step 2: Copy `analysis.ts` and decouple vscode**

Copy `extension/src/analysis.ts` to `packages/agent/src/core/analysis.ts`. Changes:

1. Remove `import * as vscode from 'vscode';`
2. Change `analyzeSession()` signature: remove `extensionContext: vscode.ExtensionContext` parameter, add `userNote: string | null` parameter
3. Replace line that reads `extensionContext.workspaceState.get<string[]>("sessionNotes", [])` — use the `userNote` parameter directly:
   ```typescript
   const noteText = userNote || null;
   ```
4. Fix import paths to reference local `./types`, `./delta-builder`, `./git`, `./file-utils`

- [ ] **Step 3: Copy `safety-monitor.ts` and remove UI function**

Copy `extension/src/safety-monitor.ts` to `packages/agent/src/core/safety-monitor.ts`. Changes:

1. Remove `import * as vscode from 'vscode';`
2. Delete `showSafetyNotifications()` function (it uses `vscode.window.showWarningMessage`)
3. Keep `runSafetyCheck()` and `buildUnsafePatterns()` — they have no vscode deps
4. Fix import paths

- [ ] **Step 4: Verify no vscode imports**

```bash
grep -rn "vscode" packages/agent/src/core/delta-builder.ts packages/agent/src/core/analysis.ts packages/agent/src/core/safety-monitor.ts
```
Expected: no matches.

- [ ] **Step 5: Verify build compiles**

```bash
cd packages/agent && npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add packages/agent/src/core/delta-builder.ts packages/agent/src/core/analysis.ts packages/agent/src/core/safety-monitor.ts
git commit -m "feat: extract delta-builder, analysis, and safety-monitor"
```

---

## Task 6: Extract Memory, Session Store, Renderer, Continuity

**Files:**
- Create: `packages/agent/src/core/memory.ts`
- Create: `packages/agent/src/core/session-store.ts`
- Create: `packages/agent/src/core/renderer.ts`
- Create: `packages/agent/src/core/continuity.ts`

- [ ] **Step 1: Copy `memory.ts` verbatim**

Copy `extension/src/memory.ts` to `packages/agent/src/core/memory.ts`. No vscode deps. Fix import paths.

- [ ] **Step 2: Copy `renderer.ts` verbatim**

Copy `extension/src/renderer.ts` to `packages/agent/src/core/renderer.ts`. No vscode deps. Fix import paths.

- [ ] **Step 3: Copy `continuity.ts` verbatim**

Copy `extension/src/continuity.ts` to `packages/agent/src/core/continuity.ts`. No vscode deps. Fix import paths.

- [ ] **Step 4: Copy `session-store.ts` and replace vscode APIs**

Copy `extension/src/session-store.ts` to `packages/agent/src/core/session-store.ts`. Changes:

1. Add `linesAdded: number` and `linesRemoved: number` fields to the `StoredSession` interface (these are new fields not in the extension — needed for card generation to have accurate line counts without re-running git diff)
2. Remove `import * as vscode from 'vscode';`
2. Add `import { readFile, writeFile, mkdir } from 'fs/promises';` and `import path from 'path';`
3. Replace `ensureDirectory()`:
   - Remove `vscode.workspace.fs.createDirectory(vscode.Uri.file(dir))`
   - Use `await mkdir(dir, { recursive: true })`
4. Replace `loadSessions()`:
   - Remove `vscode.workspace.fs.readFile(vscode.Uri.file(this.filePath))`
   - Use `await readFile(this.filePath, 'utf-8')`
   - Catch `ENOENT` errors (file doesn't exist) → return `[]`
5. Replace file writes in `saveSession()`:
   - Remove `vscode.workspace.fs.writeFile(vscode.Uri.file(this.filePath), Buffer.from(...))`
   - Use `await writeFile(this.filePath, JSON.stringify(sessions, null, 2))`
6. Change `saveSession()` signature from `(session: SessionData, analysis: SessionAnalysis, safetyWarnings: SafetyWarning[])` to `(stored: StoredSession)` — the agent routes build the `StoredSession` object directly (including `linesAdded`/`linesRemoved`). Update the method body: remove the internal `StoredSession` construction, just push `stored` directly onto the sessions array.

- [ ] **Step 5: Verify no vscode imports**

```bash
grep -rn "vscode" packages/agent/src/core/memory.ts packages/agent/src/core/renderer.ts packages/agent/src/core/continuity.ts packages/agent/src/core/session-store.ts
```
Expected: no matches.

- [ ] **Step 6: Verify build compiles**

```bash
cd packages/agent && npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add packages/agent/src/core/memory.ts packages/agent/src/core/renderer.ts packages/agent/src/core/continuity.ts packages/agent/src/core/session-store.ts
git commit -m "feat: extract memory, renderer, continuity, session-store"
```

---

## Task 7: File Watcher and Session State Manager

**Files:**
- Create: `packages/agent/src/watcher.ts`
- Create: `packages/agent/src/session-state.ts`

- [ ] **Step 1: Create `session-state.ts` — in-memory session manager**

```typescript
import path from 'path';
import os from 'os';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { SessionData, FileEventType } from './core/types.js';

interface ActiveSession {
  data: SessionData;
  notes: string[];
}

const activeSessions = new Map<string, ActiveSession>();
const ACTIVE_SESSIONS_FILE = path.join(os.homedir(), '.worktrace', 'active-sessions.json');

async function persistActiveSessions(): Promise<void> {
  const entries = Array.from(activeSessions.entries()).map(([k, v]) => ({
    workspacePath: k,
    sessionId: v.data.sessionId,
    startTime: v.data.startTime,
    branch: v.data.branch,
  }));
  await mkdir(path.dirname(ACTIVE_SESSIONS_FILE), { recursive: true });
  await writeFile(ACTIVE_SESSIONS_FILE, JSON.stringify(entries, null, 2));
}

export function startSession(workspacePath: string, branch: string | null): SessionData {
  const absPath = path.resolve(workspacePath);
  if (activeSessions.has(absPath)) {
    throw new Error(`Session already active for ${absPath}`);
  }
  const session: SessionData = {
    sessionId: `wt_${Date.now().toString(36)}`,
    workspacePath: absPath,
    startTime: new Date().toISOString(),
    endTime: null,
    filesTouched: [],
    saveCounts: {},
    fileChangeEvents: [],
    gitDiff: null,
    branch,
  };
  activeSessions.set(absPath, { data: session, notes: [] });
  persistActiveSessions().catch(() => {});
  return session;
}

export function getSession(workspacePath: string): ActiveSession | undefined {
  return activeSessions.get(path.resolve(workspacePath));
}

export function addFileEvent(workspacePath: string, file: string, eventType: FileEventType): void {
  const session = activeSessions.get(path.resolve(workspacePath));
  if (!session) return;
  const relativePath = path.relative(session.data.workspacePath, file);
  session.data.fileChangeEvents.push({
    file: relativePath,
    eventType,
    timestamp: new Date().toISOString(),
  });
  if (!session.data.filesTouched.includes(relativePath)) {
    session.data.filesTouched.push(relativePath);
  }
  if (eventType === 'save') {
    session.data.saveCounts[relativePath] = (session.data.saveCounts[relativePath] || 0) + 1;
  }
}

export function addNote(workspacePath: string, note: string): string[] {
  const session = activeSessions.get(path.resolve(workspacePath));
  if (!session) throw new Error('No active session');
  session.notes.push(note);
  return session.notes;
}

export function endSession(workspacePath: string): ActiveSession {
  const absPath = path.resolve(workspacePath);
  const session = activeSessions.get(absPath);
  if (!session) throw new Error('No active session');
  session.data.endTime = new Date().toISOString();
  activeSessions.delete(absPath);
  persistActiveSessions().catch(() => {});
  return session;
}

export function getActiveSessions(): Map<string, ActiveSession> {
  return activeSessions;
}
```

- [ ] **Step 2: Create `watcher.ts` — chokidar file watcher**

```typescript
import chokidar from 'chokidar';
import path from 'path';
import { WATCHER_IGNORED_GLOBS } from './core/constants.js';
import { addFileEvent } from './session-state.js';

const watchers = new Map<string, chokidar.FSWatcher>();

export function startWatcher(workspacePath: string): void {
  const absPath = path.resolve(workspacePath);
  if (watchers.has(absPath)) return;

  const watcher = chokidar.watch(absPath, {
    ignored: WATCHER_IGNORED_GLOBS,
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
  });

  watcher.on('add', (filePath) => {
    addFileEvent(absPath, filePath, 'create');
  });

  watcher.on('change', (filePath) => {
    addFileEvent(absPath, filePath, 'save');
  });

  watcher.on('unlink', (filePath) => {
    addFileEvent(absPath, filePath, 'delete');
  });

  watchers.set(absPath, watcher);
}

export async function stopWatcher(workspacePath: string): Promise<void> {
  const absPath = path.resolve(workspacePath);
  const watcher = watchers.get(absPath);
  if (watcher) {
    await watcher.close();
    watchers.delete(absPath);
  }
}

export async function stopAllWatchers(): Promise<void> {
  for (const [, watcher] of watchers) {
    await watcher.close();
  }
  watchers.clear();
}
```

- [ ] **Step 3: Verify build compiles**

```bash
cd packages/agent && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add packages/agent/src/watcher.ts packages/agent/src/session-state.ts
git commit -m "feat: add file watcher and session state manager"
```

---

## Task 8: Agent Auth Module

**Files:**
- Create: `packages/agent/src/auth.ts`

- [ ] **Step 1: Create auth module with token storage and refresh**

This module handles:
- Reading/writing `~/.worktrace/credentials.json` and `~/.worktrace/config.json`
- Firebase token refresh via REST API
- Backend API calls with Bearer auth
- OAuth login flow (temporary local HTTP server + browser open)

```typescript
import { readFile, writeFile, mkdir, chmod } from 'fs/promises';
import path from 'path';
import os from 'os';
import http from 'http';
import open from 'open';

const WORKTRACE_DIR = path.join(os.homedir(), '.worktrace');
const CREDENTIALS_FILE = path.join(WORKTRACE_DIR, 'credentials.json');
const CONFIG_FILE = path.join(WORKTRACE_DIR, 'config.json');

interface Credentials {
  idToken: string;
  refreshToken: string;
  userId: string;
  email: string;
  expiresAt: number;
}

interface Config {
  backendUrl: string;
  firebaseApiKey?: string;
}

async function ensureDir(): Promise<void> {
  await mkdir(WORKTRACE_DIR, { recursive: true });
}

export async function getConfig(): Promise<Config> {
  const defaultUrl = process.env.WORKTRACE_BACKEND_URL || 'https://api.worktrace.dev';
  try {
    const raw = await readFile(CONFIG_FILE, 'utf-8');
    return { backendUrl: defaultUrl, ...JSON.parse(raw) };
  } catch {
    return { backendUrl: defaultUrl };
  }
}

async function saveConfig(config: Config): Promise<void> {
  await ensureDir();
  await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export async function getCredentials(): Promise<Credentials | null> {
  try {
    const raw = await readFile(CREDENTIALS_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function saveCredentials(creds: Credentials): Promise<void> {
  await ensureDir();
  await writeFile(CREDENTIALS_FILE, JSON.stringify(creds, null, 2));
  try { await chmod(CREDENTIALS_FILE, 0o600); } catch { /* Windows no-op */ }
}

export async function isAuthenticated(): Promise<boolean> {
  const creds = await getCredentials();
  return creds !== null;
}

async function ensureFirebaseApiKey(): Promise<string> {
  const config = await getConfig();
  if (config.firebaseApiKey) return config.firebaseApiKey;
  const res = await fetch(`${config.backendUrl}/api/config`);
  const data = await res.json() as { firebaseApiKey?: string };
  if (data.firebaseApiKey) {
    config.firebaseApiKey = data.firebaseApiKey;
    await saveConfig(config);
    return data.firebaseApiKey;
  }
  throw new Error('Could not fetch Firebase API key from backend');
}

export async function refreshTokenIfNeeded(): Promise<string> {
  const creds = await getCredentials();
  if (!creds) throw new Error('Not authenticated');
  if (Date.now() < creds.expiresAt - 60_000) return creds.idToken;

  const apiKey = await ensureFirebaseApiKey();
  const res = await fetch(`https://securetoken.googleapis.com/v1/token?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=refresh_token&refresh_token=${creds.refreshToken}`,
  });
  if (!res.ok) throw new Error('Token refresh failed');
  const data = await res.json() as { id_token: string; refresh_token: string; expires_in: string };
  creds.idToken = data.id_token;
  creds.refreshToken = data.refresh_token;
  creds.expiresAt = Date.now() + parseInt(data.expires_in, 10) * 1000;
  await saveCredentials(creds);
  return creds.idToken;
}

export async function callBackend(method: string, path: string, body?: unknown): Promise<Response> {
  const config = await getConfig();
  const token = await refreshTokenIfNeeded();
  return fetch(`${config.backendUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

export async function callBackendBuffer(method: string, urlPath: string, body?: unknown): Promise<Buffer> {
  const res = await callBackend(method, urlPath, body);
  if (!res.ok) throw new Error(`Backend error: ${res.status}`);
  const arrayBuf = await res.arrayBuffer();
  return Buffer.from(arrayBuf);
}

export async function login(): Promise<{ email: string; userId: string }> {
  const config = await getConfig();

  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      if (!req.url?.startsWith('/callback')) {
        res.writeHead(404);
        res.end();
        return;
      }
      const url = new URL(req.url, `http://localhost`);
      const idToken = url.searchParams.get('idToken');
      const refreshToken = url.searchParams.get('refreshToken');
      const email = url.searchParams.get('email');
      const userId = url.searchParams.get('userId');

      if (!idToken || !refreshToken || !email || !userId) {
        res.writeHead(400);
        res.end('Missing parameters');
        reject(new Error('Incomplete auth callback'));
        server.close();
        return;
      }

      await saveCredentials({
        idToken,
        refreshToken,
        userId,
        email,
        expiresAt: Date.now() + 3600_000,
      });

      // Register user with backend
      try {
        await callBackend('POST', '/api/user/register', { email });
      } catch { /* non-critical */ }

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html><body><h2>Signed in! You can close this tab.</h2></body></html>');
      server.close();
      resolve({ email, userId });
    });

    server.listen(0, '127.0.0.1', async () => {
      const port = (server.address() as { port: number }).port;
      const redirectUrl = `http://localhost:${port}/callback`;
      const authUrl = `${config.backendUrl}/api/auth/google?redirect=${encodeURIComponent(redirectUrl)}`;
      await open(authUrl);
    });

    setTimeout(() => {
      server.close();
      reject(new Error('Auth timed out after 120 seconds'));
    }, 120_000);
  });
}
```

- [ ] **Step 2: Verify build compiles**

```bash
cd packages/agent && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add packages/agent/src/auth.ts
git commit -m "feat: add agent auth module with login, token refresh, backend calls"
```

---

## Task 9: Agent HTTP Server and Routes

**Files:**
- Create: `packages/agent/src/server.ts`
- Create: `packages/agent/src/routes/health.ts`
- Create: `packages/agent/src/routes/session.ts`
- Create: `packages/agent/src/routes/context.ts`
- Create: `packages/agent/src/routes/history.ts`
- Create: `packages/agent/src/routes/safety.ts`
- Create: `packages/agent/src/routes/auth.ts`
- Create: `packages/agent/src/routes/card.ts`
- Create: `packages/agent/src/routes/profile.ts`

- [ ] **Step 1: Create `routes/health.ts`**

```typescript
import { Router } from 'express';
import { getActiveSessions } from '../session-state.js';

const router = Router();
const startTime = Date.now();

router.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    uptime: Math.floor((Date.now() - startTime) / 1000),
    version: '0.1.0',
    activeSessions: getActiveSessions().size,
  });
});

export default router;
```

- [ ] **Step 2: Create `routes/session.ts`**

This is the largest route — the session end handler orchestrates the full pipeline.

```typescript
import { Router } from 'express';
import path from 'path';
import { writeFile, mkdir, readFile } from 'fs/promises';
import { startSession, endSession, getSession, addNote, getActiveSessions } from '../session-state.js';
import { startWatcher, stopWatcher } from '../watcher.js';
import { getGitDiff, getCurrentBranch, parseGitDiffByFile } from '../core/git.js';
import { analyzeSession } from '../core/analysis.js';
import { runSafetyCheck } from '../core/safety-monitor.js';
import { SessionStore } from '../core/session-store.js';
import { renderSessionMemory } from '../core/renderer.js';
import { generateProjectContext } from '../core/continuity.js';
import { getSessionMemory } from '../core/memory.js';
import { isAuthenticated, callBackend, callBackendBuffer } from '../auth.js';
import { SUMMARY_FOLDER } from '../core/constants.js';

const router = Router();

// POST /session/start
router.post('/start', async (req, res) => {
  const { workspacePath } = req.body;
  if (!workspacePath) return res.status(400).json({ error: 'workspacePath required' });
  const absPath = path.resolve(workspacePath);
  try {
    const branch = await getCurrentBranch(absPath);
    const session = startSession(absPath, branch);
    startWatcher(absPath);
    res.json({ sessionId: session.sessionId, startTime: session.startTime, branch });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

// POST /session/end
router.post('/end', async (req, res) => {
  const { workspacePath, userNote } = req.body;
  if (!workspacePath) return res.status(400).json({ error: 'workspacePath required' });
  const absPath = path.resolve(workspacePath);

  try {
    // 1. Stop watcher, collect session data
    await stopWatcher(absPath);
    const { data: session, notes } = endSession(absPath);

    // 2. Git diff + branch
    const gitDiff = await getGitDiff(absPath);
    session.gitDiff = gitDiff;
    const branch = await getCurrentBranch(absPath);
    session.branch = branch;
    const diffFiles = parseGitDiffByFile(gitDiff || '');

    // 3. Merge notes: CLI end note + mid-session notes
    const allNotes = [...notes];
    if (userNote) allNotes.push(userNote);
    const mergedNote = allNotes.length > 0 ? allNotes.join('\n\n') : null;

    // 4. Run analysis
    const analysis = await analyzeSession(session, mergedNote);

    // 5. Safety check
    const safetyWarnings = runSafetyCheck(diffFiles);

    // 6. Persist to .worktrace/sessions.json
    const store = new SessionStore(absPath);
    await store.saveSession({
      id: session.sessionId,
      startTime: session.startTime,
      endTime: session.endTime || new Date().toISOString(),
      branch: session.branch,
      filesTouched: session.filesTouched,
      saveCounts: session.saveCounts,
      sessionMode: analysis.sessionMode,
      confidence: analysis.confidence.level,
      frictionPoints: analysis.frictionPoints,
      tomorrowChecklist: analysis.tomorrowChecklist,
      intentDescription: analysis.intentDescription,
      safetyWarningCount: safetyWarnings.length,
      linesAdded: diffFiles.reduce((sum, f) => sum + f.added, 0),
      linesRemoved: diffFiles.reduce((sum, f) => sum + f.removed, 0),
    });

    // 7. Load cross-session memory
    const memory = await getSessionMemory(store);
    const projectName = path.basename(absPath);

    // 8. Render local summary
    const sessionsDir = path.join(absPath, SUMMARY_FOLDER);
    await mkdir(sessionsDir, { recursive: true });

    let summaryMarkdown = renderSessionMemory({
      session, analysis, safetyWarnings, memory,
    });
    const now = new Date();
    const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`;
    const summaryFileName = `session-${timestamp}.md`;
    const summaryPath = path.join(sessionsDir, summaryFileName);

    // 9. Generate local project context
    let previousContext: string | null = null;
    const contextPath = path.join(sessionsDir, 'context.md');
    try { previousContext = await readFile(contextPath, 'utf-8'); } catch { /* first time */ }
    let contextMarkdown = generateProjectContext(memory, session, analysis, projectName, previousContext);

    // 10. Optional AI enhancement (if authenticated)
    let aiSummary = false;
    if (await isAuthenticated()) {
      const payload = { session, analysis };
      try {
        const [summaryRes, contextRes] = await Promise.allSettled([
          callBackend('POST', '/api/session/summarize', payload),
          callBackend('POST', '/api/session/context', { ...payload, previousContext }),
        ]);

        if (summaryRes.status === 'fulfilled' && summaryRes.value.ok) {
          const data = await summaryRes.value.json() as { markdown: string };
          if (data.markdown) { summaryMarkdown = data.markdown; aiSummary = true; }
        }
        if (contextRes.status === 'fulfilled' && contextRes.value.ok) {
          const data = await contextRes.value.json() as { context: string };
          if (data.context) { contextMarkdown = data.context; }
        }

        // 11. Generate card if AI summary succeeded
        if (aiSummary) {
          try {
            const linesAdded = diffFiles.reduce((s, f) => s + f.added, 0);
            const linesRemoved = diffFiles.reduce((s, f) => s + f.removed, 0);
            const png = await callBackendBuffer('POST', '/api/card/generate', {
              date: now.toISOString().split('T')[0],
              branch,
              linesAdded,
              linesRemoved,
              filesChanged: session.filesTouched.length,
            });
            const cardPath = path.join(sessionsDir, `${now.toISOString().split('T')[0]}_card.png`);
            await writeFile(cardPath, png);
          } catch { /* card generation is non-critical */ }
        }
      } catch { /* backend calls are non-critical */ }
    }

    // 12. Write files
    await writeFile(summaryPath, summaryMarkdown);
    await writeFile(contextPath, contextMarkdown);

    res.json({
      summaryPath: path.relative(absPath, summaryPath),
      contextPath: path.relative(absPath, contextPath),
      safetyWarnings,
      aiSummary,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /session/note
router.post('/note', (req, res) => {
  const { workspacePath, note } = req.body;
  if (!workspacePath || !note) return res.status(400).json({ error: 'workspacePath and note required' });
  try {
    const notes = addNote(path.resolve(workspacePath), note);
    res.json({ notes });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

// GET /session/status
router.get('/status', (req, res) => {
  const workspace = req.query.workspace as string;
  if (!workspace) return res.status(400).json({ error: 'workspace required' });
  const session = getSession(path.resolve(workspace));
  if (!session) return res.json({ active: false });
  const data = session.data;
  const durationMs = Date.now() - new Date(data.startTime).getTime();
  res.json({
    active: true,
    sessionId: data.sessionId,
    duration: durationMs,
    filesTouched: data.filesTouched.length,
    totalSaves: Object.values(data.saveCounts).reduce((a, b) => a + b, 0),
    branch: data.branch,
    events: data.fileChangeEvents.length,
    notes: session.notes.length,
  });
});

export default router;
```

- [ ] **Step 3: Create `routes/context.ts`**

```typescript
import { Router } from 'express';
import { readFile } from 'fs/promises';
import path from 'path';

const router = Router();

router.get('/', async (req, res) => {
  const workspace = req.query.workspace as string;
  if (!workspace) return res.status(400).json({ error: 'workspace required' });
  const contextPath = path.join(path.resolve(workspace), 'sessions', 'context.md');
  try {
    const content = await readFile(contextPath, 'utf-8');
    res.json({ context: content });
  } catch {
    res.json({ context: null });
  }
});

export default router;
```

- [ ] **Step 4: Create `routes/history.ts`**

```typescript
import { Router } from 'express';
import path from 'path';
import { SessionStore } from '../core/session-store.js';

const router = Router();

router.get('/', async (req, res) => {
  const workspace = req.query.workspace as string;
  const query = req.query.query as string | undefined;
  const limit = parseInt(req.query.limit as string || '10', 10);
  if (!workspace) return res.status(400).json({ error: 'workspace required' });

  const store = new SessionStore(path.resolve(workspace));
  const allSessions = await store.loadSessions();

  let results = allSessions;
  if (query) {
    const q = query.toLowerCase();
    results = allSessions.filter(s =>
      s.filesTouched.some(f => f.toLowerCase().includes(q)) ||
      s.branch?.toLowerCase().includes(q) ||
      s.sessionMode?.toLowerCase().includes(q) ||
      s.intentDescription?.toLowerCase().includes(q)
    );
  }

  res.json({ sessions: results.slice(-limit).reverse() });
});

export default router;
```

- [ ] **Step 5: Create `routes/safety.ts`**

```typescript
import { Router } from 'express';
import path from 'path';
import { getGitDiff, parseGitDiffByFile } from '../core/git.js';
import { runSafetyCheck } from '../core/safety-monitor.js';

const router = Router();

router.post('/', async (req, res) => {
  const { workspacePath } = req.body;
  if (!workspacePath) return res.status(400).json({ error: 'workspacePath required' });

  const absPath = path.resolve(workspacePath);
  const gitDiff = await getGitDiff(absPath);
  const diffFiles = parseGitDiffByFile(gitDiff || '');
  const warnings = runSafetyCheck(diffFiles);
  res.json({ warnings });
});

export default router;
```

- [ ] **Step 6: Create `routes/auth.ts`**

```typescript
import { Router } from 'express';
import { login, isAuthenticated, getCredentials } from '../auth.js';
import { callBackend } from '../auth.js';

const router = Router();

router.post('/login', async (_req, res) => {
  try {
    const result = await login();
    res.json(result);
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
  res.json({ authenticated: true, email: creds?.email, displayName });
});

export default router;
```

- [ ] **Step 7: Create `routes/card.ts`**

```typescript
import { Router } from 'express';
import path from 'path';
import { writeFile, mkdir } from 'fs/promises';
import { callBackendBuffer, isAuthenticated } from '../auth.js';
import { SessionStore } from '../core/session-store.js';

const router = Router();

router.post('/', async (req, res) => {
  const { workspacePath, date } = req.body;
  if (!workspacePath) return res.status(400).json({ error: 'workspacePath required' });
  if (!(await isAuthenticated())) return res.status(401).json({ error: 'Not authenticated' });

  const absPath = path.resolve(workspacePath);
  const cardDate = date || new Date().toISOString().split('T')[0];

  // Get session stats from local store
  const store = new SessionStore(absPath);
  const sessions = await store.loadSessions();
  const todaySessions = sessions.filter(s =>
    s.startTime.startsWith(cardDate)
  );

  let linesAdded = 0, linesRemoved = 0, filesChanged = 0;
  let branch: string | null = null;
  for (const s of todaySessions) {
    linesAdded += s.linesAdded || 0;
    linesRemoved += s.linesRemoved || 0;
    filesChanged += s.filesTouched.length;
    branch = branch || s.branch;
  }

  const png = await callBackendBuffer('POST', '/api/card/generate', {
    date: cardDate,
    branch,
    linesAdded,
    linesRemoved,
    filesChanged,
  });

  const sessionsDir = path.join(absPath, 'sessions');
  await mkdir(sessionsDir, { recursive: true });
  const cardPath = path.join(sessionsDir, `${cardDate}_card.png`);
  await writeFile(cardPath, png);
  res.json({ cardPath });
});

export default router;
```

- [ ] **Step 8: Create `routes/profile.ts`**

```typescript
import { Router } from 'express';
import { callBackend, isAuthenticated } from '../auth.js';

const router = Router();

router.patch('/', async (req, res) => {
  if (!(await isAuthenticated())) return res.status(401).json({ error: 'Not authenticated' });
  const { displayName } = req.body;
  const result = await callBackend('PATCH', '/api/user/profile', { displayName });
  const data = await result.json();
  res.json(data);
});

export default router;
```

- [ ] **Step 9: Create `server.ts` — Express server wiring**

```typescript
import express from 'express';
import healthRouter from './routes/health.js';
import sessionRouter from './routes/session.js';
import contextRouter from './routes/context.js';
import historyRouter from './routes/history.js';
import safetyRouter from './routes/safety.js';
import authRouter from './routes/auth.js';
import cardRouter from './routes/card.js';
import profileRouter from './routes/profile.js';
import { stopAllWatchers } from './watcher.js';

const app = express();
app.use(express.json({ limit: '10mb' }));

app.use('/health', healthRouter);
app.use('/session', sessionRouter);
app.use('/context', contextRouter);
app.use('/history', historyRouter);
app.use('/safety/check', safetyRouter);
app.use('/auth', authRouter);
app.use('/card/generate', cardRouter);
app.use('/profile', profileRouter);

const PORT = parseInt(process.env.WORKTRACE_AGENT_PORT || '9315', 10);

const server = app.listen(PORT, '127.0.0.1', () => {
  console.log(`worktrace-agent listening on 127.0.0.1:${PORT}`);
});

async function shutdown(): Promise<void> {
  console.log('Shutting down...');
  await stopAllWatchers();
  server.close();
  // Remove PID file
  const { unlink } = await import('fs/promises');
  const { join } = await import('path');
  const { homedir } = await import('os');
  try { await unlink(join(homedir(), '.worktrace', 'agent.pid')); } catch { /* ignore */ }
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
if (process.platform === 'win32') {
  process.on('SIGBREAK' as NodeJS.Signals, shutdown);
}

export default app;
```

- [ ] **Step 10: Verify build compiles**

```bash
cd packages/agent && npx tsc --noEmit
```

- [ ] **Step 11: Commit**

```bash
git add packages/agent/src/server.ts packages/agent/src/routes/
git commit -m "feat: add agent HTTP server with all routes"
```

---

## Task 10: Agent Daemon Manager

**Files:**
- Create: `packages/agent/src/daemon.ts`

- [ ] **Step 1: Create `daemon.ts` — spawn/manage daemon process**

```typescript
import { spawn } from 'child_process';
import { readFile, writeFile, mkdir } from 'fs/promises';
import path from 'path';
import os from 'os';

const WORKTRACE_DIR = path.join(os.homedir(), '.worktrace');
const PID_FILE = path.join(WORKTRACE_DIR, 'agent.pid');
const LOG_FILE = path.join(WORKTRACE_DIR, 'agent.log');
const PORT = parseInt(process.env.WORKTRACE_AGENT_PORT || '9315', 10);

export function getAgentUrl(): string {
  return `http://127.0.0.1:${PORT}`;
}

export async function isAgentRunning(): Promise<boolean> {
  try {
    const res = await fetch(`${getAgentUrl()}/health`, { signal: AbortSignal.timeout(2000) });
    const data = await res.json() as { status?: string };
    return data.status === 'ok';
  } catch {
    return false;
  }
}

export async function ensureAgent(): Promise<void> {
  if (await isAgentRunning()) return;

  await mkdir(WORKTRACE_DIR, { recursive: true });

  const serverPath = path.join(path.dirname(new URL(import.meta.url).pathname), 'server.js');
  const isWindows = process.platform === 'win32';

  const child = spawn(process.execPath, [serverPath], {
    detached: true,
    stdio: ['ignore', 'ignore', 'ignore'],
    ...(isWindows ? { shell: true } : {}),
    env: { ...process.env, WORKTRACE_AGENT_PORT: String(PORT) },
  });

  child.unref();
  await writeFile(PID_FILE, String(child.pid));

  // Wait for agent to be ready (up to 3s)
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 100));
    if (await isAgentRunning()) return;
  }

  throw new Error('Failed to start worktrace agent');
}
```

- [ ] **Step 2: Verify build compiles**

```bash
cd packages/agent && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add packages/agent/src/daemon.ts
git commit -m "feat: add daemon manager for agent lifecycle"
```

---

## Task 11: CLI Output Module (Matrix Terminal Aesthetics)

**Files:**
- Create: `packages/cli/src/output.ts`
- Create: `packages/cli/src/messages.ts`

- [ ] **Step 1: Create `messages.ts` — personality message pools**

```typescript
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export const startMessages = [
  'the matrix sees your code now.',
  'jacking in. signal locked.',
  'trace initialized. the watchers are live.',
  "you're in. make it count.",
  'connection established. tracking active.',
];

export const endMessages = [
  'not bad. the machine remembers everything.',
  'session archived. the trace is permanent.',
  'logged, sealed, remembered. see you next time.',
  'the record is clean. or is it?',
  'another session in the book. the matrix grows.',
];

export const statusMessages = [
  'the system is watching. keep going.',
  "still tracing. you're doing fine.",
  'signal strong. session active.',
  'the watchers report: all systems nominal.',
];

export const safetyCleanMessages = [
  'scan complete. the codebase is clean. for now.',
  'no anomalies. the code checks out.',
  'all clear. the matrix approves.',
];

export const safetyWarningMessages = [
  "i'd fix those before someone else finds them.",
  'the scan found something. you should look.',
  'red flags detected. your call, operator.',
  'anomalies in the codebase. proceed with caution.',
];

export const cardMessages = [
  'your proof of work. share it with the world.',
  'the record speaks for itself.',
  'captured. timestamped. verified.',
];

export const historyMessages = (count: number) => [
  `${count} sessions recovered from the archive.`,
  `${count} traces found in the memory banks.`,
  `the archive holds ${count} records.`,
];

export const loginMessages = (name: string) => [
  `welcome back, ${name}. the system recognizes you.`,
  `identity confirmed. hello, ${name}.`,
  `${name} authenticated. access granted.`,
];

export function pickMessage(pool: string[]): string {
  return pick(pool);
}
```

- [ ] **Step 2: Create `output.ts` — Matrix terminal effects**

```typescript
import chalk from 'chalk';
import ora, { type Ora } from 'ora';
import gradient from 'gradient-string';
import Table from 'cli-table3';
import boxen from 'boxen';

const MATRIX_GREEN = '#00FF41';
const DIM_GREEN = '#0D4D1A';
const AMBER = '#FFB000';
const RED = '#FF0040';
const WHITE = '#D0D0D0';

export const noEffects = (): boolean =>
  process.env.NO_COLOR !== undefined ||
  process.argv.includes('--no-color') ||
  process.argv.includes('--json') ||
  process.env.TERM === 'dumb';

export const isJson = (): boolean => process.argv.includes('--json');

// Color helpers
export const g = chalk.hex(MATRIX_GREEN);
export const w = chalk.hex(AMBER);
export const r = chalk.hex(RED);
export const d = chalk.dim;
export const white = chalk.hex(WHITE);
export const dimGreen = chalk.hex(DIM_GREEN);

// Typing effect — char-by-char with delay
export async function typeText(text: string, delay = 20): Promise<void> {
  if (noEffects()) { console.log(text); return; }
  for (const char of text) {
    process.stdout.write(char);
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  process.stdout.write('\n');
}

// Matrix rain — brief green char cascade
export async function matrixRain(durationMs = 500): Promise<void> {
  if (noEffects()) return;
  const cols = Math.min(process.stdout.columns || 80, 40);
  const chars = 'アイウエオカキクケコサシスセソタチツテトナニヌネノABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const intervals = 50;
  const frames = Math.floor(durationMs / intervals);
  for (let f = 0; f < frames; f++) {
    let line = '';
    for (let c = 0; c < cols; c++) {
      line += Math.random() > 0.7 ? g(chars[Math.floor(Math.random() * chars.length)]) : ' ';
    }
    process.stdout.write('\r' + line);
    await new Promise(resolve => setTimeout(resolve, intervals));
  }
  process.stdout.write('\r' + ' '.repeat(cols) + '\r');
}

// Glitch text — flash random chars then resolve
export async function glitchText(text: string): Promise<void> {
  if (noEffects()) { console.log(text); return; }
  const glitchChars = '!@#$%^&*()_+-=[]{}|;:,.<>?';
  let garbled = '';
  for (let i = 0; i < text.length; i++) {
    garbled += text[i] === ' ' ? ' ' : glitchChars[Math.floor(Math.random() * glitchChars.length)];
  }
  process.stdout.write(g(garbled));
  await new Promise(resolve => setTimeout(resolve, 60));
  process.stdout.write('\r' + text + '\n');
}

// Spinner — preconfigured ora with Matrix green
export function spinner(text: string): Ora {
  if (noEffects()) {
    console.log(text);
    return ora({ text, isEnabled: false });
  }
  return ora({
    text: white(text),
    color: 'green',
    spinner: { interval: 80, frames: ['▰▱▱▱▱', '▰▰▱▱▱', '▰▰▰▱▱', '▰▰▰▰▱', '▰▰▰▰▰', '▱▰▰▰▰', '▱▱▰▰▰', '▱▱▱▰▰', '▱▱▱▱▰'] },
  }).start();
}

// Box — bordered panel
export function box(content: string, options?: { title?: string; borderColor?: string }): void {
  if (noEffects()) { console.log(content); return; }
  console.log(boxen(content, {
    padding: 1,
    borderStyle: 'round',
    borderColor: (options?.borderColor || 'green') as any,
    title: options?.title,
    titleAlignment: 'left',
  }));
}

// Table — cli-table3 with green borders
export function table(headers: string[], rows: string[][]): void {
  const t = new Table({
    head: headers.map(h => g(h)),
    style: { head: [], border: ['dim'] },
  });
  rows.forEach(row => t.push(row.map(cell => white(cell))));
  console.log(t.toString());
}

// Banner — gradient worktrace header
export function banner(): void {
  if (noEffects()) { console.log('worktrace'); return; }
  const worktrace = gradient(['#00FF41', '#00CED1'])('w o r k t r a c e');
  console.log(`\n  ${worktrace}`);
  console.log(d('  ' + '─'.repeat(17)));
}

// Personality message — dim green quoted text with typing
export async function personality(message: string): Promise<void> {
  if (noEffects()) { console.log(`> "${message}"`); return; }
  await typeText(dimGreen(`> "${message}"`), 15);
}

// Success/warning/error labels
export function success(text: string): void { console.log(g('✓ ') + white(text)); }
export function warn(text: string): void { console.log(w('⚠ ') + white(text)); }
export function error(text: string): void { console.log(r('✗ ') + white(text)); }

// JSON output helper
export function jsonOut(data: unknown): void { console.log(JSON.stringify(data, null, 2)); }
```

- [ ] **Step 3: Verify build compiles**

```bash
cd packages/cli && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/output.ts packages/cli/src/messages.ts
git commit -m "feat: add Matrix terminal aesthetics and personality messages"
```

---

## Task 12: CLI Agent Client and Entry Point

**Files:**
- Create: `packages/cli/src/agent-client.ts`
- Create: `packages/cli/src/index.ts`

- [ ] **Step 1: Create `agent-client.ts` — HTTP client to agent**

```typescript
import { ensureAgent, getAgentUrl } from '@worktrace/agent/daemon';

export async function agentFetch(path: string, options?: RequestInit): Promise<Response> {
  await ensureAgent();
  const url = `${getAgentUrl()}${path}`;
  const res = await fetch(url, options);
  return res;
}

export async function agentGet<T>(path: string): Promise<T> {
  const res = await agentFetch(path);
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error || `Agent error: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function agentPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await agentFetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(data.error || `Agent error: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function agentPatch<T>(path: string, body: unknown): Promise<T> {
  const res = await agentFetch(path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(data.error || `Agent error: ${res.status}`);
  }
  return res.json() as Promise<T>;
}
```

- [ ] **Step 2: Create `index.ts` — commander entry point with all commands**

```typescript
#!/usr/bin/env node
import { Command } from 'commander';
import { startCommand } from './commands/start.js';
import { endCommand } from './commands/end.js';
import { statusCommand } from './commands/status.js';
import { contextCommand } from './commands/context.js';
import { historyCommand } from './commands/history.js';
import { checkCommand } from './commands/check.js';
import { noteCommand } from './commands/note.js';
import { loginCommand } from './commands/login.js';
import { cardCommand } from './commands/card.js';

const program = new Command();

program
  .name('worktrace')
  .description('the operating system for AI-assisted dev')
  .version('0.1.0')
  .option('--no-color', 'Disable colors and animations')
  .option('--json', 'Output as JSON (no effects)');

program.addCommand(startCommand);
program.addCommand(endCommand);
program.addCommand(statusCommand);
program.addCommand(contextCommand);
program.addCommand(historyCommand);
program.addCommand(checkCommand);
program.addCommand(noteCommand);
program.addCommand(loginCommand);
program.addCommand(cardCommand);

program.parse();
```

- [ ] **Step 3: Create stub command files for compilation**

Create stub exports for all 9 command files so `index.ts` compiles. Each stub is a minimal Commander command that will be fleshed out in Tasks 13-15:

```typescript
// Template for each stub (e.g., packages/cli/src/commands/start.ts)
import { Command } from 'commander';
export const startCommand = new Command('start').description('Start tracking a session');
```

Create stubs for: `start.ts`, `end.ts`, `status.ts`, `context.ts`, `history.ts`, `check.ts`, `note.ts`, `login.ts`, `card.ts` — each exporting a named command (`startCommand`, `endCommand`, etc.) with just a name and description.

- [ ] **Step 4: Verify build compiles**

```bash
cd packages/cli && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/agent-client.ts packages/cli/src/index.ts packages/cli/src/commands/
git commit -m "feat: add CLI agent client, entry point, and command stubs"
```

---

## Task 13: CLI Commands — start, end, status, note

**Files:**
- Create: `packages/cli/src/commands/start.ts`
- Create: `packages/cli/src/commands/end.ts`
- Create: `packages/cli/src/commands/status.ts`
- Create: `packages/cli/src/commands/note.ts`

- [ ] **Step 1: Create `commands/start.ts`**

```typescript
import { Command } from 'commander';
import { agentPost } from '../agent-client.js';
import { matrixRain, banner, box, personality, isJson, jsonOut, g, white, d } from '../output.js';
import { startMessages, pickMessage } from '../messages.js';

export const startCommand = new Command('start')
  .description('Start tracking a session')
  .action(async () => {
    const cwd = process.cwd();
    const data = await agentPost<{ sessionId: string; startTime: string; branch: string | null }>('/session/start', { workspacePath: cwd });

    if (isJson()) { jsonOut(data); return; }

    await matrixRain(500);
    banner();

    const msg = pickMessage(startMessages);
    const content = [
      `   ${white(msg)}`,
      '',
      `   ${d('session:')}  ${g(data.sessionId)}`,
      `   ${d('branch:')}   ${g(data.branch || 'detached')}`,
      `   ${d('watching:')} ${g(cwd)}`,
      `   ${d('started:')}  ${g(new Date(data.startTime).toLocaleTimeString())}`,
    ].join('\n');

    box(content);
    await personality('every keystroke is being recorded.');
  });
```

- [ ] **Step 2: Create `commands/end.ts`**

```typescript
import { Command } from 'commander';
import { agentPost } from '../agent-client.js';
import { spinner, success, warn, error, personality, isJson, jsonOut, g, w, r, white, box } from '../output.js';
import { endMessages, pickMessage } from '../messages.js';

interface EndResponse {
  summaryPath: string;
  contextPath: string;
  safetyWarnings: Array<{ severity: string; message: string; file?: string; line?: number }>;
  aiSummary: boolean;
}

export const endCommand = new Command('end')
  .description('End session and generate summary')
  .option('-n, --note <text>', 'Add a note to the session')
  .action(async (opts) => {
    const cwd = process.cwd();

    if (isJson()) {
      const data = await agentPost<EndResponse>('/session/end', { workspacePath: cwd, userNote: opts.note });
      jsonOut(data);
      return;
    }

    const s = spinner('intercepting file events...');
    const data = await agentPost<EndResponse>('/session/end', { workspacePath: cwd, userNote: opts.note });
    s.stop();

    success(`summary written to ${g(data.summaryPath)}`);
    success(`context written to ${g(data.contextPath)}`);

    if (data.aiSummary) success('AI-enhanced summary generated');

    if (data.safetyWarnings.length > 0) {
      console.log('');
      const warningLines = data.safetyWarnings.map(sw => {
        const sev = sw.severity === 'critical' ? r('CRITICAL') : sw.severity === 'warning' ? w('WARNING') : white('INFO');
        const loc = sw.file ? ` ${white(sw.file)}${sw.line ? ':' + sw.line : ''}` : '';
        return `  ${sev}  ${white(sw.message)}${loc}`;
      }).join('\n');
      box(warningLines, { title: 'ANOMALIES', borderColor: 'yellow' });
    }

    console.log('');
    await personality(pickMessage(endMessages));
  });
```

- [ ] **Step 3: Create `commands/status.ts`**

```typescript
import { Command } from 'commander';
import { agentGet } from '../agent-client.js';
import { box, personality, isJson, jsonOut, g, d, white } from '../output.js';
import { statusMessages, pickMessage } from '../messages.js';

interface StatusResponse {
  active: boolean;
  sessionId?: string;
  duration?: number;
  filesTouched?: number;
  totalSaves?: number;
  branch?: string;
  events?: number;
  notes?: number;
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m ${String(sec).padStart(2, '0')}s`;
}

export const statusCommand = new Command('status')
  .description('Show current session stats')
  .action(async () => {
    const cwd = process.cwd();
    const data = await agentGet<StatusResponse>(`/session/status?workspace=${encodeURIComponent(cwd)}`);

    if (isJson()) { jsonOut(data); return; }

    if (!data.active) {
      console.log(d('no active session. run ') + g('worktrace start') + d('.'));
      return;
    }

    const content = [
      `  ${d('duration')}    ${g(formatDuration(data.duration || 0))}`,
      `  ${d('branch')}      ${g(data.branch || 'detached')}`,
      `  ${d('files')}       ${g(String(data.filesTouched))} ${d('touched')}`,
      `  ${d('saves')}       ${g(String(data.totalSaves))} ${d('total')}`,
      `  ${d('events')}      ${g(String(data.events))} ${d('captured')}`,
    ].join('\n');

    box(content, { title: 'SESSION ACTIVE', borderColor: 'green' });
    await personality(pickMessage(statusMessages));
  });
```

- [ ] **Step 4: Create `commands/note.ts`**

```typescript
import { Command } from 'commander';
import { agentPost } from '../agent-client.js';
import { success, isJson, jsonOut, g } from '../output.js';

export const noteCommand = new Command('note')
  .description('Add note to active session')
  .argument('<message>', 'Note text')
  .action(async (message: string) => {
    const cwd = process.cwd();
    const data = await agentPost<{ notes: string[] }>('/session/note', { workspacePath: cwd, note: message });

    if (isJson()) { jsonOut(data); return; }
    success(`note added. ${g(String(data.notes.length))} notes in this session.`);
  });
```

- [ ] **Step 5: Verify build compiles**

```bash
cd packages/cli && npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/commands/start.ts packages/cli/src/commands/end.ts packages/cli/src/commands/status.ts packages/cli/src/commands/note.ts
git commit -m "feat: add start, end, status, note CLI commands"
```

---

## Task 14: CLI Commands — context, history, check

**Files:**
- Create: `packages/cli/src/commands/context.ts`
- Create: `packages/cli/src/commands/history.ts`
- Create: `packages/cli/src/commands/check.ts`

- [ ] **Step 1: Create `commands/context.ts`**

```typescript
import { Command } from 'commander';
import { agentGet } from '../agent-client.js';
import { isJson, jsonOut } from '../output.js';

export const contextCommand = new Command('context')
  .description('Print project context (stdout, pipeable)')
  .action(async () => {
    const cwd = process.cwd();
    const data = await agentGet<{ context: string | null }>(`/context?workspace=${encodeURIComponent(cwd)}`);

    if (isJson()) { jsonOut(data); return; }

    if (data.context) {
      process.stdout.write(data.context);
    } else {
      console.log('No project context yet. End a session first.');
    }
  });
```

- [ ] **Step 2: Create `commands/history.ts`**

```typescript
import { Command } from 'commander';
import { agentGet } from '../agent-client.js';
import { table, box, personality, isJson, jsonOut, g, d } from '../output.js';
import { historyMessages, pickMessage } from '../messages.js';

interface StoredSession {
  id: string;
  startTime: string;
  endTime: string;
  branch: string | null;
  sessionMode: string;
  filesTouched: string[];
  linesAdded?: number;
  linesRemoved?: number;
}

function formatDurationShort(start: string, end: string): string {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m`;
}

export const historyCommand = new Command('history')
  .description('Browse past sessions')
  .option('-q, --query <search>', 'Search by keyword')
  .option('-l, --limit <n>', 'Max results', '10')
  .action(async (opts) => {
    const cwd = process.cwd();
    const params = new URLSearchParams({ workspace: cwd, limit: opts.limit });
    if (opts.query) params.set('query', opts.query);
    const data = await agentGet<{ sessions: StoredSession[] }>(`/history?${params}`);

    if (isJson()) { jsonOut(data); return; }

    if (data.sessions.length === 0) {
      console.log(d('the archive is empty. start your first session.'));
      return;
    }

    const headers = ['#', 'Date', 'Duration', 'Branch', 'Mode', 'Files', '+/-'];
    const rows = data.sessions.map((s, i) => [
      String(i + 1),
      s.startTime.split('T')[0],
      formatDurationShort(s.startTime, s.endTime),
      s.branch || 'detached',
      s.sessionMode || '-',
      String(s.filesTouched.length),
      `+${s.linesAdded || 0}/-${s.linesRemoved || 0}`,
    ]);

    table(headers, rows);
    const pool = historyMessages(data.sessions.length);
    await personality(pickMessage(pool));
  });
```

- [ ] **Step 3: Create `commands/check.ts`**

```typescript
import { Command } from 'commander';
import { agentPost } from '../agent-client.js';
import { spinner, box, personality, isJson, jsonOut, g, w, r, white, d } from '../output.js';
import { safetyCleanMessages, safetyWarningMessages, pickMessage } from '../messages.js';

interface SafetyWarning {
  severity: string;
  category: string;
  message: string;
  file?: string;
  line?: number;
  context?: string;
}

export const checkCommand = new Command('check')
  .description('Run safety scan on uncommitted changes')
  .action(async () => {
    const cwd = process.cwd();

    if (isJson()) {
      const data = await agentPost<{ warnings: SafetyWarning[] }>('/safety/check', { workspacePath: cwd });
      jsonOut(data);
      return;
    }

    const s = spinner('scanning for threats...');
    const data = await agentPost<{ warnings: SafetyWarning[] }>('/safety/check', { workspacePath: cwd });
    s.stop();

    if (data.warnings.length === 0) {
      console.log(g('✓ ') + white('no anomalies detected'));
      await personality(pickMessage(safetyCleanMessages));
      return;
    }

    const lines = data.warnings.map(sw => {
      const sev = sw.severity === 'critical' ? r('CRITICAL') : sw.severity === 'warning' ? w('WARNING') : d('INFO');
      const loc = sw.file ? `\n            ${white(sw.file)}${sw.line ? ':' + sw.line : ''}` : '';
      const ctx = sw.context ? `\n            ${d('> ' + sw.context.trim())}` : '';
      return `  ${sev}  ${white(sw.message)}${loc}${ctx}`;
    }).join('\n\n');

    box(lines, { title: 'ANOMALY DETECTED', borderColor: 'red' });
    await personality(pickMessage(safetyWarningMessages));
  });
```

- [ ] **Step 4: Verify build compiles**

```bash
cd packages/cli && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/commands/context.ts packages/cli/src/commands/history.ts packages/cli/src/commands/check.ts
git commit -m "feat: add context, history, check CLI commands"
```

---

## Task 15: CLI Commands — login, card

**Files:**
- Create: `packages/cli/src/commands/login.ts`
- Create: `packages/cli/src/commands/card.ts`

- [ ] **Step 1: Create `commands/login.ts`**

```typescript
import { Command } from 'commander';
import { agentPost } from '../agent-client.js';
import { spinner, success, personality, isJson, jsonOut } from '../output.js';
import { loginMessages, pickMessage } from '../messages.js';

export const loginCommand = new Command('login')
  .description('Sign in with Google')
  .action(async () => {
    if (isJson()) {
      const data = await agentPost<{ email: string; userId: string }>('/auth/login');
      jsonOut(data);
      return;
    }

    const s = spinner('opening secure channel...');
    s.text = 'browser launched — complete sign-in to authenticate.';

    const data = await agentPost<{ email: string; userId: string }>('/auth/login');
    s.stop();

    success('identity confirmed.');
    const name = data.email.split('@')[0];
    const pool = loginMessages(name);
    await personality(pickMessage(pool));
  });
```

- [ ] **Step 2: Create `commands/card.ts`**

```typescript
import { Command } from 'commander';
import { agentPost } from '../agent-client.js';
import { spinner, success, personality, isJson, jsonOut, g } from '../output.js';
import { cardMessages, pickMessage } from '../messages.js';

export const cardCommand = new Command('card')
  .description('Generate shareable session card')
  .option('--date <YYYY-MM-DD>', 'Card date (defaults to today)')
  .action(async (opts) => {
    const cwd = process.cwd();

    if (isJson()) {
      const data = await agentPost<{ cardPath: string }>('/card/generate', { workspacePath: cwd, date: opts.date });
      jsonOut(data);
      return;
    }

    const s = spinner('generating session card...');
    const data = await agentPost<{ cardPath: string }>('/card/generate', { workspacePath: cwd, date: opts.date });
    s.stop();

    success(`card saved to ${g(data.cardPath)}`);
    await personality(pickMessage(cardMessages));
  });
```

- [ ] **Step 3: Verify build compiles**

```bash
cd packages/cli && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/commands/login.ts packages/cli/src/commands/card.ts
git commit -m "feat: add login and card CLI commands"
```

---

## Task 16: Backend Auth Route Modification

**Files:**
- Modify: `backend/src/routes/auth.ts`

- [ ] **Step 1: Read the current auth route HTML template**

Read `backend/src/routes/auth.ts` and find the JavaScript block that constructs the callback URL. Look for the line that does:
```javascript
const callbackUrl = scheme + '://local.worktrace/auth-callback?' + params.toString();
```

- [ ] **Step 2: Add `redirect` query parameter support**

In the client-side JavaScript of the HTML template, modify the callback URL construction:

Before:
```javascript
const callbackUrl = scheme + '://local.worktrace/auth-callback?' + params.toString();
```

After:
```javascript
const urlParams = new URLSearchParams(window.location.search);
const redirectUrl = urlParams.get('redirect');
const callbackUrl = redirectUrl
  ? redirectUrl + '?' + params.toString()
  : scheme + '://local.worktrace/auth-callback?' + params.toString();
```

This checks for `redirect` first; if present, uses it directly. Otherwise falls back to the existing scheme-based construction. Extension behavior is unchanged.

- [ ] **Step 3: Test locally**

```bash
cd backend && npm run dev
```

Open `http://localhost:3000/api/auth/google?redirect=http://localhost:9999/callback` in browser. After sign-in, verify it redirects to `http://localhost:9999/callback?idToken=...` instead of `cursor://`.

- [ ] **Step 4: Commit**

```bash
cd backend && git add src/routes/auth.ts
git commit -m "feat: support redirect query param in auth page for CLI login"
```

---

## Task 17: Full Build, Link, and Smoke Test

**Files:** None new — integration testing only.

- [ ] **Step 1: Full monorepo build**

```bash
npm run --workspace=packages/agent build
npm run --workspace=packages/cli build
```
Expected: both compile without errors.

- [ ] **Step 2: Link CLI globally for testing**

```bash
cd packages/cli && npm link
```

- [ ] **Step 3: Smoke test — help screen**

```bash
worktrace --help
```
Expected: Matrix-styled help screen with all commands listed.

- [ ] **Step 4: Smoke test — start session**

```bash
cd /tmp && mkdir test-project && cd test-project && git init
worktrace start
```
Expected: Matrix rain animation → boxed output showing session ID, branch, watching path.

- [ ] **Step 5: Smoke test — status**

```bash
worktrace status
```
Expected: boxed status showing duration, branch, 0 files.

- [ ] **Step 6: Smoke test — make changes and check**

```bash
echo "hello" > test.txt && git add test.txt
worktrace check
```
Expected: safety scan output (likely clean scan message).

- [ ] **Step 7: Smoke test — add note**

```bash
worktrace note "Testing the CLI"
```
Expected: confirmation message.

- [ ] **Step 8: Smoke test — end session**

```bash
worktrace end -n "First CLI session"
```
Expected: step-by-step progress → summary written to `sessions/session-*.md`.

- [ ] **Step 9: Smoke test — verify output files**

```bash
ls sessions/
cat sessions/session-*.md | head -30
cat .worktrace/sessions.json | head -10
```
Expected: summary file exists with proper markdown content. sessions.json has one entry.

- [ ] **Step 10: Smoke test — history**

```bash
worktrace history
```
Expected: table showing the session we just ended.

- [ ] **Step 11: Smoke test — context**

```bash
worktrace context
```
Expected: raw markdown context output to stdout.

- [ ] **Step 12: Smoke test — JSON mode**

```bash
worktrace status --json
worktrace history --json
```
Expected: clean JSON output, no colors or animations.

- [ ] **Step 13: Cleanup test project**

```bash
rm -rf /tmp/test-project
```

- [ ] **Step 14: Commit any smoke-test fixes**

If any bugs were found during smoke testing, fix them and commit:
```bash
git add -A packages/
git commit -m "fix: smoke test fixes for CLI and agent"
```

---

## Task 18: Cross-Platform Verification

- [ ] **Step 1: Verify Windows path handling**

Review all `path.join()` and `path.resolve()` calls. Ensure no hardcoded `/` separators. Check `daemon.ts` uses `shell: true` on Windows.

- [ ] **Step 2: Verify line ending handling**

Check `git.ts` `parseGitDiffByFile()` handles `\r\n` line endings in diff output.

- [ ] **Step 3: Verify PID file handling on Windows**

Check that `process.kill(pid)` in daemon manager has a try/catch, and consider `taskkill /PID` fallback.

- [ ] **Step 4: Commit any cross-platform fixes**

```bash
git add -A packages/
git commit -m "fix: cross-platform compatibility (Windows paths, line endings, PID)"
```

---

## Task 19: Final Polish and Publish Prep

- [ ] **Step 1: Add shebang to CLI entry point**

Ensure `packages/cli/src/index.ts` starts with `#!/usr/bin/env node`

- [ ] **Step 2: Update root `package.json` for npm publish**

Add `"files"` field to the CLI's `package.json` to include only `dist/`. Add `"engines": { "node": ">=18.0.0" }`.

- [ ] **Step 3: Add `.gitignore` entries**

Add `packages/*/dist/` and `packages/*/node_modules/` to `.gitignore`.

- [ ] **Step 4: Final build and verify**

```bash
npm run --workspaces build
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: publish prep — shebang, files, engines, gitignore"
```
