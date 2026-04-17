# Worktrace Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pivot Worktrace from "OS for AI-assisted dev" into a focused v0.1 "Worktrace Report" — per-repo, per-worktree, per-feature AI spend breakdown with provider quota tracking, progress bars, pace calculations, and file change tracking.

**Architecture:** Delete ~60% of existing code (Backend/, Dashboard/, Landing/, session/safety/memory modules). Rebuild agent around CodexBar-style ProviderDescriptor + ProviderFetchStrategy + Host APIs architecture, backed by SQLite (better-sqlite3, WAL mode) for concurrent daemon + CLI reads. Rewrite CLI into 14 hierarchical commands. No cloud, no AI, no MCP — pure deterministic math.

**Tech Stack:** TypeScript ESM, npm-workspaces monorepo (`CLI/packages/agent`, `CLI/packages/cli`), Express 4, chokidar 4, better-sqlite3 11, commander 13, chalk 5, boxen 8, cli-table3, ora, vitest (new).

**Source spec:** `docs/superpowers/specs/2026-04-15-worktrace-report-design.md`

---

## Execution Rules

- **TDD is required** for pure logic: parsers, calculators (pace, runway), attribution math, renderers, sampler pattern matching, report-service aggregations. Write failing test → run → see fail → implement → run → see pass → commit.
- **Skip TDD** for pure scaffolding/deletion tasks (Phase 0 removals, directory creation, package.json edits, Express route registration glue) and obvious IO-heavy integrations where a test would just mock everything. These tasks commit once working.
- **One task = one commit.** Commit messages follow `feat:`, `refactor:`, `chore:`, `test:`, `fix:` prefixes.
- **Run from monorepo root** (`CLI/`) unless a task says otherwise.
- **After every task**, run `npm run build --workspaces` (from `CLI/`) to confirm the repo still type-checks before committing. If it fails, fix before moving on.
- **Never leave `any` in production code.** Explicit types on every exported boundary.
- **Work on branch** `feat/landing` (current). Do not rebase or branch; user will handle branching/merging.

---

## Test Runner Setup

Vitest is not yet installed. Task 0.7 adds it. Until Task 0.7 completes, do not attempt to run tests; just build-check with `npm run build --workspaces`.

After Task 0.7, tests live alongside source in `__tests__/` folders, e.g.:
- `CLI/packages/agent/src/providers/_shared/__tests__/fetch-pipeline.test.ts`
- `CLI/packages/agent/src/report/__tests__/pace.test.ts`

Run all tests from `CLI/`: `npm test --workspaces --if-present`.
Run a single test: `cd CLI/packages/agent && npx vitest run src/path/to/file.test.ts`.

---

## Phase 0 — Demolition (est. 0.5 day)

Clear out code that does not survive the pivot. No TDD; these tasks are pure removal + tooling setup. Every task ends with a build-check and commit.

### Task 0.1: Delete Backend/, Dashboard/, Landing/

**Files:**
- Delete: `Backend/` (entire directory)
- Delete: `Dashboard/` (entire directory)
- Delete: `Landing/` (entire directory)

- [ ] **Step 1: Confirm nothing in `CLI/` imports from those dirs**

Run from repo root:
```bash
grep -r "from '.*/Backend\|from '.*/Dashboard\|from '.*/Landing" CLI/ || echo "no imports"
```
Expected: `no imports`.

- [ ] **Step 2: Delete the three top-level dirs**

```bash
rm -rf Backend/ Dashboard/ Landing/
```

- [ ] **Step 3: Build-check**

```bash
cd CLI && npm run build --workspaces
```
Expected: build passes (these dirs were not workspaces).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove Backend, Dashboard, Landing for v0.1 pivot

Per spec 2026-04-15-worktrace-report-design.md section 3.1 — Firebase,
Vertex AI, cloud dashboard, and marketing site are all out of v0.1 scope."
```

### Task 0.2: Delete obsolete agent core files

**Files:**
- Delete: `CLI/packages/agent/src/core/analysis.ts`
- Delete: `CLI/packages/agent/src/core/continuity.ts`
- Delete: `CLI/packages/agent/src/core/delta-builder.ts`
- Delete: `CLI/packages/agent/src/core/memory.ts`
- Delete: `CLI/packages/agent/src/core/renderer.ts`
- Delete: `CLI/packages/agent/src/core/safety-monitor.ts`
- Delete: `CLI/packages/agent/src/core/session-store.ts`
- Delete: `CLI/packages/agent/src/auth.ts`
- Delete: `CLI/packages/agent/src/session-state.ts`

- [ ] **Step 1: Delete the files**

```bash
cd CLI/packages/agent/src
rm core/analysis.ts core/continuity.ts core/delta-builder.ts core/memory.ts core/renderer.ts core/safety-monitor.ts core/session-store.ts auth.ts session-state.ts
```

- [ ] **Step 2: Build will now fail; note which files still reference them**

```bash
cd ../../.. && npm run build --workspaces
```
Expected: TypeScript errors in `watcher.ts`, `server.ts`, `routes/*.ts`. That's fine — those are handled in later tasks. Record the failing imports (they're all to-be-deleted or to-be-rewritten modules).

- [ ] **Step 3: Commit (broken build acknowledged — deletion half)**

```bash
cd .. && git add -A
git commit -m "chore: remove obsolete agent core modules

Session analysis, continuity, delta-builder, memory, renderer,
safety-monitor, session-store, auth, session-state are all out of
v0.1 scope. Build will be restored in subsequent demolition tasks."
```

### Task 0.3: Delete obsolete agent routes

**Files:**
- Delete: `CLI/packages/agent/src/routes/auth.ts`
- Delete: `CLI/packages/agent/src/routes/card.ts`
- Delete: `CLI/packages/agent/src/routes/context.ts`
- Delete: `CLI/packages/agent/src/routes/history.ts`
- Delete: `CLI/packages/agent/src/routes/profile.ts`
- Delete: `CLI/packages/agent/src/routes/safety.ts`
- Delete: `CLI/packages/agent/src/routes/session.ts`
- Modify: `CLI/packages/agent/src/routes/health.ts` (keep as-is)
- Delete: `CLI/packages/agent/src/routes/usage.ts` (rewritten later in Phase 2)

- [ ] **Step 1: Delete the route files**

```bash
cd CLI/packages/agent/src/routes
rm auth.ts card.ts context.ts history.ts profile.ts safety.ts session.ts usage.ts
```

- [ ] **Step 2: Rewrite `server.ts` to only mount `/health` for now**

Replace entire contents of `CLI/packages/agent/src/server.ts` with:

```typescript
import express from 'express';
import healthRouter from './routes/health.js';
import { stopAllWatchers } from './watcher.js';

const app = express();
app.use(express.json({ limit: '10mb' }));

app.use('/health', healthRouter);

const PORT = parseInt(process.env.WORKTRACE_AGENT_PORT || '9315', 10);

const server = app.listen(PORT, '127.0.0.1', () => {
  console.log(`worktrace-agent listening on 127.0.0.1:${PORT}`);
});

async function shutdown(): Promise<void> {
  console.log('Shutting down...');
  await stopAllWatchers();
  server.close();
  const { unlink } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const { homedir } = await import('node:os');
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

- [ ] **Step 3: Neutralize `watcher.ts` temporarily**

Replace entire contents of `CLI/packages/agent/src/watcher.ts` with a pass-through stub (proper report-driven rewrite comes in Task 1.11):

```typescript
import { watch, type FSWatcher } from 'chokidar';
import path from 'node:path';

const watchers = new Map<string, FSWatcher>();

export function startWatcher(workspacePath: string): void {
  const absPath = path.resolve(workspacePath);
  if (watchers.has(absPath)) return;

  const IGNORED_SEGMENTS = new Set([
    'node_modules', 'dist', 'build', '.next', 'out', 'target', 'coverage',
    '.git', 'sessions', '.worktrace', '.gradle', '__pycache__', 'venv',
    '.venv', 'vendor', '.hardhat', 'cache', 'artifacts',
  ]);

  const watcher = watch(absPath, {
    ignored: (filePath: string) => {
      const rel = path.relative(absPath, filePath);
      if (!rel || rel === '.') return false;
      const segments = rel.split(path.sep);
      return segments.some(seg => IGNORED_SEGMENTS.has(seg));
    },
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
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

- [ ] **Step 4: Build-check**

```bash
cd ../../../..  # back to CLI/
npm run build --workspaces
```
Expected: agent builds. CLI still fails (commands reference deleted agent routes — handled in Task 0.5). Continue.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: strip agent routes and neutralize watcher for pivot

Remove session/auth/card/context/history/profile/safety routes and
the old usage route. Server now mounts only /health. Watcher retained
as chokidar setup shell; write path restored when SQLite lands."
```

### Task 0.4: Delete usage adapters, manager, cache, platform dir

**Files:**
- Delete: `CLI/packages/agent/src/usage/adapters/` (all 17 files)
- Delete: `CLI/packages/agent/src/usage/manager.ts`
- Delete: `CLI/packages/agent/src/usage/cache.ts`
- Delete: `CLI/packages/agent/src/usage/platform/` (all 5 files)
- Delete: `CLI/packages/agent/src/usage/types.ts` (replaced in Phase 1)

- [ ] **Step 1: Delete everything under `usage/`**

```bash
cd CLI/packages/agent/src
rm -rf usage/
```

- [ ] **Step 2: Build-check**

```bash
cd ../../.. && npm run build --workspaces
```
Expected: agent builds (server.ts no longer imports from usage). CLI still broken (handled next).

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: remove legacy usage module

17 flat adapters, manager, cache, platform/, and types.ts all replaced
by the new providers/ tree introduced in Phase 1."
```

### Task 0.5: Delete obsolete CLI commands

**Files:**
- Delete: `CLI/packages/cli/src/commands/card.ts`
- Delete: `CLI/packages/cli/src/commands/check.ts`
- Delete: `CLI/packages/cli/src/commands/context.ts`
- Delete: `CLI/packages/cli/src/commands/end.ts`
- Delete: `CLI/packages/cli/src/commands/history.ts`
- Delete: `CLI/packages/cli/src/commands/login.ts`
- Delete: `CLI/packages/cli/src/commands/note.ts`
- Delete: `CLI/packages/cli/src/commands/start.ts`
- Delete: `CLI/packages/cli/src/commands/status.ts`
- Keep: `CLI/packages/cli/src/commands/usage.ts` (will be rewired later)

- [ ] **Step 1: Delete 9 obsolete command files**

```bash
cd CLI/packages/cli/src/commands
rm card.ts check.ts context.ts end.ts history.ts login.ts note.ts start.ts status.ts
```

- [ ] **Step 2: Temporarily stub `index.ts` so CLI compiles**

Replace `CLI/packages/cli/src/index.ts` with a minimal skeleton that registers only `--version`, `--help`, and a no-op `usage` placeholder (full wiring in Task 1.13):

```typescript
#!/usr/bin/env node
import { Command } from 'commander';

const program = new Command();

program
  .name('worktrace')
  .description('Worktrace Report — local AI spend tracker')
  .version('0.1.0-dev');

program
  .command('usage')
  .description('Provider-level usage (stub — implemented in Phase 2)')
  .action(() => {
    console.log('worktrace usage: not yet implemented in the pivot');
    process.exit(0);
  });

program.parseAsync(process.argv).catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 3: Temporarily stub `agent-client.ts`**

Replace `CLI/packages/cli/src/agent-client.ts` with just the health + ensureAgent surface required by existing imports, wiping all session/auth/safety/card helpers. Content:

```typescript
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const AGENT_PORT = Number(process.env.WORKTRACE_AGENT_PORT || 9315);
const AGENT_BASE = `http://127.0.0.1:${AGENT_PORT}`;

export async function ensureAgent(): Promise<void> {
  if (await isHealthy()) return;
  spawnAgent();
  for (let i = 0; i < 30; i++) {
    await sleep(200);
    if (await isHealthy()) return;
  }
  throw new Error('Agent did not start within 6 seconds');
}

async function isHealthy(): Promise<boolean> {
  try {
    const res = await fetch(`${AGENT_BASE}/health`);
    return res.ok;
  } catch {
    return false;
  }
}

function spawnAgent(): void {
  const pkgRoot = join(homedir(), '.worktrace');
  const agentServer = process.env.WORKTRACE_AGENT_PATH
    ?? join(import.meta.dirname ?? '', '..', '..', 'agent', 'dist', 'server.js');
  if (!existsSync(agentServer)) {
    throw new Error(`Agent server.js not found at ${agentServer}`);
  }
  const child = spawn(process.execPath, [agentServer], {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, WORKTRACE_AGENT_PORT: String(AGENT_PORT) },
  });
  child.unref();
}

export async function agentGet<T>(path: string): Promise<T> {
  const res = await fetch(`${AGENT_BASE}${path}`);
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return (await res.json()) as T;
}

export async function agentPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${AGENT_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path} → ${res.status}`);
  return (await res.json()) as T;
}

export async function agentDelete<T>(path: string): Promise<T> {
  const res = await fetch(`${AGENT_BASE}${path}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`DELETE ${path} → ${res.status}`);
  return (await res.json()) as T;
}

export async function agentPatch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${AGENT_BASE}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PATCH ${path} → ${res.status}`);
  return (await res.json()) as T;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
```

- [ ] **Step 4: Temporarily stub `commands/usage.ts`**

Replace contents with a thin placeholder that will be rewired in Phase 2:

```typescript
export async function runUsage(): Promise<void> {
  console.log('worktrace usage: not yet implemented in the pivot');
}
```

- [ ] **Step 5: Simplify `messages.ts` and `output.ts` — keep only non-session strings/helpers**

Open `CLI/packages/cli/src/messages.ts` and `CLI/packages/cli/src/output.ts`, and for each:
  - Keep any ASCII art, color helpers, banner constants, and the Matrix theme palette
  - Delete every exported string/helper whose name contains `session`, `safety`, `card`, `continuity`, `memory`, `login`, `logout`, `note`, `end`, `start`, `history`, `auth`
  - If a file becomes empty after deletions, replace with `export {};` so it remains importable

Rule: anything not referenced by the new `index.ts` skeleton (which currently imports nothing from these files) is dead weight. Keep only utilities whose names suggest they're general-purpose (`matrix()`, `banner()`, `formatBytes()`, `tableHeader()`, etc.).

- [ ] **Step 6: Build-check**

```bash
cd ../../..  # back to CLI/
npm run build --workspaces
```
Expected: both workspaces compile cleanly.

- [ ] **Step 7: Smoke test CLI**

```bash
node packages/cli/dist/index.js --help
node packages/cli/dist/index.js --version
```
Expected: commander prints help and `0.1.0-dev`.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: strip obsolete CLI commands and stub entry

Remove card/check/context/end/history/login/note/start/status commands.
index.ts, agent-client.ts, messages.ts, output.ts, commands/usage.ts
reduced to minimal stubs so the monorepo builds. Real wiring lands in
Phase 1 task 1.13."
```

### Task 0.6: Extract `core/constants.ts` values; delete remainder of `core/`

**Files:**
- Read then delete: `CLI/packages/agent/src/core/constants.ts`, `CLI/packages/agent/src/core/types.ts`
- Create: `CLI/packages/agent/src/report/constants.ts` (populated in Task 1.1)
- Keep for now: `CLI/packages/agent/src/core/git.ts`, `CLI/packages/agent/src/core/file-utils.ts` (moved in Task 1.4)

- [ ] **Step 1: Read `core/constants.ts` and note values**

Run:
```bash
cat CLI/packages/agent/src/core/constants.ts
```
Paste the entire content into this task's working notes (commit message body below). The next plan task will re-create needed constants in the new location.

- [ ] **Step 2: Delete `core/constants.ts` and `core/types.ts`**

```bash
cd CLI/packages/agent/src
rm core/constants.ts core/types.ts
```

- [ ] **Step 3: Temporarily inline the one constant `watcher.ts` still needs**

Edit `CLI/packages/agent/src/watcher.ts` — delete the `import { WATCHER_IGNORED_GLOBS } from './core/constants.js'` line (the stub from Task 0.3 already inlined the segment set, but remove any lingering import).

Verify with:
```bash
grep -n "core/constants" CLI/packages/agent/src/watcher.ts || echo "clean"
```

- [ ] **Step 4: Build-check**

```bash
cd ../../.. && npm run build --workspaces
```
Expected: builds pass. `core/git.ts` and `core/file-utils.ts` remain; they're still used nowhere now, but harmless until Task 1.4 moves them.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove core/constants.ts and core/types.ts

Constants for the pivot will be redefined in report/constants.ts in
Phase 1. Domain types move to providers/_shared/types.ts and
report/db.ts. git.ts and file-utils.ts remain pending the Phase 1
move to report/."
```

### Task 0.7: Install vitest and add test scripts

**Files:**
- Modify: `CLI/packages/agent/package.json`
- Modify: `CLI/packages/cli/package.json`
- Create: `CLI/packages/agent/vitest.config.ts`
- Create: `CLI/packages/cli/vitest.config.ts`

- [ ] **Step 1: Install vitest in each workspace**

```bash
cd CLI
npm install --workspace=@worktrace/agent --save-dev vitest @vitest/coverage-v8
npm install --workspace=worktrace --save-dev vitest @vitest/coverage-v8
```

- [ ] **Step 2: Add `test` script to both package.json files**

In `CLI/packages/agent/package.json`, add to `scripts`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

Same additions in `CLI/packages/cli/package.json`.

- [ ] **Step 3: Create `vitest.config.ts` in each workspace**

Identical content for both `CLI/packages/agent/vitest.config.ts` and `CLI/packages/cli/vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/__tests__/**/*.test.ts'],
    environment: 'node',
    globals: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/__tests__/**'],
    },
  },
});
```

- [ ] **Step 4: Sanity-check a trivial test**

Create `CLI/packages/agent/src/__tests__/sanity.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';

describe('sanity', () => {
  it('runs vitest', () => {
    expect(1 + 1).toBe(2);
  });
});
```

Run:
```bash
cd CLI/packages/agent && npx vitest run
```
Expected: `1 passed`.

Delete the sanity test:
```bash
rm src/__tests__/sanity.test.ts
rmdir src/__tests__
```

- [ ] **Step 5: Commit**

```bash
cd ../.. && git add -A
git commit -m "chore: install vitest + coverage in both workspaces

Adds test runner scaffolding used by the TDD tasks in Phases 1-4.
Workspace-local configs colocate __tests__ folders next to sources."
```

---

## Phase 1 — Skeleton (est. 2-3 days)

Build the bones: SQLite schema, shared types, fetch-pipeline core, registry, host-API stubs, route stubs, and the CLI `watch` command wired end-to-end. No real provider work yet; stubs only.

### Task 1.1: Shared provider types

**Files:**
- Create: `CLI/packages/agent/src/providers/_shared/types.ts`
- Test: _none (type-only file)_

- [ ] **Step 1: Create the file with all shared type definitions**

`CLI/packages/agent/src/providers/_shared/types.ts`:

```typescript
export type ProviderId =
  | 'claude' | 'cursor' | 'codex' | 'copilot'
  | 'gemini' | 'augment' | 'kiro'
  | 'amp' | 'antigravity' | 'droid' | 'jetbrains'
  | 'kimi' | 'kimi-k2' | 'openrouter' | 'vertex' | 'zai';

export const ALL_PROVIDER_IDS: readonly ProviderId[] = [
  'claude', 'cursor', 'codex', 'copilot',
  'gemini', 'augment', 'kiro',
  'amp', 'antigravity', 'droid', 'jetbrains',
  'kimi', 'kimi-k2', 'openrouter', 'vertex', 'zai',
] as const;

export type FetchKind =
  | 'cli-rpc' | 'cli-pty' | 'oauth-http' | 'apikey-http'
  | 'cookies-http' | 'playwright-scrape' | 'local-log-scan'
  | 'local-config-scan' | 'keychain' | 'lsp-probe';

export type ProviderCategory = 'ide' | 'cli' | 'api' | 'cloud';

export interface ProviderMetadata {
  displayName: string;
  vendor: string;
  category: ProviderCategory;
  website: string;
}

export interface ProviderBranding {
  icon: string;
  accentColor: string;
}

export interface ProviderCapabilities {
  quotaBar: boolean;
  tokenBreakdown: boolean;
  costTracking: boolean;
  creditsBalance: boolean;
  sessionUsage: boolean;
  modelSelection: boolean;
}

export type QuotaUnit = 'requests' | 'tokens' | 'credits' | 'minutes';

export interface QuotaBar {
  used: number;
  cap: number;
  unit: QuotaUnit;
  resetsAt: Date;
}

export interface ExtraUsageBar {
  label: string;
  used: number;
  cap: number;
  unit: string;
}

export interface ProviderIdentity {
  email?: string;
  username?: string;
  plan?: string;
}

export interface UsageCostSummary {
  today: number;
  last30d: number;
  totalTokens: number;
}

export interface UsageSnapshot {
  session?: QuotaBar;
  weekly?: QuotaBar;
  secondary?: QuotaBar;
  inputTokens?: number;
  outputTokens?: number;
  costUSD?: number;
  creditsRemainingUSD?: number;
  extraUsage?: ExtraUsageBar;
  cost?: UsageCostSummary;
  updatedAt: Date;
  identity?: ProviderIdentity;
}

export interface ProviderCLIConfig {
  listLabel: string;
  detailSections: string[];
}

export interface Logger {
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
  debug(msg: string, meta?: Record<string, unknown>): void;
}

export interface HostAPIs {
  readonly http: import('../_host/http.js').HttpHost;
  readonly pty: import('../_host/pty.js').PtyHost;
  readonly keychain: import('../_host/keychain.js').KeychainHost;
  readonly browserCookies: import('../_host/browser-cookies.js').BrowserCookiesHost;
  readonly tokenCost: import('../_host/token-cost.js').TokenCostHost;
  readonly status: import('../_host/status.js').StatusHost;
  readonly processSampler: import('../_host/process-sampler.js').ProcessSamplerHost;
  readonly playwright: import('../_host/playwright.js').PlaywrightHost;
  readonly logger: Logger;
}

export interface FetchContext {
  readonly timeout: number;
  readonly cacheTTL: number;
  readonly logger: Logger;
  readonly hosts: HostAPIs;
}

export type FetchAttemptStatus = 'ok' | 'unavailable' | 'error';

export interface FetchAttempt {
  id: string;
  status: FetchAttemptStatus;
  error?: Error;
}

export interface ProviderFetchOutcome {
  snapshot: UsageSnapshot;
  attempts: FetchAttempt[];
  sourceLabel: FetchKind;
}

export interface ProviderFetchStrategy {
  readonly id: string;
  readonly kind: FetchKind;
  isAvailable(ctx: FetchContext): Promise<boolean>;
  fetch(ctx: FetchContext): Promise<UsageSnapshot>;
  shouldFallback(err: Error, ctx: FetchContext): boolean;
}

export interface StrategyPipeline {
  resolveStrategies(ctx: FetchContext): ProviderFetchStrategy[];
}

export interface ProviderFetchPlan {
  pipeline: StrategyPipeline;
  sampleIntervalMs: number;
  cacheMaxAgeMs: number;
}

export interface ProviderDescriptor {
  id: ProviderId;
  metadata: ProviderMetadata;
  branding: ProviderBranding;
  capabilities: ProviderCapabilities;
  fetchPlan: ProviderFetchPlan;
  cli: ProviderCLIConfig;
}

export class AllStrategiesFailedError extends Error {
  constructor(readonly providerId: ProviderId, readonly attempts: FetchAttempt[]) {
    super(`All strategies failed for provider ${providerId}`);
    this.name = 'AllStrategiesFailedError';
  }
}

export class TimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`Operation timed out after ${timeoutMs}ms`);
    this.name = 'TimeoutError';
  }
}
```

- [ ] **Step 2: Build-check** (deferred until Task 1.10 ships host stubs)

The `HostAPIs` interface imports from `../_host/*`. Those modules land in Task 1.10. Hold off committing until 1.1 + 1.2 + 1.3 + 1.10 are all green. Run `npm run build --workspaces` only to verify the syntax of this file — TypeScript will error on the missing imports; that is expected at this step.

### Task 1.2: Descriptor + strategy helpers

**Files:**
- Create: `CLI/packages/agent/src/providers/_shared/descriptor.ts`
- Create: `CLI/packages/agent/src/providers/_shared/fetch-strategy.ts`

- [ ] **Step 1: Create `descriptor.ts`**

```typescript
export type {
  ProviderDescriptor,
  ProviderMetadata,
  ProviderBranding,
  ProviderCapabilities,
  ProviderCLIConfig,
  ProviderFetchPlan,
  StrategyPipeline,
} from './types.js';

import type { ProviderDescriptor } from './types.js';

export function isProviderDescriptor(value: unknown): value is ProviderDescriptor {
  if (!value || typeof value !== 'object') return false;
  const d = value as Partial<ProviderDescriptor>;
  return typeof d.id === 'string' && !!d.metadata && !!d.branding
      && !!d.capabilities && !!d.fetchPlan && !!d.cli;
}

export function describeProvider(d: ProviderDescriptor): string {
  return `${d.metadata.displayName} [${d.id}]`;
}
```

- [ ] **Step 2: Create `fetch-strategy.ts`**

```typescript
export type {
  ProviderFetchStrategy,
  FetchContext,
  FetchKind,
  FetchAttempt,
  FetchAttemptStatus,
  ProviderFetchOutcome,
  UsageSnapshot,
  QuotaBar,
  QuotaUnit,
  ExtraUsageBar,
  ProviderIdentity,
  UsageCostSummary,
  Logger,
  HostAPIs,
} from './types.js';

export { AllStrategiesFailedError, TimeoutError } from './types.js';

import type { ProviderFetchStrategy, StrategyPipeline, FetchContext } from './types.js';

export function linearPipeline(strategies: ProviderFetchStrategy[]): StrategyPipeline {
  return {
    resolveStrategies(_ctx: FetchContext): ProviderFetchStrategy[] {
      return [...strategies];
    },
  };
}
```

- [ ] **Step 3:** Defer build-check until Task 1.10 (same reason as 1.1).

### Task 1.3: Fetch pipeline with TDD

**Files:**
- Create: `CLI/packages/agent/src/providers/_shared/fetch-pipeline.ts`
- Test: `CLI/packages/agent/src/providers/_shared/__tests__/fetch-pipeline.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { runPipeline, withTimeout } from '../fetch-pipeline.js';
import type {
  ProviderDescriptor, ProviderFetchStrategy, FetchContext, UsageSnapshot,
} from '../types.js';
import { AllStrategiesFailedError, TimeoutError } from '../types.js';

const NULL_CTX: FetchContext = {
  timeout: 100,
  cacheTTL: 0,
  logger: { info() {}, warn() {}, error() {}, debug() {} },
  hosts: {} as FetchContext['hosts'],
};

function makeDescriptor(strategies: ProviderFetchStrategy[]): ProviderDescriptor {
  return {
    id: 'claude',
    metadata: { displayName: 'Claude', vendor: 'Anthropic', category: 'cli', website: '' },
    branding: { icon: '', accentColor: '#000' },
    capabilities: {
      quotaBar: false, tokenBreakdown: false, costTracking: false,
      creditsBalance: false, sessionUsage: false, modelSelection: false,
    },
    fetchPlan: {
      pipeline: { resolveStrategies: () => strategies },
      sampleIntervalMs: 60_000,
      cacheMaxAgeMs: 60_000,
    },
    cli: { listLabel: 'Claude', detailSections: [] },
  };
}

function snap(): UsageSnapshot {
  return { updatedAt: new Date(0) };
}

describe('runPipeline', () => {
  it('returns the first successful strategy', async () => {
    const s1: ProviderFetchStrategy = {
      id: 's1', kind: 'cli-pty',
      isAvailable: async () => true,
      fetch: async () => snap(),
      shouldFallback: () => true,
    };
    const d = makeDescriptor([s1]);
    const out = await runPipeline(d, NULL_CTX);
    expect(out.sourceLabel).toBe('cli-pty');
    expect(out.attempts).toEqual([{ id: 's1', status: 'ok' }]);
  });

  it('skips unavailable strategies', async () => {
    const s1: ProviderFetchStrategy = {
      id: 's1', kind: 'cli-pty',
      isAvailable: async () => false,
      fetch: async () => { throw new Error('should not fetch'); },
      shouldFallback: () => true,
    };
    const s2: ProviderFetchStrategy = {
      id: 's2', kind: 'apikey-http',
      isAvailable: async () => true,
      fetch: async () => snap(),
      shouldFallback: () => true,
    };
    const out = await runPipeline(makeDescriptor([s1, s2]), NULL_CTX);
    expect(out.sourceLabel).toBe('apikey-http');
    expect(out.attempts).toEqual([
      { id: 's1', status: 'unavailable' },
      { id: 's2', status: 'ok' },
    ]);
  });

  it('falls back on error when shouldFallback returns true', async () => {
    const boom = new Error('boom');
    const s1: ProviderFetchStrategy = {
      id: 's1', kind: 'cli-pty',
      isAvailable: async () => true,
      fetch: async () => { throw boom; },
      shouldFallback: () => true,
    };
    const s2: ProviderFetchStrategy = {
      id: 's2', kind: 'apikey-http',
      isAvailable: async () => true,
      fetch: async () => snap(),
      shouldFallback: () => true,
    };
    const out = await runPipeline(makeDescriptor([s1, s2]), NULL_CTX);
    expect(out.sourceLabel).toBe('apikey-http');
    expect(out.attempts[0]).toMatchObject({ id: 's1', status: 'error', error: boom });
  });

  it('rethrows when shouldFallback returns false', async () => {
    const boom = new Error('fatal');
    const s1: ProviderFetchStrategy = {
      id: 's1', kind: 'cli-pty',
      isAvailable: async () => true,
      fetch: async () => { throw boom; },
      shouldFallback: () => false,
    };
    await expect(runPipeline(makeDescriptor([s1]), NULL_CTX)).rejects.toBe(boom);
  });

  it('throws AllStrategiesFailedError when the pipeline exhausts', async () => {
    const s1: ProviderFetchStrategy = {
      id: 's1', kind: 'cli-pty',
      isAvailable: async () => false,
      fetch: async () => snap(),
      shouldFallback: () => true,
    };
    await expect(runPipeline(makeDescriptor([s1]), NULL_CTX))
      .rejects.toBeInstanceOf(AllStrategiesFailedError);
  });
});

describe('withTimeout', () => {
  it('resolves when the inner promise beats the timer', async () => {
    const result = await withTimeout(Promise.resolve(42), 50);
    expect(result).toBe(42);
  });

  it('rejects with TimeoutError when the timer wins', async () => {
    const slow = new Promise<number>((r) => setTimeout(() => r(1), 50));
    await expect(withTimeout(slow, 5)).rejects.toBeInstanceOf(TimeoutError);
  });
});
```

- [ ] **Step 2: Run — fail**

```bash
cd CLI/packages/agent && npx vitest run src/providers/_shared/__tests__/fetch-pipeline.test.ts
```
Expected: FAIL (module missing). Note: may also fail to typecheck due to missing `_host` stubs; that's fine — the test file only requires types from `../types.js`, which exist.

- [ ] **Step 3: Implement `fetch-pipeline.ts`**

```typescript
import type {
  ProviderDescriptor,
  FetchContext,
  ProviderFetchOutcome,
  FetchAttempt,
} from './types.js';
import { AllStrategiesFailedError, TimeoutError } from './types.js';

export async function runPipeline(
  descriptor: ProviderDescriptor,
  ctx: FetchContext,
): Promise<ProviderFetchOutcome> {
  const attempts: FetchAttempt[] = [];

  for (const strategy of descriptor.fetchPlan.pipeline.resolveStrategies(ctx)) {
    const available = await strategy.isAvailable(ctx);
    if (!available) {
      attempts.push({ id: strategy.id, status: 'unavailable' });
      continue;
    }
    try {
      const snapshot = await withTimeout(strategy.fetch(ctx), ctx.timeout);
      attempts.push({ id: strategy.id, status: 'ok' });
      return { snapshot, attempts, sourceLabel: strategy.kind };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      attempts.push({ id: strategy.id, status: 'error', error });
      if (!strategy.shouldFallback(error, ctx)) throw error;
    }
  }
  throw new AllStrategiesFailedError(descriptor.id, attempts);
}

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(ms)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}
```

- [ ] **Step 4: Run — pass**

```bash
npx vitest run src/providers/_shared/__tests__/fetch-pipeline.test.ts
```
Expected: all 7 cases PASS.

- [ ] **Step 5: Hold commit until after Task 1.10** (types.ts still references missing host modules). Flag this as a pending-commit batch.

### Task 1.4: Move git.ts and file-utils.ts into `report/` + add `listWorktrees`

**Files:**
- Move: `CLI/packages/agent/src/core/git.ts` → `CLI/packages/agent/src/report/git.ts`
- Move: `CLI/packages/agent/src/core/file-utils.ts` → `CLI/packages/agent/src/report/file-utils.ts`
- Remove: empty `CLI/packages/agent/src/core/` directory
- Test: `CLI/packages/agent/src/report/__tests__/git.test.ts`

- [ ] **Step 1: Move the files (git-tracked move)**

```bash
cd CLI/packages/agent/src
mkdir -p report
git mv core/git.ts report/git.ts
git mv core/file-utils.ts report/file-utils.ts
rmdir core
```

- [ ] **Step 2: Read `report/git.ts` to confirm existing exports**

```bash
cat report/git.ts
```
Typical exports: `currentBranch(cwd)`, `repoRoot(cwd)`, `isGitRepo(cwd)`. Note which already exist so you don't duplicate when adding `listWorktrees`.

- [ ] **Step 3: Write the failing parser test**

`CLI/packages/agent/src/report/__tests__/git.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { parseWorktreeList } from '../git.js';

describe('parseWorktreeList', () => {
  it('parses porcelain worktree output', () => {
    const sample = [
      'worktree /Users/me/repo',
      'HEAD abc123',
      'branch refs/heads/main',
      '',
      'worktree /Users/me/repo-feat',
      'HEAD def456',
      'branch refs/heads/feat/x',
      '',
      'worktree /Users/me/detached',
      'HEAD 000999',
      'detached',
      '',
    ].join('\n');

    expect(parseWorktreeList(sample)).toEqual([
      { path: '/Users/me/repo', head: 'abc123', branch: 'main' },
      { path: '/Users/me/repo-feat', head: 'def456', branch: 'feat/x' },
      { path: '/Users/me/detached', head: '000999', branch: null },
    ]);
  });

  it('returns empty array for empty input', () => {
    expect(parseWorktreeList('')).toEqual([]);
  });
});
```

- [ ] **Step 4: Run — fails**

```bash
cd CLI/packages/agent && npx vitest run src/report/__tests__/git.test.ts
```
Expected: FAIL (`parseWorktreeList` undefined).

- [ ] **Step 5: Append to `report/git.ts`**

Add a subprocess helper (reuse existing `execFile`-based helper if present — do NOT introduce `child_process.exec`) and the parser:

```typescript
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
const execFileP = promisify(execFileCb);

export interface WorktreeInfo {
  path: string;
  head: string;
  branch: string | null;
}

export function parseWorktreeList(output: string): WorktreeInfo[] {
  const blocks = output.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  return blocks.map((block) => {
    const lines = block.split('\n');
    let path = '', head = '';
    let branch: string | null = null;
    for (const line of lines) {
      if (line.startsWith('worktree ')) path = line.slice('worktree '.length).trim();
      else if (line.startsWith('HEAD ')) head = line.slice('HEAD '.length).trim();
      else if (line.startsWith('branch ')) {
        const ref = line.slice('branch '.length).trim();
        branch = ref.replace(/^refs\/heads\//, '');
      } else if (line === 'detached') branch = null;
    }
    return { path, head, branch };
  }).filter((w) => w.path);
}

export async function listWorktrees(repoRoot: string): Promise<WorktreeInfo[]> {
  const { stdout } = await execFileP('git', ['worktree', 'list', '--porcelain'], {
    cwd: repoRoot,
  });
  return parseWorktreeList(stdout);
}

export async function currentBranch(repoRoot: string): Promise<string> {
  try {
    const { stdout } = await execFileP('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: repoRoot });
    return stdout.trim() || 'HEAD';
  } catch {
    return 'HEAD';
  }
}
```

If the file already defines `currentBranch`, skip that re-declaration — merge by hand, preferring the existing implementation if it uses `execFile`. If the legacy implementation uses shell-prone APIs, replace it with the one above (safer).

- [ ] **Step 6: Run — pass**

```bash
npx vitest run src/report/__tests__/git.test.ts
```
Expected: `2 passed`.

- [ ] **Step 7: Build-check (full workspace)**

```bash
cd ../.. && npm run build --workspaces
```
Expected: builds. core/ is empty and removed.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor(report): move git + file-utils from core; add listWorktrees

git.ts gains listWorktrees() and parseWorktreeList() for multi-worktree
tracking plus a currentBranch fallback. file-utils.ts relocated
unchanged. core/ directory removed."
```

### Task 1.5: `report/constants.ts`

**Files:**
- Create: `CLI/packages/agent/src/report/constants.ts`
- Modify: `CLI/packages/agent/src/watcher.ts` (import the shared segment set)

- [ ] **Step 1: Create constants file**

```typescript
export const AGENT_PORT = 9315;
export const AGENT_HOST = '127.0.0.1';

export const DB_FILENAME = 'report.db';
export const DB_BUSY_TIMEOUT_MS = 5000;

export const ACTIVITY_WINDOW_MS = 60_000;
export const PROVIDER_SAMPLE_INTERVAL_MS = 60_000;
export const FETCH_TIMEOUT_MS = 10_000;
export const FETCH_TOTAL_TIMEOUT_MS = 30_000;
export const CACHE_STALE_AFTER_MS = 5 * 60_000;

export const WATCHER_IGNORED_SEGMENTS: ReadonlySet<string> = new Set([
  'node_modules', 'dist', 'build', '.next', 'out', 'target', 'coverage',
  '.git', 'sessions', '.worktrace', '.gradle', '__pycache__', 'venv',
  '.venv', 'vendor', '.hardhat', 'cache', 'artifacts',
]);

export const PACE_WARN_DELTA_PCT = 5;
export const PACE_CRITICAL_DELTA_PCT = 15;

export const RECONCILIATION_DRIFT_TOLERANCE = 0.02;
```

- [ ] **Step 2: Update `watcher.ts` — swap the inlined ignored-segment set for the shared import**

Replace the local `IGNORED_SEGMENTS` constant inside `startWatcher` with a top-level `import { WATCHER_IGNORED_SEGMENTS } from './report/constants.js';`, and change the `ignored` callback's `IGNORED_SEGMENTS.has(seg)` to `WATCHER_IGNORED_SEGMENTS.has(seg)`.

- [ ] **Step 3: Build-check**

```bash
cd CLI && npm run build --workspaces
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(report): central constants + watcher uses shared ignore set

Daemon port, DB config, sampler/watcher intervals, pace thresholds,
and reconciliation tolerance all live in report/constants.ts now."
```

### Task 1.6: SQLite schema + migrations (`report/db.ts`)

**Files:**
- Create: `CLI/packages/agent/src/report/db.ts`
- Create: `CLI/packages/agent/src/report/__tests__/db.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, migrate, CURRENT_SCHEMA_VERSION } from '../db.js';

let tmpDirs: string[] = [];

function freshDbPath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'worktrace-db-'));
  tmpDirs.push(dir);
  return join(dir, 'report.db');
}

afterEach(() => {
  for (const dir of tmpDirs) {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
  tmpDirs = [];
});

describe('db.openDb + migrate', () => {
  it('creates the db file and applies schema_version', () => {
    const p = freshDbPath();
    const db = openDb(p);
    migrate(db);
    const row = db.prepare('SELECT version FROM schema_version LIMIT 1').get() as { version: number };
    expect(row.version).toBe(CURRENT_SCHEMA_VERSION);
    expect(existsSync(p)).toBe(true);
    db.close();
  });

  it('sets WAL journal mode', () => {
    const db = openDb(freshDbPath());
    migrate(db);
    const mode = db.pragma('journal_mode', { simple: true });
    expect(String(mode).toLowerCase()).toBe('wal');
    db.close();
  });

  it('creates all six domain tables', () => {
    const db = openDb(freshDbPath());
    migrate(db);
    const names = (db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all() as Array<{ name: string }>).map((r) => r.name);
    for (const t of ['activity_windows', 'attributions', 'file_changes', 'provider_samples', 'repos', 'worktrees']) {
      expect(names).toContain(t);
    }
    db.close();
  });

  it('is idempotent — running migrate twice keeps version stable', () => {
    const p = freshDbPath();
    const db = openDb(p);
    migrate(db);
    migrate(db);
    const count = (db.prepare('SELECT COUNT(*) AS n FROM schema_version').get() as { n: number }).n;
    expect(count).toBe(1);
    db.close();
  });
});
```

- [ ] **Step 2: Run — fails**

```bash
cd CLI/packages/agent && npx vitest run src/report/__tests__/db.test.ts
```

- [ ] **Step 3: Implement `report/db.ts`**

```typescript
import Database from 'better-sqlite3';
import type { Database as DB } from 'better-sqlite3';
import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import { DB_BUSY_TIMEOUT_MS } from './constants.js';

export const CURRENT_SCHEMA_VERSION = 1;

export function openDb(path: string): DB {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma(`busy_timeout = ${DB_BUSY_TIMEOUT_MS}`);
  db.pragma('foreign_keys = ON');
  return db;
}

export function migrate(db: DB): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY
    );
  `);
  const row = db.prepare('SELECT version FROM schema_version LIMIT 1')
    .get() as { version: number } | undefined;
  const current = row?.version ?? 0;
  if (current < 1) applyV1(db);
  if (current === 0) {
    db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(CURRENT_SCHEMA_VERSION);
  } else if (current < CURRENT_SCHEMA_VERSION) {
    db.prepare('UPDATE schema_version SET version = ?').run(CURRENT_SCHEMA_VERSION);
  }
}

function applyV1(db: DB): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS repos (
      id       INTEGER PRIMARY KEY,
      path     TEXT UNIQUE NOT NULL,
      name     TEXT NOT NULL,
      added_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS worktrees (
      id          INTEGER PRIMARY KEY,
      repo_id     INTEGER NOT NULL,
      path        TEXT UNIQUE NOT NULL,
      is_primary  INTEGER NOT NULL DEFAULT 1,
      detected_at INTEGER NOT NULL,
      FOREIGN KEY (repo_id) REFERENCES repos(id)
    );
    CREATE TABLE IF NOT EXISTS activity_windows (
      id               INTEGER PRIMARY KEY,
      window_start     INTEGER NOT NULL,
      window_end       INTEGER NOT NULL,
      worktree_id      INTEGER NOT NULL,
      branch           TEXT NOT NULL,
      file_event_count INTEGER NOT NULL,
      FOREIGN KEY (worktree_id) REFERENCES worktrees(id)
    );
    CREATE TABLE IF NOT EXISTS provider_samples (
      id                    INTEGER PRIMARY KEY,
      sampled_at            INTEGER NOT NULL,
      provider              TEXT NOT NULL,
      weekly_cap            INTEGER,
      weekly_used           INTEGER NOT NULL,
      resets_at             INTEGER NOT NULL,
      input_tokens_cum      INTEGER,
      output_tokens_cum     INTEGER,
      cost_cum_usd          REAL,
      credits_remaining_usd REAL
    );
    CREATE TABLE IF NOT EXISTS attributions (
      id               INTEGER PRIMARY KEY,
      attributed_at    INTEGER NOT NULL,
      provider         TEXT NOT NULL,
      worktree_id      INTEGER NOT NULL,
      branch           TEXT NOT NULL,
      input_tokens     INTEGER NOT NULL,
      output_tokens    INTEGER NOT NULL,
      cost_usd         REAL NOT NULL,
      source_sample_id INTEGER NOT NULL,
      FOREIGN KEY (worktree_id) REFERENCES worktrees(id),
      FOREIGN KEY (source_sample_id) REFERENCES provider_samples(id)
    );
    CREATE TABLE IF NOT EXISTS file_changes (
      id          INTEGER PRIMARY KEY,
      changed_at  INTEGER NOT NULL,
      worktree_id INTEGER NOT NULL,
      branch      TEXT NOT NULL,
      provider    TEXT,
      event_type  TEXT NOT NULL,
      file_path   TEXT NOT NULL,
      FOREIGN KEY (worktree_id) REFERENCES worktrees(id)
    );
    CREATE INDEX IF NOT EXISTS idx_activity_worktree
      ON activity_windows(worktree_id, window_start);
    CREATE INDEX IF NOT EXISTS idx_samples_provider
      ON provider_samples(provider, sampled_at);
    CREATE INDEX IF NOT EXISTS idx_attributions_worktree
      ON attributions(worktree_id, branch);
    CREATE INDEX IF NOT EXISTS idx_file_changes_worktree
      ON file_changes(worktree_id, branch);
  `);
}

let singleton: DB | null = null;

export function getDb(path: string): DB {
  if (singleton) return singleton;
  singleton = openDb(path);
  migrate(singleton);
  return singleton;
}

export function closeDb(): void {
  if (singleton) {
    singleton.close();
    singleton = null;
  }
}
```

- [ ] **Step 4: Run — pass**

```bash
npx vitest run src/report/__tests__/db.test.ts
```
Expected: `4 passed`.

- [ ] **Step 5: Commit**

```bash
cd ../../.. && git add -A
git commit -m "feat(report): SQLite schema v1 with WAL + migrations

openDb sets WAL/busy_timeout/foreign_keys. migrate applies six-table
v1 schema idempotently. Schema version tracked in schema_version."
```

### Task 1.7: Repo registry

**Files:**
- Create: `CLI/packages/agent/src/report/repo-registry.ts`
- Create: `CLI/packages/agent/src/report/__tests__/repo-registry.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Database as DB } from 'better-sqlite3';
import { openDb, migrate } from '../db.js';
import { addRepo, listRepos, getRepoById, getRepoByPath, removeRepo } from '../repo-registry.js';

let dir: string;
let db: DB;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'worktrace-reg-'));
  db = openDb(join(dir, 'report.db'));
  migrate(db);
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('repo-registry', () => {
  it('adds and retrieves a repo', () => {
    const r = addRepo(db, { path: '/home/a/repo1', name: 'repo1', addedAt: 1000 });
    expect(r.id).toBeGreaterThan(0);
    expect(getRepoById(db, r.id)).toEqual(r);
    expect(getRepoByPath(db, '/home/a/repo1')).toEqual(r);
  });

  it('is idempotent on duplicate path', () => {
    const a = addRepo(db, { path: '/home/a/repo1', name: 'repo1', addedAt: 1000 });
    const b = addRepo(db, { path: '/home/a/repo1', name: 'renamed', addedAt: 2000 });
    expect(b.id).toBe(a.id);
    expect(b.name).toBe('renamed');
    expect(listRepos(db).length).toBe(1);
  });

  it('removes a repo by id', () => {
    const r = addRepo(db, { path: '/x', name: 'x', addedAt: 1 });
    expect(removeRepo(db, r.id)).toBe(true);
    expect(listRepos(db)).toEqual([]);
    expect(removeRepo(db, r.id)).toBe(false);
  });

  it('lists repos sorted by added_at desc', () => {
    addRepo(db, { path: '/a', name: 'a', addedAt: 1 });
    addRepo(db, { path: '/b', name: 'b', addedAt: 3 });
    addRepo(db, { path: '/c', name: 'c', addedAt: 2 });
    expect(listRepos(db).map((r) => r.name)).toEqual(['b', 'c', 'a']);
  });
});
```

- [ ] **Step 2: Run — fails**

```bash
cd CLI/packages/agent && npx vitest run src/report/__tests__/repo-registry.test.ts
```

- [ ] **Step 3: Implement `repo-registry.ts`**

```typescript
import type { Database as DB } from 'better-sqlite3';

export interface Repo {
  id: number;
  path: string;
  name: string;
  addedAt: number;
}

export interface AddRepoInput {
  path: string;
  name: string;
  addedAt: number;
}

export function addRepo(db: DB, input: AddRepoInput): Repo {
  const existing = getRepoByPath(db, input.path);
  if (existing) {
    db.prepare('UPDATE repos SET name = ? WHERE id = ?').run(input.name, existing.id);
    return { ...existing, name: input.name };
  }
  const info = db.prepare(
    'INSERT INTO repos (path, name, added_at) VALUES (?, ?, ?)',
  ).run(input.path, input.name, input.addedAt);
  return {
    id: Number(info.lastInsertRowid),
    path: input.path,
    name: input.name,
    addedAt: input.addedAt,
  };
}

export function getRepoById(db: DB, id: number): Repo | null {
  const row = db.prepare('SELECT id, path, name, added_at FROM repos WHERE id = ?')
    .get(id) as { id: number; path: string; name: string; added_at: number } | undefined;
  return row ? { id: row.id, path: row.path, name: row.name, addedAt: row.added_at } : null;
}

export function getRepoByPath(db: DB, path: string): Repo | null {
  const row = db.prepare('SELECT id, path, name, added_at FROM repos WHERE path = ?')
    .get(path) as { id: number; path: string; name: string; added_at: number } | undefined;
  return row ? { id: row.id, path: row.path, name: row.name, addedAt: row.added_at } : null;
}

export function listRepos(db: DB): Repo[] {
  return (db.prepare('SELECT id, path, name, added_at FROM repos ORDER BY added_at DESC').all() as Array<{
    id: number; path: string; name: string; added_at: number;
  }>).map((r) => ({ id: r.id, path: r.path, name: r.name, addedAt: r.added_at }));
}

export function removeRepo(db: DB, id: number): boolean {
  const info = db.prepare('DELETE FROM repos WHERE id = ?').run(id);
  return info.changes > 0;
}
```

- [ ] **Step 4: Run — pass**

```bash
npx vitest run src/report/__tests__/repo-registry.test.ts
```

- [ ] **Step 5: Commit**

```bash
cd ../../.. && git add -A
git commit -m "feat(report): repo-registry CRUD against SQLite

addRepo idempotent on path (name-update behavior). listRepos sorts
by added_at desc. Four test cases cover CRUD + sort + idempotency."
```

### Task 1.8: Worktree scanner

**Files:**
- Create: `CLI/packages/agent/src/report/worktree-scanner.ts`
- Create: `CLI/packages/agent/src/report/__tests__/worktree-scanner.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Database as DB } from 'better-sqlite3';
import { openDb, migrate } from '../db.js';
import { addRepo } from '../repo-registry.js';
import { syncWorktrees, listWorktreesForRepo } from '../worktree-scanner.js';
import * as git from '../git.js';

let dir: string;
let db: DB;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'worktrace-wt-'));
  db = openDb(join(dir, 'report.db'));
  migrate(db);
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('worktree-scanner', () => {
  it('inserts rows for each worktree returned by git', async () => {
    const repo = addRepo(db, { path: '/repo', name: 'repo', addedAt: 1 });
    vi.spyOn(git, 'listWorktrees').mockResolvedValue([
      { path: '/repo', head: 'a', branch: 'main' },
      { path: '/repo-feat', head: 'b', branch: 'feat/x' },
    ]);

    const rows = await syncWorktrees(db, repo, 1234);

    expect(rows.map((w) => w.path).sort()).toEqual(['/repo', '/repo-feat']);
    expect(rows.find((w) => w.path === '/repo')?.isPrimary).toBe(1);
    expect(rows.find((w) => w.path === '/repo-feat')?.isPrimary).toBe(0);
    expect(listWorktreesForRepo(db, repo.id).length).toBe(2);
  });

  it('is idempotent when called twice', async () => {
    const repo = addRepo(db, { path: '/repo', name: 'repo', addedAt: 1 });
    vi.spyOn(git, 'listWorktrees').mockResolvedValue([
      { path: '/repo', head: 'a', branch: 'main' },
    ]);
    await syncWorktrees(db, repo, 1);
    await syncWorktrees(db, repo, 2);
    expect(listWorktreesForRepo(db, repo.id).length).toBe(1);
  });
});
```

- [ ] **Step 2: Run — fails**

```bash
cd CLI/packages/agent && npx vitest run src/report/__tests__/worktree-scanner.test.ts
```

- [ ] **Step 3: Implement `worktree-scanner.ts`**

```typescript
import type { Database as DB } from 'better-sqlite3';
import { listWorktrees as gitListWorktrees } from './git.js';
import type { Repo } from './repo-registry.js';

export interface Worktree {
  id: number;
  repoId: number;
  path: string;
  isPrimary: 0 | 1;
  detectedAt: number;
}

export async function syncWorktrees(db: DB, repo: Repo, now: number): Promise<Worktree[]> {
  const found = await gitListWorktrees(repo.path);
  const upsert = db.prepare(`
    INSERT INTO worktrees (repo_id, path, is_primary, detected_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(path) DO UPDATE SET is_primary = excluded.is_primary
  `);
  const tx = db.transaction((items: Array<{ path: string; isPrimary: 0 | 1 }>) => {
    for (const w of items) upsert.run(repo.id, w.path, w.isPrimary, now);
  });
  tx(found.map((w) => ({ path: w.path, isPrimary: (w.path === repo.path ? 1 : 0) as 0 | 1 })));
  return listWorktreesForRepo(db, repo.id);
}

export function listWorktreesForRepo(db: DB, repoId: number): Worktree[] {
  const rows = db.prepare(
    'SELECT id, repo_id, path, is_primary, detected_at FROM worktrees WHERE repo_id = ? ORDER BY is_primary DESC, path ASC'
  ).all(repoId) as Array<{
    id: number; repo_id: number; path: string; is_primary: 0 | 1; detected_at: number;
  }>;
  return rows.map((r) => ({
    id: r.id, repoId: r.repo_id, path: r.path, isPrimary: r.is_primary, detectedAt: r.detected_at,
  }));
}

export function getWorktreeById(db: DB, id: number): Worktree | null {
  const row = db.prepare(
    'SELECT id, repo_id, path, is_primary, detected_at FROM worktrees WHERE id = ?'
  ).get(id) as {
    id: number; repo_id: number; path: string; is_primary: 0 | 1; detected_at: number;
  } | undefined;
  return row ? { id: row.id, repoId: row.repo_id, path: row.path, isPrimary: row.is_primary, detectedAt: row.detected_at } : null;
}

export function getWorktreeByPath(db: DB, path: string): Worktree | null {
  const row = db.prepare(
    'SELECT id, repo_id, path, is_primary, detected_at FROM worktrees WHERE path = ?'
  ).get(path) as {
    id: number; repo_id: number; path: string; is_primary: 0 | 1; detected_at: number;
  } | undefined;
  return row ? { id: row.id, repoId: row.repo_id, path: row.path, isPrimary: row.is_primary, detectedAt: row.detected_at } : null;
}
```

- [ ] **Step 4: Run — pass**

```bash
npx vitest run src/report/__tests__/worktree-scanner.test.ts
```

- [ ] **Step 5: Commit**

```bash
cd ../../.. && git add -A
git commit -m "feat(report): worktree-scanner with git-backed sync

syncWorktrees upserts by path, preserving the primary flag for the
repo root. Queries by repo, id, and path provided for routes."
```

### Task 1.9: Activity-writer (file-event → window)

**Files:**
- Create: `CLI/packages/agent/src/report/activity-writer.ts`
- Create: `CLI/packages/agent/src/report/__tests__/activity-writer.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Database as DB } from 'better-sqlite3';
import { openDb, migrate } from '../db.js';
import { addRepo } from '../repo-registry.js';
import { recordFileEvent, flushActivityWindows } from '../activity-writer.js';

let dir: string;
let db: DB;

function seedWorktree(): number {
  const repo = addRepo(db, { path: '/repo', name: 'repo', addedAt: 1 });
  const wt = db.prepare(
    'INSERT INTO worktrees (repo_id, path, is_primary, detected_at) VALUES (?, ?, 1, ?)'
  ).run(repo.id, '/repo', 1);
  return Number(wt.lastInsertRowid);
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'worktrace-aw-'));
  db = openDb(join(dir, 'report.db'));
  migrate(db);
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('activity-writer', () => {
  it('records file_changes and aggregates activity_windows on flush', () => {
    const worktreeId = seedWorktree();
    recordFileEvent(db, { worktreeId, branch: 'main', filePath: '/repo/a.ts', eventType: 'create', changedAt: 1000, provider: 'claude' });
    recordFileEvent(db, { worktreeId, branch: 'main', filePath: '/repo/b.ts', eventType: 'modify', changedAt: 2000, provider: 'claude' });
    recordFileEvent(db, { worktreeId, branch: 'main', filePath: '/repo/c.ts', eventType: 'modify', changedAt: 65_000, provider: null });

    const flushed = flushActivityWindows(db, 70_000);
    expect(flushed).toBe(2);

    const windows = db.prepare(
      'SELECT window_start, file_event_count FROM activity_windows ORDER BY window_start'
    ).all() as Array<{ window_start: number; file_event_count: number }>;
    expect(windows).toEqual([
      { window_start: 0, file_event_count: 2 },
      { window_start: 60_000, file_event_count: 1 },
    ]);
  });

  it('is idempotent — flushing twice does not double-count', () => {
    const worktreeId = seedWorktree();
    recordFileEvent(db, { worktreeId, branch: 'main', filePath: '/a', eventType: 'create', changedAt: 1000, provider: null });
    flushActivityWindows(db, 70_000);
    const second = flushActivityWindows(db, 70_000);
    expect(second).toBe(0);
    const count = (db.prepare('SELECT COUNT(*) AS n FROM activity_windows').get() as { n: number }).n;
    expect(count).toBe(1);
  });
});
```

- [ ] **Step 2: Run — fails**

```bash
cd CLI/packages/agent && npx vitest run src/report/__tests__/activity-writer.test.ts
```

- [ ] **Step 3: Implement `activity-writer.ts`**

```typescript
import type { Database as DB } from 'better-sqlite3';
import { ACTIVITY_WINDOW_MS } from './constants.js';

export type FileEventType = 'create' | 'modify' | 'delete';

export interface FileEventInput {
  worktreeId: number;
  branch: string;
  filePath: string;
  eventType: FileEventType;
  changedAt: number;
  provider: string | null;
}

export function recordFileEvent(db: DB, e: FileEventInput): void {
  db.prepare(`
    INSERT INTO file_changes (changed_at, worktree_id, branch, provider, event_type, file_path)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(e.changedAt, e.worktreeId, e.branch, e.provider, e.eventType, e.filePath);
}

export interface FlushOptions {
  windowMs?: number;
}

export function flushActivityWindows(db: DB, now: number, opts: FlushOptions = {}): number {
  const windowMs = opts.windowMs ?? ACTIVITY_WINDOW_MS;

  const lastRow = db.prepare(
    'SELECT COALESCE(MAX(window_end), 0) AS last_end FROM activity_windows'
  ).get() as { last_end: number };
  const cutoffStart = lastRow.last_end;
  const cutoffEnd = Math.floor(now / windowMs) * windowMs;
  if (cutoffEnd <= cutoffStart) return 0;

  const groups = db.prepare(`
    SELECT worktree_id, branch,
           (changed_at / ?) * ? AS window_start,
           COUNT(*) AS cnt
    FROM file_changes
    WHERE changed_at >= ? AND changed_at < ?
    GROUP BY worktree_id, branch, window_start
  `).all(windowMs, windowMs, cutoffStart, cutoffEnd) as Array<{
    worktree_id: number; branch: string; window_start: number; cnt: number;
  }>;

  const insert = db.prepare(`
    INSERT INTO activity_windows (window_start, window_end, worktree_id, branch, file_event_count)
    VALUES (?, ?, ?, ?, ?)
  `);
  const tx = db.transaction((rows: typeof groups) => {
    for (const r of rows) insert.run(r.window_start, r.window_start + windowMs, r.worktree_id, r.branch, r.cnt);
  });
  tx(groups);
  return groups.length;
}
```

- [ ] **Step 4: Run — pass**

```bash
npx vitest run src/report/__tests__/activity-writer.test.ts
```

- [ ] **Step 5: Commit**

```bash
cd ../../.. && git add -A
git commit -m "feat(report): activity-writer buckets file events into windows

recordFileEvent inserts into file_changes. flushActivityWindows groups
events into ACTIVITY_WINDOW_MS-aligned buckets per (worktree, branch)
and writes activity_windows rows. Idempotent via MAX(window_end) cursor."
```

### Task 1.10: Host-API stubs

**Files:**
- Create: `CLI/packages/agent/src/providers/_host/logger.ts`
- Create: `CLI/packages/agent/src/providers/_host/http.ts`
- Create: `CLI/packages/agent/src/providers/_host/pty.ts`
- Create: `CLI/packages/agent/src/providers/_host/keychain.ts`
- Create: `CLI/packages/agent/src/providers/_host/browser-cookies.ts`
- Create: `CLI/packages/agent/src/providers/_host/token-cost.ts`
- Create: `CLI/packages/agent/src/providers/_host/status.ts`
- Create: `CLI/packages/agent/src/providers/_host/process-sampler.ts`
- Create: `CLI/packages/agent/src/providers/_host/playwright.ts`
- Create: `CLI/packages/agent/src/providers/_host/index.ts`

All nine host modules get stub surfaces now. Real implementations land in later tasks (Phase 2 fills http/pty/keychain/browser-cookies/token-cost; Phase 3 fills process-sampler; Phase 4 fills playwright).

- [ ] **Step 1: `logger.ts`**

```typescript
import type { Logger } from '../_shared/types.js';

export function createConsoleLogger(scope: string): Logger {
  const prefix = `[${scope}]`;
  return {
    info: (msg, meta) => console.log(prefix, msg, meta ?? ''),
    warn: (msg, meta) => console.warn(prefix, msg, meta ?? ''),
    error: (msg, meta) => console.error(prefix, msg, meta ?? ''),
    debug: (msg, meta) => {
      if (process.env.WORKTRACE_DEBUG) console.debug(prefix, msg, meta ?? '');
    },
  };
}
```

- [ ] **Step 2: `http.ts`**

```typescript
export interface HttpRequest {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
}

export interface HttpResponse<T = unknown> {
  status: number;
  headers: Record<string, string>;
  body: T;
}

export interface HttpHost {
  request<T = unknown>(req: HttpRequest): Promise<HttpResponse<T>>;
}

export function createHttpHost(): HttpHost {
  return {
    async request() {
      throw new Error('http host not yet implemented (see Phase 2 task 2.1)');
    },
  };
}
```

- [ ] **Step 3: `pty.ts`**

```typescript
export interface PtyRunInput {
  command: string;
  args: string[];
  cwd?: string;
  timeoutMs?: number;
  env?: Record<string, string>;
}

export interface PtyRunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface PtyHost {
  run(input: PtyRunInput): Promise<PtyRunResult>;
  isAvailable(command: string): Promise<boolean>;
}

export function createPtyHost(): PtyHost {
  return {
    async run() { throw new Error('pty host not yet implemented (Phase 2 task 2.2)'); },
    async isAvailable() { return false; },
  };
}
```

- [ ] **Step 4: `keychain.ts`**

```typescript
export interface KeychainHost {
  readPassword(service: string, account: string): Promise<string | null>;
}

export function createKeychainHost(): KeychainHost {
  return { async readPassword() { return null; } };
}
```

- [ ] **Step 5: `browser-cookies.ts`**

```typescript
export type Browser = 'chrome' | 'arc' | 'edge';

export interface CookieRecord {
  name: string;
  value: string;
  domain: string;
  path: string;
  expiresUtc?: number;
}

export interface BrowserCookiesHost {
  read(domain: string, browser?: Browser): Promise<CookieRecord[]>;
}

export function createBrowserCookiesHost(): BrowserCookiesHost {
  return { async read() { return []; } };
}
```

- [ ] **Step 6: `token-cost.ts`**

```typescript
export interface TokenCostInput {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export interface TokenCostHost {
  estimate(input: TokenCostInput): number;
}

export function createTokenCostHost(): TokenCostHost {
  return { estimate: () => 0 };
}
```

- [ ] **Step 7: `status.ts`**

```typescript
export interface StatusHost {
  ping(url: string, timeoutMs?: number): Promise<boolean>;
}

export function createStatusHost(): StatusHost {
  return {
    async ping(url, timeoutMs = 5000) {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), timeoutMs);
        const res = await fetch(url, { method: 'HEAD', signal: ctrl.signal });
        clearTimeout(t);
        return res.ok;
      } catch { return false; }
    },
  };
}
```

- [ ] **Step 8: `process-sampler.ts`**

```typescript
import type { ProviderId } from '../_shared/types.js';

export interface DetectedProcess {
  pid: number;
  provider: ProviderId;
  command: string;
  cwd?: string;
  startedAt?: number;
}

export interface ProcessSamplerHost {
  sample(): Promise<DetectedProcess[]>;
}

export function createProcessSamplerHost(): ProcessSamplerHost {
  return { async sample() { return []; } };
}
```

- [ ] **Step 9: `playwright.ts`**

```typescript
export interface PlaywrightHost {
  scrape<T = unknown>(url: string, extract: (page: unknown) => Promise<T>): Promise<T>;
}

export function createPlaywrightHost(): PlaywrightHost {
  return {
    async scrape() { throw new Error('playwright host not yet implemented'); },
  };
}
```

- [ ] **Step 10: `_host/index.ts`**

```typescript
import type { HostAPIs } from '../_shared/types.js';
import { createConsoleLogger } from './logger.js';
import { createHttpHost } from './http.js';
import { createPtyHost } from './pty.js';
import { createKeychainHost } from './keychain.js';
import { createBrowserCookiesHost } from './browser-cookies.js';
import { createTokenCostHost } from './token-cost.js';
import { createStatusHost } from './status.js';
import { createProcessSamplerHost } from './process-sampler.js';
import { createPlaywrightHost } from './playwright.js';

export function createHostAPIs(scope = 'worktrace'): HostAPIs {
  return {
    http: createHttpHost(),
    pty: createPtyHost(),
    keychain: createKeychainHost(),
    browserCookies: createBrowserCookiesHost(),
    tokenCost: createTokenCostHost(),
    status: createStatusHost(),
    processSampler: createProcessSamplerHost(),
    playwright: createPlaywrightHost(),
    logger: createConsoleLogger(scope),
  };
}
```

- [ ] **Step 11: Build-check (full workspace — should pass now)**

```bash
cd CLI && npm run build --workspaces
```
Expected: agent and CLI both compile.

- [ ] **Step 12: Run all pending tests to confirm Task 1.3 is green**

```bash
cd packages/agent && npx vitest run
```
Expected: Task 1.3 + 1.4 + 1.6 + 1.7 + 1.8 + 1.9 tests all pass.

- [ ] **Step 13: Commit (this also unblocks the Task 1.1/1.2/1.3 pending-commit batch)**

```bash
cd ../.. && git add -A
git commit -m "feat(providers): shared types + pipeline + host-API stubs

Batched commit covering tasks 1.1-1.3 and 1.10: provider descriptor
types, fetch-strategy helpers, runPipeline() with timeout + fallback,
and the nine host-API modules (logger working, status working via
fetch, others stubbed for later phases). Fetch pipeline test suite
passes (7 cases)."
```

### Task 1.11: Provider registry + 16 descriptor stubs

**Files:**
- Create: `CLI/packages/agent/src/providers/_shared/registry.ts`
- Create: `CLI/packages/agent/src/providers/_shared/__tests__/registry.test.ts`
- Create: 16 files — `CLI/packages/agent/src/providers/<id>/descriptor.ts`

- [ ] **Step 1: Write failing registry test**

```typescript
import { describe, it, expect } from 'vitest';
import { loadAll, getById } from '../registry.js';
import { ALL_PROVIDER_IDS } from '../types.js';

describe('provider registry', () => {
  it('loads a descriptor for every ProviderId', async () => {
    const all = await loadAll();
    const ids = all.map((d) => d.id).sort();
    expect(ids).toEqual([...ALL_PROVIDER_IDS].sort());
  });

  it('getById returns the matching descriptor', async () => {
    const d = await getById('claude');
    expect(d).not.toBeNull();
    expect(d?.id).toBe('claude');
    expect(d?.metadata.vendor).toBe('Anthropic');
  });

  it('getById returns null for unknown id', async () => {
    expect(await getById('unknown' as never)).toBeNull();
  });
});
```

- [ ] **Step 2: Create one descriptor file per provider**

Full template for Claude (`CLI/packages/agent/src/providers/claude/descriptor.ts`):
```typescript
import type { ProviderDescriptor } from '../_shared/types.js';
import { linearPipeline } from '../_shared/fetch-strategy.js';

export const claudeDescriptor: ProviderDescriptor = {
  id: 'claude',
  metadata: {
    displayName: 'Claude Code',
    vendor: 'Anthropic',
    category: 'cli',
    website: 'https://www.anthropic.com',
  },
  branding: { icon: '🟧', accentColor: '#C86A3B' },
  capabilities: {
    quotaBar: true, tokenBreakdown: true, costTracking: true,
    creditsBalance: false, sessionUsage: true, modelSelection: true,
  },
  fetchPlan: {
    pipeline: linearPipeline([]),
    sampleIntervalMs: 60_000,
    cacheMaxAgeMs: 60_000,
  },
  cli: { listLabel: 'Claude Code', detailSections: ['session', 'weekly', 'tokens', 'cost'] },
};

export default claudeDescriptor;
```

Create the other 15 following the same shape. Use this data table:

| id | displayName | vendor | category | website | icon | accent | capabilities.quotaBar | detailSections |
|----|----|----|----|----|----|----|----|----|
| cursor | Cursor | Anysphere | ide | https://cursor.com | 🟪 | #8B5CF6 | true | `['weekly','tokens','cost']` |
| codex | Codex CLI | OpenAI | cli | https://openai.com | ⬛ | #1F1F1F | true | `['session','weekly','tokens','cost']` |
| copilot | GitHub Copilot | GitHub | ide | https://github.com/features/copilot | 🟦 | #2D86E8 | true | `['weekly','cost']` |
| gemini | Gemini | Google | api | https://ai.google.dev | 🟨 | #F59E0B | true | `['tokens','cost']` |
| augment | Augment | Augment | ide | https://augmentcode.com | 🟩 | #22C55E | true | `['session','weekly']` |
| kiro | Kiro | Kiro | ide | https://kiro.dev | 🟫 | #A855F7 | true | `['session']` |
| amp | Amp | Sourcegraph | ide | https://ampcode.com | 🟥 | #EF4444 | false | `[]` |
| antigravity | Antigravity | Cognition | cli | https://cognition.ai | ⬜ | #E5E7EB | false | `[]` |
| droid | Droid | Factory | cli | https://factory.ai | 🟤 | #78350F | false | `[]` |
| jetbrains | JetBrains AI | JetBrains | ide | https://jetbrains.com | 🔵 | #087CFA | false | `[]` |
| kimi | Kimi | Moonshot | api | https://moonshot.cn | 🟡 | #EAB308 | false | `[]` |
| kimi-k2 | Kimi K2 | Moonshot | api | https://moonshot.cn | 🟠 | #F97316 | false | `[]` |
| openrouter | OpenRouter | OpenRouter | api | https://openrouter.ai | 🟢 | #10B981 | false | `[]` |
| vertex | Vertex AI | Google Cloud | cloud | https://cloud.google.com/vertex-ai | 🔷 | #4285F4 | false | `[]` |
| zai | Zai | Zai | api | https://z.ai | 🌐 | #0EA5E9 | false | `[]` |

For stubs (`quotaBar: false`), use `capabilities: { quotaBar: false, tokenBreakdown: false, costTracking: false, creditsBalance: false, sessionUsage: false, modelSelection: false }`. Hero providers (Cursor, Codex, Copilot) use the Claude template's capability flags. Stretch providers (Gemini, Augment, Kiro) set `tokenBreakdown: true, costTracking: true` but leave `creditsBalance/sessionUsage/modelSelection` flags adjusted to what each provider actually exposes — start with the claude shape and change flags as needed when strategies land in Phase 2 task 2.9.

Minimal stub example (`amp/descriptor.ts`):
```typescript
import type { ProviderDescriptor } from '../_shared/types.js';
import { linearPipeline } from '../_shared/fetch-strategy.js';

export const ampDescriptor: ProviderDescriptor = {
  id: 'amp',
  metadata: { displayName: 'Amp', vendor: 'Sourcegraph', category: 'ide', website: 'https://ampcode.com' },
  branding: { icon: '🟥', accentColor: '#EF4444' },
  capabilities: {
    quotaBar: false, tokenBreakdown: false, costTracking: false,
    creditsBalance: false, sessionUsage: false, modelSelection: false,
  },
  fetchPlan: { pipeline: linearPipeline([]), sampleIntervalMs: 60_000, cacheMaxAgeMs: 60_000 },
  cli: { listLabel: 'Amp', detailSections: [] },
};

export default ampDescriptor;
```

- [ ] **Step 3: Implement `registry.ts`**

```typescript
import type { ProviderDescriptor, ProviderId } from './types.js';
import { ALL_PROVIDER_IDS } from './types.js';

const loaders: Record<ProviderId, () => Promise<{ default: ProviderDescriptor }>> = {
  claude:      () => import('../claude/descriptor.js'),
  cursor:      () => import('../cursor/descriptor.js'),
  codex:       () => import('../codex/descriptor.js'),
  copilot:     () => import('../copilot/descriptor.js'),
  gemini:      () => import('../gemini/descriptor.js'),
  augment:     () => import('../augment/descriptor.js'),
  kiro:        () => import('../kiro/descriptor.js'),
  amp:         () => import('../amp/descriptor.js'),
  antigravity: () => import('../antigravity/descriptor.js'),
  droid:       () => import('../droid/descriptor.js'),
  jetbrains:   () => import('../jetbrains/descriptor.js'),
  kimi:        () => import('../kimi/descriptor.js'),
  'kimi-k2':   () => import('../kimi-k2/descriptor.js'),
  openrouter:  () => import('../openrouter/descriptor.js'),
  vertex:      () => import('../vertex/descriptor.js'),
  zai:         () => import('../zai/descriptor.js'),
};

const cache = new Map<ProviderId, ProviderDescriptor>();

export async function loadAll(): Promise<ProviderDescriptor[]> {
  const out: ProviderDescriptor[] = [];
  for (const id of ALL_PROVIDER_IDS) {
    const d = await getById(id);
    if (d) out.push(d);
  }
  return out;
}

export async function getById(id: ProviderId): Promise<ProviderDescriptor | null> {
  if (cache.has(id)) return cache.get(id)!;
  const loader = loaders[id];
  if (!loader) return null;
  const mod = await loader();
  cache.set(id, mod.default);
  return mod.default;
}

export async function getInstalled(): Promise<ProviderDescriptor[]> {
  const all = await loadAll();
  return all.filter((d) => d.capabilities.quotaBar);
}
```

- [ ] **Step 4: Run test — expect pass**

```bash
cd CLI/packages/agent && npx vitest run src/providers/_shared/__tests__/registry.test.ts
```
Expected: `3 passed`.

- [ ] **Step 5: Commit**

```bash
cd ../../.. && git add -A
git commit -m "feat(providers): registry + 16 descriptor stubs

ALL_PROVIDER_IDS covered with dynamic imports from each provider folder.
Hero + stretch descriptors declare quotaBar capability; 9 stubs remain
capability-off. Registry cache keyed by ProviderId. getInstalled filters
on quotaBar so CLI listings skip capability-less stubs."
```

### Task 1.12: Agent route stubs + app-context

**Files:**
- Create: `CLI/packages/agent/src/report/app-context.ts`
- Create: `CLI/packages/agent/src/routes/repos.ts`
- Create: `CLI/packages/agent/src/routes/worktrees.ts`
- Create: `CLI/packages/agent/src/routes/providers.ts`
- Create: `CLI/packages/agent/src/routes/features.ts`
- Create: `CLI/packages/agent/src/routes/files.ts`
- Create: `CLI/packages/agent/src/routes/pace.ts`
- Create: `CLI/packages/agent/src/routes/watch.ts`
- Create: `CLI/packages/agent/src/routes/usage.ts`
- Create: `CLI/packages/agent/src/routes/report.ts`
- Modify: `CLI/packages/agent/src/server.ts`

- [ ] **Step 1: `app-context.ts`**

```typescript
import type { Database as DB } from 'better-sqlite3';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { getDb } from './db.js';
import { DB_FILENAME } from './constants.js';
import type { HostAPIs } from '../providers/_shared/types.js';
import { createHostAPIs } from '../providers/_host/index.js';

export interface AppContext {
  db: DB;
  hosts: HostAPIs;
  dataDir: string;
}

let ctx: AppContext | null = null;

export function getAppContext(): AppContext {
  if (ctx) return ctx;
  const dataDir = process.env.WORKTRACE_DATA_DIR ?? join(homedir(), '.worktrace');
  const db = getDb(join(dataDir, DB_FILENAME));
  const hosts = createHostAPIs('worktrace-agent');
  ctx = { db, hosts, dataDir };
  return ctx;
}

export function resetAppContextForTests(): void {
  ctx = null;
}
```

- [ ] **Step 2: `routes/repos.ts`**

```typescript
import { Router } from 'express';
import { listRepos, getRepoById, removeRepo } from '../report/repo-registry.js';
import { listWorktreesForRepo } from '../report/worktree-scanner.js';
import { getAppContext } from '../report/app-context.js';

const router = Router();

router.get('/', (_req, res) => {
  const { db } = getAppContext();
  res.json({ repos: listRepos(db) });
});

router.get('/:id', (req, res) => {
  const { db } = getAppContext();
  const id = Number(req.params.id);
  const repo = getRepoById(db, id);
  if (!repo) { res.status(404).json({ error: 'repo not found' }); return; }
  res.json({ repo, worktrees: listWorktreesForRepo(db, id) });
});

router.get('/:id/worktrees', (req, res) => {
  const { db } = getAppContext();
  const id = Number(req.params.id);
  if (!getRepoById(db, id)) { res.status(404).json({ error: 'repo not found' }); return; }
  res.json({ worktrees: listWorktreesForRepo(db, id) });
});

router.delete('/:id', (req, res) => {
  const { db } = getAppContext();
  const ok = removeRepo(db, Number(req.params.id));
  res.status(ok ? 200 : 404).json({ removed: ok });
});

export default router;
```

- [ ] **Step 3: `routes/worktrees.ts`**

```typescript
import { Router } from 'express';
import { getWorktreeById, getWorktreeByPath } from '../report/worktree-scanner.js';
import { getAppContext } from '../report/app-context.js';

const router = Router();

router.get('/', (req, res) => {
  const { db } = getAppContext();
  const path = typeof req.query.path === 'string' ? req.query.path : undefined;
  if (path) { res.json({ worktree: getWorktreeByPath(db, path) }); return; }
  const rows = db.prepare(
    'SELECT id, repo_id, path, is_primary, detected_at FROM worktrees ORDER BY detected_at DESC'
  ).all();
  res.json({ worktrees: rows });
});

router.get('/:id', (req, res) => {
  const { db } = getAppContext();
  const wt = getWorktreeById(db, Number(req.params.id));
  if (!wt) { res.status(404).json({ error: 'worktree not found' }); return; }
  res.json({ worktree: wt });
});

export default router;
```

- [ ] **Step 4: `routes/providers.ts`**

```typescript
import { Router } from 'express';
import { getById, getInstalled, loadAll } from '../providers/_shared/registry.js';
import type { ProviderId } from '../providers/_shared/types.js';

const router = Router();

router.get('/', async (_req, res) => {
  const installed = await getInstalled();
  res.json({
    providers: installed.map((d) => ({
      id: d.id,
      displayName: d.metadata.displayName,
      vendor: d.metadata.vendor,
      capabilities: d.capabilities,
      branding: d.branding,
    })),
  });
});

router.get('/all', async (_req, res) => {
  const all = await loadAll();
  res.json({ providers: all.map((d) => ({ id: d.id, displayName: d.metadata.displayName })) });
});

router.get('/:id', async (req, res) => {
  const d = await getById(req.params.id as ProviderId);
  if (!d) { res.status(404).json({ error: 'provider not found' }); return; }
  res.json({ provider: { ...d, snapshot: null } });
});

export default router;
```

- [ ] **Step 5: `routes/features.ts`**

```typescript
import { Router } from 'express';
import { getAppContext } from '../report/app-context.js';

const router = Router();

router.get('/', (_req, res) => {
  const { db } = getAppContext();
  const rows = db.prepare(`
    SELECT branch, worktree_id, COUNT(*) AS events
    FROM file_changes GROUP BY branch, worktree_id ORDER BY events DESC
  `).all();
  res.json({ features: rows });
});

router.get('/:branch', (req, res) => {
  const { db } = getAppContext();
  const files = db.prepare(`
    SELECT file_path, event_type, changed_at, provider, worktree_id
    FROM file_changes WHERE branch = ? ORDER BY changed_at DESC LIMIT 500
  `).all(req.params.branch);
  res.json({ branch: req.params.branch, files });
});

export default router;
```

- [ ] **Step 6: `routes/files.ts`**

```typescript
import { Router } from 'express';
import { getAppContext } from '../report/app-context.js';

const router = Router();

router.get('/', (_req, res) => {
  const { db } = getAppContext();
  const rows = db.prepare(`
    SELECT file_path, worktree_id, branch, COUNT(*) AS changes,
      SUM(CASE WHEN event_type='create' THEN 1 ELSE 0 END) AS creates,
      SUM(CASE WHEN event_type='modify' THEN 1 ELSE 0 END) AS modifies,
      SUM(CASE WHEN event_type='delete' THEN 1 ELSE 0 END) AS deletes
    FROM file_changes GROUP BY file_path, worktree_id, branch
    ORDER BY changes DESC LIMIT 500
  `).all();
  res.json({ files: rows });
});

router.get('/detail', (req, res) => {
  const { db } = getAppContext();
  const filePath = typeof req.query.path === 'string' ? req.query.path : '';
  if (!filePath) { res.status(400).json({ error: 'path required' }); return; }
  const rows = db.prepare(`
    SELECT changed_at, event_type, provider, branch, worktree_id
    FROM file_changes WHERE file_path = ? ORDER BY changed_at DESC
  `).all(filePath);
  res.json({ path: filePath, history: rows });
});

export default router;
```

- [ ] **Step 7: `routes/pace.ts` (stub)**

```typescript
import { Router } from 'express';

const router = Router();
router.get('/', (_req, res) => {
  res.json({ pace: [], note: 'Pace calculator wired in Phase 4 task 4.4.' });
});

export default router;
```

- [ ] **Step 8: `routes/watch.ts`**

```typescript
import { Router } from 'express';
import { basename, resolve } from 'node:path';
import { addRepo, getRepoByPath, removeRepo } from '../report/repo-registry.js';
import { syncWorktrees } from '../report/worktree-scanner.js';
import { getAppContext } from '../report/app-context.js';
import { startWatcher, stopWatcher } from '../watcher.js';

const router = Router();

router.post('/', async (req, res) => {
  const { db } = getAppContext();
  const raw = typeof req.body?.path === 'string' ? req.body.path : undefined;
  if (!raw) { res.status(400).json({ error: 'path required' }); return; }
  const path = resolve(raw);
  const repo = addRepo(db, { path, name: basename(path), addedAt: Date.now() });
  await syncWorktrees(db, repo, Date.now());
  startWatcher(path);
  res.json({ repo });
});

router.delete('/', async (req, res) => {
  const { db } = getAppContext();
  const raw = typeof req.body?.path === 'string' ? req.body.path
    : (typeof req.query.path === 'string' ? req.query.path : undefined);
  if (!raw) { res.status(400).json({ error: 'path required' }); return; }
  const path = resolve(raw);
  await stopWatcher(path);
  const repo = getRepoByPath(db, path);
  if (!repo) { res.json({ removed: false }); return; }
  res.json({ removed: removeRepo(db, repo.id) });
});

export default router;
```

- [ ] **Step 9: `routes/usage.ts`**

```typescript
import { Router } from 'express';
import { getInstalled } from '../providers/_shared/registry.js';

const router = Router();

router.get('/', async (_req, res) => {
  const installed = await getInstalled();
  res.json({
    providers: installed.map((d) => ({
      id: d.id,
      displayName: d.metadata.displayName,
      branding: d.branding,
      snapshot: null,
    })),
  });
});

export default router;
```

- [ ] **Step 10: `routes/report.ts`**

```typescript
import { Router } from 'express';
import { getAppContext } from '../report/app-context.js';
import { listRepos } from '../report/repo-registry.js';

const router = Router();

router.get('/', (_req, res) => {
  const { db } = getAppContext();
  res.json({
    repos: listRepos(db),
    providers: [],
    pace: [],
    note: 'Roll-up fully wired in Phase 3 task 3.6 and Phase 4 task 4.5.',
  });
});

export default router;
```

- [ ] **Step 11: Rewrite `server.ts`**

```typescript
import express from 'express';
import healthRouter from './routes/health.js';
import reposRouter from './routes/repos.js';
import worktreesRouter from './routes/worktrees.js';
import providersRouter from './routes/providers.js';
import featuresRouter from './routes/features.js';
import filesRouter from './routes/files.js';
import paceRouter from './routes/pace.js';
import watchRouter from './routes/watch.js';
import usageRouter from './routes/usage.js';
import reportRouter from './routes/report.js';
import { stopAllWatchers } from './watcher.js';
import { getAppContext } from './report/app-context.js';

const app = express();
app.use(express.json({ limit: '10mb' }));

app.use('/health', healthRouter);
app.use('/repos', reposRouter);
app.use('/worktrees', worktreesRouter);
app.use('/providers', providersRouter);
app.use('/features', featuresRouter);
app.use('/files', filesRouter);
app.use('/pace', paceRouter);
app.use('/watch', watchRouter);
app.use('/usage', usageRouter);
app.use('/report', reportRouter);

const PORT = parseInt(process.env.WORKTRACE_AGENT_PORT || '9315', 10);

getAppContext();

const server = app.listen(PORT, '127.0.0.1', () => {
  console.log(`worktrace-agent listening on 127.0.0.1:${PORT}`);
});

async function shutdown(): Promise<void> {
  console.log('Shutting down...');
  await stopAllWatchers();
  server.close();
  const { unlink } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const { homedir } = await import('node:os');
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

- [ ] **Step 12: Build-check**

```bash
cd CLI && npm run build --workspaces
```

- [ ] **Step 13: Smoke-test the daemon**

```bash
node packages/agent/dist/server.js &
AGENT_PID=$!
sleep 1
curl -s http://127.0.0.1:9315/health && echo
curl -s http://127.0.0.1:9315/repos && echo
curl -s http://127.0.0.1:9315/providers && echo
kill $AGENT_PID
```
Expected: `/health` OK, `/repos` returns `{"repos":[]}`, `/providers` returns the 7 quotaBar-enabled providers.

- [ ] **Step 14: Commit**

```bash
git add -A
git commit -m "feat(routes): wire nine report routes + app-context

repos, worktrees, providers, features, files, pace (stub), watch,
usage (stub), report (stub). watch route adds a repo, syncs worktrees,
and starts chokidar. Server initializes DB eagerly at startup."
```

### Task 1.13: Watcher dispatches to SQLite

**Files:**
- Modify: `CLI/packages/agent/src/watcher.ts`
- (Depends on `currentBranch` from Task 1.4.)

- [ ] **Step 1: Rewrite `watcher.ts`**

```typescript
import { watch, type FSWatcher } from 'chokidar';
import path from 'node:path';
import { WATCHER_IGNORED_SEGMENTS } from './report/constants.js';
import { getAppContext } from './report/app-context.js';
import { getRepoByPath } from './report/repo-registry.js';
import { getWorktreeByPath } from './report/worktree-scanner.js';
import { recordFileEvent, type FileEventType } from './report/activity-writer.js';
import { currentBranch } from './report/git.js';

const watchers = new Map<string, FSWatcher>();
const branchCache = new Map<string, string>();

export function startWatcher(workspacePath: string): void {
  const absPath = path.resolve(workspacePath);
  if (watchers.has(absPath)) return;

  const watcher = watch(absPath, {
    ignored: (filePath: string) => {
      const rel = path.relative(absPath, filePath);
      if (!rel || rel === '.') return false;
      const segments = rel.split(path.sep);
      return segments.some((seg) => WATCHER_IGNORED_SEGMENTS.has(seg));
    },
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
  });

  const emit = (eventType: FileEventType) => (filePath: string) => {
    handleEvent(absPath, filePath, eventType).catch((err) => {
      console.error('watcher event failed:', err);
    });
  };

  watcher.on('add', emit('create'));
  watcher.on('change', emit('modify'));
  watcher.on('unlink', emit('delete'));

  watchers.set(absPath, watcher);
}

async function handleEvent(workspacePath: string, filePath: string, eventType: FileEventType): Promise<void> {
  const { db } = getAppContext();
  const repo = getRepoByPath(db, workspacePath);
  if (!repo) return;
  const wt = getWorktreeByPath(db, workspacePath);
  if (!wt) return;

  const cached = branchCache.get(workspacePath);
  const branch = cached ?? await currentBranch(workspacePath).catch(() => 'HEAD');
  if (!cached) branchCache.set(workspacePath, branch);

  recordFileEvent(db, {
    worktreeId: wt.id,
    branch,
    filePath,
    eventType,
    changedAt: Date.now(),
    provider: null,
  });
}

export async function stopWatcher(workspacePath: string): Promise<void> {
  const absPath = path.resolve(workspacePath);
  const watcher = watchers.get(absPath);
  if (watcher) {
    await watcher.close();
    watchers.delete(absPath);
  }
  branchCache.delete(absPath);
}

export async function stopAllWatchers(): Promise<void> {
  for (const [, watcher] of watchers) await watcher.close();
  watchers.clear();
  branchCache.clear();
}
```

- [ ] **Step 2: Build-check**

```bash
cd CLI && npm run build --workspaces
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(watcher): dispatch chokidar events into file_changes

Watcher resolves worktree + branch via app-context and writes every
add/change/unlink into file_changes. provider column left null pending
process-sampler in Phase 3. branchCache avoids a git spawn per event."
```

### Task 1.14: CLI command router rewrite + watch end-to-end

**Files:**
- Create: `CLI/packages/cli/src/commands/repos.ts`
- Create: `CLI/packages/cli/src/commands/worktrees.ts`
- Create: `CLI/packages/cli/src/commands/providers.ts`
- Create: `CLI/packages/cli/src/commands/features.ts`
- Create: `CLI/packages/cli/src/commands/files.ts`
- Create: `CLI/packages/cli/src/commands/pace.ts`
- Create: `CLI/packages/cli/src/commands/watch.ts`
- Create: `CLI/packages/cli/src/commands/report.ts`
- Modify: `CLI/packages/cli/src/commands/usage.ts`
- Modify: `CLI/packages/cli/src/index.ts`
- Modify: `CLI/packages/cli/src/agent-client.ts` (no shape change, confirm still correct)

- [ ] **Step 1: Write each command file as a thin JSON-printing stub**

Template pattern (apply to each command):
```typescript
import { ensureAgent, agentGet } from '../agent-client.js';

export interface <Name>Options {
  json?: boolean;
  // add command-specific flags per table below
}

export async function run<Name>(opts: <Name>Options): Promise<void> {
  await ensureAgent();
  // hit the route(s) listed in the table; pretty-print JSON
  const data = await agentGet<unknown>('/<route>');
  console.log(JSON.stringify(data, null, 2));
}
```

Concrete files:

`commands/repos.ts`:
```typescript
import { ensureAgent, agentGet } from '../agent-client.js';

export interface ReposOptions { name?: string; json?: boolean; }

export async function runRepos(opts: ReposOptions): Promise<void> {
  await ensureAgent();
  const data = opts.name
    ? await agentGet<unknown>(`/repos?name=${encodeURIComponent(opts.name)}`)
    : await agentGet<unknown>('/repos');
  console.log(JSON.stringify(data, null, 2));
}
```

`commands/worktrees.ts`:
```typescript
import { ensureAgent, agentGet } from '../agent-client.js';

export interface WorktreesOptions { path?: string; json?: boolean; }

export async function runWorktrees(opts: WorktreesOptions): Promise<void> {
  await ensureAgent();
  const data = opts.path
    ? await agentGet<unknown>(`/worktrees?path=${encodeURIComponent(opts.path)}`)
    : await agentGet<unknown>('/worktrees');
  console.log(JSON.stringify(data, null, 2));
}
```

`commands/providers.ts`:
```typescript
import { ensureAgent, agentGet } from '../agent-client.js';

export interface ProvidersOptions { id?: string; json?: boolean; refresh?: boolean; }

export async function runProviders(opts: ProvidersOptions): Promise<void> {
  await ensureAgent();
  const data = opts.id
    ? await agentGet<unknown>(`/providers/${encodeURIComponent(opts.id)}`)
    : await agentGet<unknown>(`/providers${opts.refresh ? '?refresh=1' : ''}`);
  console.log(JSON.stringify(data, null, 2));
}
```

`commands/features.ts`:
```typescript
import { ensureAgent, agentGet } from '../agent-client.js';

export interface FeaturesOptions { branch?: string; json?: boolean; }

export async function runFeatures(opts: FeaturesOptions): Promise<void> {
  await ensureAgent();
  const data = opts.branch
    ? await agentGet<unknown>(`/features/${encodeURIComponent(opts.branch)}`)
    : await agentGet<unknown>('/features');
  console.log(JSON.stringify(data, null, 2));
}
```

`commands/files.ts`:
```typescript
import { ensureAgent, agentGet } from '../agent-client.js';

export interface FilesOptions { path?: string; json?: boolean; }

export async function runFiles(opts: FilesOptions): Promise<void> {
  await ensureAgent();
  const data = opts.path
    ? await agentGet<unknown>(`/files/detail?path=${encodeURIComponent(opts.path)}`)
    : await agentGet<unknown>('/files');
  console.log(JSON.stringify(data, null, 2));
}
```

`commands/pace.ts`:
```typescript
import { ensureAgent, agentGet } from '../agent-client.js';

export interface PaceOptions { json?: boolean; }

export async function runPace(_opts: PaceOptions): Promise<void> {
  await ensureAgent();
  const data = await agentGet<unknown>('/pace');
  console.log(JSON.stringify(data, null, 2));
}
```

`commands/watch.ts`:
```typescript
import { ensureAgent, agentPost, agentDelete } from '../agent-client.js';

export interface WatchOptions { stop?: boolean; json?: boolean; }

export async function runWatch(opts: WatchOptions): Promise<void> {
  await ensureAgent();
  const cwd = process.cwd();
  if (opts.stop) {
    const data = await agentDelete<unknown>(`/watch?path=${encodeURIComponent(cwd)}`);
    console.log(JSON.stringify(data, null, 2));
    return;
  }
  const data = await agentPost<unknown>('/watch', { path: cwd });
  console.log(JSON.stringify(data, null, 2));
}
```

`commands/report.ts`:
```typescript
import { ensureAgent, agentGet } from '../agent-client.js';

export interface ReportOptions { json?: boolean; period?: string; }

export async function runReport(opts: ReportOptions): Promise<void> {
  await ensureAgent();
  const q = opts.period ? `?period=${encodeURIComponent(opts.period)}` : '';
  const data = await agentGet<unknown>(`/report${q}`);
  console.log(JSON.stringify(data, null, 2));
}
```

`commands/usage.ts` (replace stub):
```typescript
import { ensureAgent, agentGet } from '../agent-client.js';

export interface UsageOptions { refresh?: boolean; json?: boolean; }

export async function runUsage(opts: UsageOptions): Promise<void> {
  await ensureAgent();
  const data = await agentGet<unknown>(`/usage${opts.refresh ? '?refresh=1' : ''}`);
  console.log(JSON.stringify(data, null, 2));
}
```

- [ ] **Step 2: Rewrite `index.ts`**

```typescript
#!/usr/bin/env node
import { Command } from 'commander';
import { runRepos } from './commands/repos.js';
import { runWorktrees } from './commands/worktrees.js';
import { runProviders } from './commands/providers.js';
import { runFeatures } from './commands/features.js';
import { runFiles } from './commands/files.js';
import { runPace } from './commands/pace.js';
import { runWatch } from './commands/watch.js';
import { runUsage } from './commands/usage.js';
import { runReport } from './commands/report.js';

const program = new Command();

program
  .name('worktrace')
  .description('Worktrace Report — per-repo, per-worktree AI spend tracker')
  .version('0.1.0-dev')
  .option('--json', 'machine-readable output (bypass renderers)')
  .option('--refresh', 'force refresh cached provider snapshots')
  .option('--period <window>', 'time window: 7d | 30d | all', '7d');

program
  .command('repos [name]').description('List tracked repos, or show detail for <name>')
  .action(async (name: string | undefined) =>
    runRepos({ name, json: program.opts().json }));

program
  .command('worktrees [path]').description('List worktrees, or show detail for <path>')
  .action(async (p: string | undefined) =>
    runWorktrees({ path: p, json: program.opts().json }));

program
  .command('providers [id]').description('List installed providers, or show detail for <id>')
  .action(async (id: string | undefined) =>
    runProviders({ id, json: program.opts().json, refresh: Boolean(program.opts().refresh) }));

program
  .command('features [branch]').description('List features, or show detail for <branch>')
  .action(async (b: string | undefined) =>
    runFeatures({ branch: b, json: program.opts().json }));

program
  .command('files [path]').description('File changes summary, or history for <path>')
  .action(async (p: string | undefined) =>
    runFiles({ path: p, json: program.opts().json }));

program
  .command('pace').description('Pace dashboard across all providers')
  .action(async () => runPace({ json: program.opts().json }));

program
  .command('watch').description('Register the current directory as a tracked repo')
  .option('--stop', 'stop watching this directory')
  .action(async (opts: { stop?: boolean }) =>
    runWatch({ stop: opts.stop, json: program.opts().json }));

program
  .command('usage').description('Provider-level usage (backward-compat view)')
  .action(async () =>
    runUsage({ refresh: Boolean(program.opts().refresh), json: program.opts().json }));

program
  .command('report').description('Full roll-up — repos → worktrees → providers → pace')
  .action(async () =>
    runReport({ json: program.opts().json, period: program.opts().period }));

program.parseAsync(process.argv).catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 3: Build-check**

```bash
cd CLI && npm run build --workspaces
```

- [ ] **Step 4: Smoke-test the entire `watch` → `files` flow end-to-end**

```bash
mkdir -p /tmp/wt-smoke && cd /tmp/wt-smoke
git init -q && echo "hi" > a.txt && git add -A && git commit -q -m init

WT_REPO=/Users/vasuyadav/Downloads/Projects/cursor-sm/CLI
node "$WT_REPO/packages/cli/dist/index.js" watch
node "$WT_REPO/packages/cli/dist/index.js" repos
echo "change" > a.txt
sleep 2
node "$WT_REPO/packages/cli/dist/index.js" files
node "$WT_REPO/packages/cli/dist/index.js" watch --stop

pkill -f 'packages/agent/dist/server.js' || true
cd - && rm -rf /tmp/wt-smoke
```
Expected:
- `watch` prints `{ repo: { id, path: "/tmp/wt-smoke", ... } }`
- `repos` shows one entry
- `files` shows at least one file_change row from the `echo "change"`
- `watch --stop` prints `{ removed: true }`

- [ ] **Step 5: Phase 1 exit gate — run the entire test suite**

```bash
cd /Users/vasuyadav/Downloads/Projects/cursor-sm/CLI/packages/agent && npx vitest run
```
Expected: all suites green (pipeline, git parser, db, repo-registry, worktree-scanner, activity-writer, registry).

- [ ] **Step 6: Commit**

```bash
cd /Users/vasuyadav/Downloads/Projects/cursor-sm
git add -A
git commit -m "feat(cli): 14-command surface + watch end-to-end

index.ts registers repos, worktrees, providers, features, files, pace,
watch, usage, report — each command calls ensureAgent() then prints
raw JSON. Rich rendering lands in Phase 4. Smoke test confirms full
watch → repos → files → unwatch path works against the agent."
```

---

**Phase 1 exit criteria:**
- `npm run build --workspaces` clean
- vitest green across all report + providers tests
- daemon smoke test: `watch` registers a repo, file changes land in SQLite, `watch --stop` removes it
- `/health`, `/repos`, `/providers` routes all respond

## Phase 2 — Hero Providers (est. 4-5 days)

Phase 1 left nine `_host/*` modules as stubs; this phase fills in the five
that hero providers need (http, pty, keychain, browser-cookies, token-cost),
adds a shared cache layer, and delivers four live providers (Claude, Cursor,
Codex, Copilot) with fetch strategies, parsers, and golden-file tests.

**TDD scope:** host APIs and parsers get test-first. Strategies (which wire
host APIs together) get smoke-tested at the `/providers/:id` integration
level at the end of Phase 2 Task 2.11. Rendering lands in Phase 4.

### Task 2.1: `http` host API (real fetch + timeout + retry)

**Files:**
- Modify: `CLI/packages/agent/src/providers/_host/http.ts`
- Test: `CLI/packages/agent/src/providers/_host/__tests__/http.test.ts`

Replace the Phase 1 stub with a real implementation that uses Node 20's
global `fetch`, an `AbortController`-based timeout, and a small retry loop
for transient failures (HTTP 429 and 5xx).

- [ ] **Step 1: Write failing test**

```typescript
// CLI/packages/agent/src/providers/_host/__tests__/http.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createHttpHost } from '../http.js';

describe('createHttpHost', () => {
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  afterEach(() => fetchMock.mockReset());

  it('returns parsed JSON body on 2xx', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ a: 1 }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    const http = createHttpHost();
    const res = await http.request<{ a: number }>({ url: 'https://x' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ a: 1 });
  });

  it('throws with status on non-2xx', async () => {
    fetchMock.mockResolvedValue(new Response('nope', { status: 403 }));
    const http = createHttpHost();
    await expect(http.request({ url: 'https://x' })).rejects.toThrow(/403/);
  });

  it('retries on 429 up to retries count', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('', { status: 429 }))
      .mockResolvedValueOnce(new Response('', { status: 429 }))
      .mockResolvedValueOnce(new Response('{}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }));
    const http = createHttpHost();
    const res = await http.request({ url: 'https://x', retries: 2 });
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('aborts when timeout elapses', async () => {
    fetchMock.mockImplementation((_url, opts: RequestInit) => new Promise((_, reject) => {
      opts.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }));
    const http = createHttpHost();
    await expect(http.request({ url: 'https://x', timeoutMs: 10 })).rejects.toThrow(/aborted|timeout/i);
  });

  it('serializes JSON body and sets content-type', async () => {
    fetchMock.mockResolvedValue(new Response('{}', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    const http = createHttpHost();
    await http.request({ url: 'https://x', method: 'POST', body: { a: 1 } });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ a: 1 }));
    const headers = init.headers as Record<string, string>;
    expect(headers['content-type']).toBe('application/json');
  });
});
```

- [ ] **Step 2: Run — expect fail**

```bash
cd CLI/packages/agent && npx vitest run src/providers/_host/__tests__/http.test.ts
```
Expected: all cases fail (stub throws "not yet implemented").

- [ ] **Step 3: Replace `http.ts` with the real implementation**

```typescript
// CLI/packages/agent/src/providers/_host/http.ts
export interface HttpRequest {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
  retries?: number;
}

export interface HttpResponse<T = unknown> {
  status: number;
  headers: Record<string, string>;
  body: T;
}

export interface HttpHost {
  request<T = unknown>(req: HttpRequest): Promise<HttpResponse<T>>;
}

const DEFAULT_TIMEOUT_MS = 10_000;

function shouldRetry(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

async function doOnce<T>(req: HttpRequest): Promise<HttpResponse<T>> {
  const ctrl = new AbortController();
  const timeoutMs = req.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const headers: Record<string, string> = { ...(req.headers ?? {}) };
    let body: BodyInit | undefined;
    if (req.body !== undefined) {
      if (typeof req.body === 'string' || req.body instanceof Uint8Array) {
        body = req.body as BodyInit;
      } else {
        body = JSON.stringify(req.body);
        if (!headers['content-type']) headers['content-type'] = 'application/json';
      }
    }
    const res = await fetch(req.url, {
      method: req.method ?? 'GET',
      headers,
      body,
      signal: ctrl.signal,
    });
    const hOut: Record<string, string> = {};
    res.headers.forEach((v, k) => { hOut[k] = v; });
    const ct = res.headers.get('content-type') ?? '';
    const parsed = ct.includes('application/json') ? await res.json() : await res.text();
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status} ${res.statusText} for ${req.url}`) as Error & { status?: number };
      err.status = res.status;
      throw err;
    }
    return { status: res.status, headers: hOut, body: parsed as T };
  } finally {
    clearTimeout(t);
  }
}

export function createHttpHost(): HttpHost {
  return {
    async request<T = unknown>(req: HttpRequest): Promise<HttpResponse<T>> {
      const retries = req.retries ?? 0;
      let lastErr: unknown;
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          return await doOnce<T>(req);
        } catch (err) {
          lastErr = err;
          const status = (err as { status?: number }).status;
          if (status !== undefined && shouldRetry(status) && attempt < retries) {
            await new Promise(r => setTimeout(r, 200 * (attempt + 1)));
            continue;
          }
          throw err;
        }
      }
      throw lastErr;
    },
  };
}
```

- [ ] **Step 4: Run — expect pass**

```bash
npx vitest run src/providers/_host/__tests__/http.test.ts
```
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add CLI/packages/agent/src/providers/_host/http.ts \
        CLI/packages/agent/src/providers/_host/__tests__/http.test.ts
git commit -m "feat(host): real http client with timeout + retry

Replaces Phase 1 stub. Uses Node 20 global fetch with AbortController
timeout (default 10s) and an exponential-backoff retry for 429/5xx
responses. JSON bodies are auto-serialized with content-type set."
```

### Task 2.2: `pty` host API (subprocess via execFile)

**Files:**
- Modify: `CLI/packages/agent/src/providers/_host/pty.ts`
- Test: `CLI/packages/agent/src/providers/_host/__tests__/pty.test.ts`

v0.1 does not pull in `node-pty` (native deps complicate install). We spawn
subprocesses with `child_process.execFile` (via promisify) — this works for
JSON-output CLIs like `claude usage --json`. True pty support is deferred.
Do NOT introduce `child_process.exec` (shell injection risk).

- [ ] **Step 1: Write failing test**

```typescript
// CLI/packages/agent/src/providers/_host/__tests__/pty.test.ts
import { describe, it, expect } from 'vitest';
import { createPtyHost } from '../pty.js';

describe('createPtyHost', () => {
  const pty = createPtyHost();

  it('captures stdout from node -e', async () => {
    const r = await pty.run({ command: 'node', args: ['-e', 'process.stdout.write("hi")'] });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toBe('hi');
  });

  it('captures non-zero exit code', async () => {
    const r = await pty.run({ command: 'node', args: ['-e', 'process.exit(7)'] });
    expect(r.exitCode).toBe(7);
  });

  it('honors timeout and kills subprocess', async () => {
    await expect(pty.run({
      command: 'node',
      args: ['-e', 'setTimeout(() => {}, 5000)'],
      timeoutMs: 50,
    })).rejects.toThrow(/timeout|killed/i);
  });

  it('isAvailable returns true for node, false for bogus', async () => {
    expect(await pty.isAvailable('node')).toBe(true);
    expect(await pty.isAvailable('definitely-not-a-real-binary-xyz')).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect fail**

```bash
npx vitest run src/providers/_host/__tests__/pty.test.ts
```
Expected: 4 cases fail.

- [ ] **Step 3: Implement `pty.ts`**

```typescript
// CLI/packages/agent/src/providers/_host/pty.ts
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';

const execFile = promisify(execFileCb);

export interface PtyRunInput {
  command: string;
  args: string[];
  cwd?: string;
  timeoutMs?: number;
  env?: Record<string, string>;
}

export interface PtyRunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface PtyHost {
  run(input: PtyRunInput): Promise<PtyRunResult>;
  isAvailable(command: string): Promise<boolean>;
}

export function createPtyHost(): PtyHost {
  return {
    async run(input) {
      try {
        const { stdout, stderr } = await execFile(input.command, input.args, {
          cwd: input.cwd,
          env: input.env ? { ...process.env, ...input.env } : process.env,
          timeout: input.timeoutMs,
          maxBuffer: 8 * 1024 * 1024,
        });
        return { stdout, stderr, exitCode: 0 };
      } catch (err) {
        const e = err as NodeJS.ErrnoException & {
          stdout?: string; stderr?: string; code?: number | string; killed?: boolean; signal?: string;
        };
        if (e.killed || e.signal === 'SIGTERM' || e.code === 'ETIMEDOUT') {
          throw new Error(`pty timeout running ${input.command}`);
        }
        return {
          stdout: e.stdout ?? '',
          stderr: e.stderr ?? '',
          exitCode: typeof e.code === 'number' ? e.code : 1,
        };
      }
    },
    async isAvailable(command) {
      const probe = process.platform === 'win32' ? 'where' : 'which';
      try {
        await execFile(probe, [command]);
        return true;
      } catch { return false; }
    },
  };
}
```

- [ ] **Step 4: Run — expect pass**

Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add CLI/packages/agent/src/providers/_host/pty.ts \
        CLI/packages/agent/src/providers/_host/__tests__/pty.test.ts
git commit -m "feat(host): subprocess runner via execFile

Replaces Phase 1 stub. Uses child_process.execFile (no shell) to keep
command injection surface minimal. run() returns {stdout, stderr,
exitCode}; isAvailable() uses which/where. Timeouts kill the subprocess
cleanly."
```

### Task 2.3: `keychain` host API (macOS security + Linux secret-tool)

**Files:**
- Modify: `CLI/packages/agent/src/providers/_host/keychain.ts`
- Test: `CLI/packages/agent/src/providers/_host/__tests__/keychain.test.ts`

Shells out to `security find-generic-password -w -s <service> -a <account>`
on macOS, or `secret-tool lookup service <service> account <account>` on
Linux. Windows returns `null` (credential manager API access is deferred).
Consumers of this host must treat `null` as "not found, try next strategy".

- [ ] **Step 1: Write failing test**

```typescript
// CLI/packages/agent/src/providers/_host/__tests__/keychain.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../pty.js', () => ({
  createPtyHost: () => ({
    run: vi.fn(),
    isAvailable: vi.fn().mockResolvedValue(true),
  }),
}));

import { createKeychainHost } from '../keychain.js';
import { createPtyHost } from '../pty.js';

describe('createKeychainHost', () => {
  let ptyRun: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    const pty = createPtyHost();
    ptyRun = pty.run as ReturnType<typeof vi.fn>;
  });

  it('returns password from macOS security output', async () => {
    ptyRun.mockResolvedValue({ stdout: 'sekret\n', stderr: '', exitCode: 0 });
    const kc = createKeychainHost({ platform: 'darwin' });
    const v = await kc.readPassword('Chrome Safe Storage', 'Chrome');
    expect(v).toBe('sekret');
  });

  it('returns null on lookup failure', async () => {
    ptyRun.mockResolvedValue({ stdout: '', stderr: 'not found', exitCode: 1 });
    const kc = createKeychainHost({ platform: 'darwin' });
    const v = await kc.readPassword('nope', 'nope');
    expect(v).toBeNull();
  });

  it('returns null on unsupported platforms', async () => {
    const kc = createKeychainHost({ platform: 'win32' });
    expect(await kc.readPassword('a', 'b')).toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect fail**

- [ ] **Step 3: Implement `keychain.ts`**

```typescript
// CLI/packages/agent/src/providers/_host/keychain.ts
import { createPtyHost, type PtyHost } from './pty.js';

export interface KeychainHost {
  readPassword(service: string, account: string): Promise<string | null>;
}

export interface KeychainConfig {
  platform?: NodeJS.Platform;
  pty?: PtyHost;
}

export function createKeychainHost(cfg: KeychainConfig = {}): KeychainHost {
  const platform = cfg.platform ?? process.platform;
  const pty = cfg.pty ?? createPtyHost();

  return {
    async readPassword(service, account) {
      try {
        if (platform === 'darwin') {
          const r = await pty.run({
            command: 'security',
            args: ['find-generic-password', '-w', '-s', service, '-a', account],
            timeoutMs: 3000,
          });
          if (r.exitCode !== 0) return null;
          return r.stdout.replace(/\n$/, '');
        }
        if (platform === 'linux') {
          const r = await pty.run({
            command: 'secret-tool',
            args: ['lookup', 'service', service, 'account', account],
            timeoutMs: 3000,
          });
          if (r.exitCode !== 0 || !r.stdout) return null;
          return r.stdout.replace(/\n$/, '');
        }
        return null;
      } catch { return null; }
    },
  };
}
```

- [ ] **Step 4: Run — expect pass**

- [ ] **Step 5: Commit**

```bash
git add CLI/packages/agent/src/providers/_host/keychain.ts \
        CLI/packages/agent/src/providers/_host/__tests__/keychain.test.ts
git commit -m "feat(host): keychain lookup via security + secret-tool

macOS uses 'security find-generic-password -w'; Linux uses 'secret-tool
lookup'. Windows returns null (credential manager support deferred).
Any lookup failure is swallowed into null — consumers fall back to the
next strategy."
```

### Task 2.4: `browser-cookies` host API (SQLite read, no decryption)

**Files:**
- Modify: `CLI/packages/agent/src/providers/_host/browser-cookies.ts`
- Test: `CLI/packages/agent/src/providers/_host/__tests__/browser-cookies.test.ts`

Chrome/Arc/Edge store cookies in a SQLite DB with values encrypted by an
OS-level key (macOS Keychain, Linux kwallet/libsecret, Windows DPAPI).
v0.1 reads the DB and returns rows with `value: ''` for encrypted rows —
cookies-http fetch strategies detect empty values and mark themselves
unavailable, falling back to other strategies. Full decryption is deferred
to a later release.

Important: copy the Cookies file to a temp location before opening (the
browser holds a write lock). Use `better-sqlite3` readonly mode.

- [ ] **Step 1: Write failing test**

```typescript
// CLI/packages/agent/src/providers/_host/__tests__/browser-cookies.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBrowserCookiesHost } from '../browser-cookies.js';

describe('createBrowserCookiesHost', () => {
  let dir: string;
  let cookiesPath: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'wt-cookies-'));
    cookiesPath = join(dir, 'Cookies');
    const db = new Database(cookiesPath);
    db.exec(`CREATE TABLE cookies (
      host_key TEXT, name TEXT, encrypted_value BLOB,
      path TEXT, expires_utc INTEGER, value TEXT
    );`);
    db.prepare(`INSERT INTO cookies VALUES (?, ?, ?, ?, ?, ?)`).run(
      '.cursor.com', 'session', Buffer.from([0x76, 0x31]), '/', 0, '',
    );
    db.prepare(`INSERT INTO cookies VALUES (?, ?, ?, ?, ?, ?)`).run(
      '.other.com', 'session', Buffer.alloc(0), '/', 0, '',
    );
    db.close();
  });

  afterAll(() => { rmSync(dir, { recursive: true, force: true }); });

  it('returns rows for matching domain, value empty when encrypted', async () => {
    const host = createBrowserCookiesHost({ resolvePath: () => cookiesPath });
    const rows = await host.read('.cursor.com');
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('session');
    expect(rows[0].value).toBe('');
  });

  it('returns [] when cookies file is missing', async () => {
    const host = createBrowserCookiesHost({ resolvePath: () => '/no/such/path/Cookies' });
    expect(await host.read('.cursor.com')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run — expect fail**

- [ ] **Step 3: Implement `browser-cookies.ts`**

```typescript
// CLI/packages/agent/src/providers/_host/browser-cookies.ts
import Database from 'better-sqlite3';
import { existsSync, copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';

export type Browser = 'chrome' | 'arc' | 'edge';

export interface CookieRecord {
  name: string;
  value: string;
  domain: string;
  path: string;
  expiresUtc?: number;
}

export interface BrowserCookiesHost {
  read(domain: string, browser?: Browser): Promise<CookieRecord[]>;
}

export interface BrowserCookiesConfig {
  resolvePath?: (browser: Browser) => string | null;
}

function defaultResolve(browser: Browser): string | null {
  const home = homedir();
  if (process.platform === 'darwin') {
    switch (browser) {
      case 'chrome': return join(home, 'Library/Application Support/Google/Chrome/Default/Cookies');
      case 'arc': return join(home, 'Library/Application Support/Arc/User Data/Default/Cookies');
      case 'edge': return join(home, 'Library/Application Support/Microsoft Edge/Default/Cookies');
    }
  }
  if (process.platform === 'linux') {
    switch (browser) {
      case 'chrome': return join(home, '.config/google-chrome/Default/Cookies');
      case 'edge': return join(home, '.config/microsoft-edge/Default/Cookies');
      case 'arc': return null;
    }
  }
  return null;
}

export function createBrowserCookiesHost(cfg: BrowserCookiesConfig = {}): BrowserCookiesHost {
  const resolve = cfg.resolvePath ?? defaultResolve;
  return {
    async read(domain, browser = 'chrome') {
      const src = resolve(browser);
      if (!src || !existsSync(src)) return [];
      const tmp = mkdtempSync(join(tmpdir(), 'wt-cookies-'));
      const copy = join(tmp, 'Cookies');
      try {
        copyFileSync(src, copy);
        const db = new Database(copy, { readonly: true, fileMustExist: true });
        const rows = db.prepare(
          `SELECT host_key as host, name, encrypted_value as enc, value, path, expires_utc as exp
           FROM cookies WHERE host_key LIKE ?`
        ).all(`%${domain}%`) as Array<{
          host: string; name: string; enc: Buffer; value: string; path: string; exp: number;
        }>;
        db.close();
        return rows.map(r => ({
          name: r.name,
          value: r.value || '', // decryption deferred
          domain: r.host,
          path: r.path,
          expiresUtc: r.exp || undefined,
        }));
      } catch { return []; }
      finally { rmSync(tmp, { recursive: true, force: true }); }
    },
  };
}
```

- [ ] **Step 4: Run — expect pass**

- [ ] **Step 5: Commit**

```bash
git add CLI/packages/agent/src/providers/_host/browser-cookies.ts \
        CLI/packages/agent/src/providers/_host/__tests__/browser-cookies.test.ts
git commit -m "feat(host): read browser cookie DB (no decryption yet)

Opens Chrome/Arc/Edge Cookies SQLite read-only (after copying to temp
to dodge the browser's write lock). Returns rows with value='' for
encrypted entries; cookies-http strategies skip when value is empty
and fall back to the next strategy. Native decryption is a later
phase."
```

### Task 2.5: `token-cost` host API (model → cost/1K lookups)

**Files:**
- Create: `CLI/packages/agent/src/providers/_host/token-cost-models.ts`
- Modify: `CLI/packages/agent/src/providers/_host/token-cost.ts`
- Test: `CLI/packages/agent/src/providers/_host/__tests__/token-cost.test.ts`

A simple lookup table keyed by `<provider>:<model>` → input/output USD per
1K tokens. Unknown models return 0 with a debug log. Each provider file in
`providers/<id>/models.ts` contributes its own entries by calling
`registerModelCost()` at module load (no import-side side effects other
than table mutation).

- [ ] **Step 1: Write failing test**

```typescript
// CLI/packages/agent/src/providers/_host/__tests__/token-cost.test.ts
import { describe, it, expect } from 'vitest';
import { createTokenCostHost } from '../token-cost.js';
import { registerModelCost, resetModelCostTable } from '../token-cost-models.js';

describe('createTokenCostHost', () => {
  it('returns 0 for unknown model', () => {
    resetModelCostTable();
    const h = createTokenCostHost();
    expect(h.estimate({ provider: 'claude', model: 'ghost', inputTokens: 1000, outputTokens: 1000 }))
      .toBe(0);
  });

  it('computes cost from registered entry', () => {
    resetModelCostTable();
    registerModelCost('claude', 'sonnet-4.5', { inputPer1K: 3, outputPer1K: 15 });
    const h = createTokenCostHost();
    // 2000 input @ $3/1K = $6; 1000 output @ $15/1K = $15; total $21
    expect(h.estimate({
      provider: 'claude', model: 'sonnet-4.5',
      inputTokens: 2000, outputTokens: 1000,
    })).toBeCloseTo(21, 5);
  });

  it('matches case-insensitively on model name', () => {
    resetModelCostTable();
    registerModelCost('claude', 'Opus-4', { inputPer1K: 15, outputPer1K: 75 });
    const h = createTokenCostHost();
    expect(h.estimate({
      provider: 'claude', model: 'opus-4',
      inputTokens: 1000, outputTokens: 0,
    })).toBeCloseTo(15, 5);
  });
});
```

- [ ] **Step 2: Run — expect fail**

- [ ] **Step 3: Create `token-cost-models.ts`**

```typescript
// CLI/packages/agent/src/providers/_host/token-cost-models.ts
export interface ModelCost {
  inputPer1K: number;
  outputPer1K: number;
}

const table = new Map<string, ModelCost>();

function key(provider: string, model: string): string {
  return `${provider.toLowerCase()}::${model.toLowerCase()}`;
}

export function registerModelCost(provider: string, model: string, cost: ModelCost): void {
  table.set(key(provider, model), cost);
}

export function lookupModelCost(provider: string, model: string): ModelCost | undefined {
  return table.get(key(provider, model));
}

export function resetModelCostTable(): void {
  table.clear();
}
```

- [ ] **Step 4: Replace `token-cost.ts`**

```typescript
// CLI/packages/agent/src/providers/_host/token-cost.ts
import { lookupModelCost } from './token-cost-models.js';

export interface TokenCostInput {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export interface TokenCostHost {
  estimate(input: TokenCostInput): number;
}

export function createTokenCostHost(): TokenCostHost {
  return {
    estimate(input) {
      const entry = lookupModelCost(input.provider, input.model);
      if (!entry) return 0;
      const inputCost = (input.inputTokens / 1000) * entry.inputPer1K;
      const outputCost = (input.outputTokens / 1000) * entry.outputPer1K;
      return inputCost + outputCost;
    },
  };
}
```

- [ ] **Step 5: Run — expect pass**

- [ ] **Step 6: Commit**

```bash
git add CLI/packages/agent/src/providers/_host/token-cost.ts \
        CLI/packages/agent/src/providers/_host/token-cost-models.ts \
        CLI/packages/agent/src/providers/_host/__tests__/token-cost.test.ts
git commit -m "feat(host): token-cost lookup table with registration API

Replaces Phase 1 stub. estimate() looks up <provider>::<model> (case-
insensitive) in a registered table and applies inputPer1K/outputPer1K
rates. Unknown models return 0. Each provider registers its own model
costs in providers/<id>/models.ts (Phase 2 tasks 2.7-2.10)."
```

### Task 2.6: Shared provider cache + fetch driver

**Files:**
- Create: `CLI/packages/agent/src/providers/_shared/cache.ts`
- Create: `CLI/packages/agent/src/providers/_shared/fetch-driver.ts`
- Test: `CLI/packages/agent/src/providers/_shared/__tests__/cache.test.ts`
- Test: `CLI/packages/agent/src/providers/_shared/__tests__/fetch-driver.test.ts`

The cache is an in-process `Map<ProviderId, { snapshot, fetchedAt }>` with
TTL on read. The fetch-driver wires a provider's plan (from Task 1.11) +
host APIs + cache: on a live request, it returns cached data if still
fresh, otherwise runs the pipeline, caches the result, and returns it.

- [ ] **Step 1: Write failing cache test**

```typescript
// CLI/packages/agent/src/providers/_shared/__tests__/cache.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createSnapshotCache } from '../cache.js';
import type { UsageSnapshot } from '../types.js';

const snap = (id: string): UsageSnapshot => ({
  providerId: id as UsageSnapshot['providerId'],
  fetchedAt: Date.now(),
  quotas: [],
  extras: [],
  identity: undefined,
});

describe('createSnapshotCache', () => {
  it('returns undefined when empty', () => {
    const c = createSnapshotCache();
    expect(c.get('claude', 60_000)).toBeUndefined();
  });

  it('returns snapshot when within TTL', () => {
    const c = createSnapshotCache();
    c.set('claude', snap('claude'));
    expect(c.get('claude', 60_000)?.providerId).toBe('claude');
  });

  it('returns undefined when TTL expired', () => {
    const now = 1_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const c = createSnapshotCache();
    c.set('claude', { ...snap('claude'), fetchedAt: now });
    vi.spyOn(Date, 'now').mockReturnValue(now + 120_000);
    expect(c.get('claude', 60_000)).toBeUndefined();
    vi.restoreAllMocks();
  });

  it('clear() removes all entries', () => {
    const c = createSnapshotCache();
    c.set('claude', snap('claude'));
    c.set('cursor', snap('cursor'));
    c.clear();
    expect(c.get('claude', 60_000)).toBeUndefined();
    expect(c.get('cursor', 60_000)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run — expect fail**

- [ ] **Step 3: Implement `cache.ts`**

```typescript
// CLI/packages/agent/src/providers/_shared/cache.ts
import type { ProviderId, UsageSnapshot } from './types.js';

export interface SnapshotCache {
  get(id: ProviderId, ttlMs: number): UsageSnapshot | undefined;
  set(id: ProviderId, snap: UsageSnapshot): void;
  invalidate(id: ProviderId): void;
  clear(): void;
}

export function createSnapshotCache(): SnapshotCache {
  const store = new Map<ProviderId, UsageSnapshot>();
  return {
    get(id, ttlMs) {
      const entry = store.get(id);
      if (!entry) return undefined;
      if (Date.now() - entry.fetchedAt > ttlMs) return undefined;
      return entry;
    },
    set(id, snap) { store.set(id, snap); },
    invalidate(id) { store.delete(id); },
    clear() { store.clear(); },
  };
}
```

- [ ] **Step 4: Write failing fetch-driver test**

```typescript
// CLI/packages/agent/src/providers/_shared/__tests__/fetch-driver.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createFetchDriver } from '../fetch-driver.js';
import { createSnapshotCache } from '../cache.js';
import type {
  ProviderDescriptor, ProviderFetchPlan, UsageSnapshot, HostAPIs,
} from '../types.js';

const descriptor = (id: string): ProviderDescriptor => ({
  metadata: {
    id: id as ProviderDescriptor['metadata']['id'],
    displayName: id,
    vendor: id,
    category: 'assistant',
    website: 'https://x',
  },
  branding: { icon: 'x', accent: '#000' },
  capabilities: { refreshIntervalMs: 60_000, quotaBar: undefined, detailSections: [] },
});

const plan = (perform: () => Promise<UsageSnapshot>): ProviderFetchPlan => ({
  strategies: [{ kind: 'apikey-http', shouldFallback: true, perform }],
});

const fakeHost = {} as HostAPIs;

describe('createFetchDriver', () => {
  it('returns cached snapshot when fresh', async () => {
    const cache = createSnapshotCache();
    const cachedSnap: UsageSnapshot = {
      providerId: 'claude', fetchedAt: Date.now(),
      quotas: [], extras: [], identity: undefined,
    };
    cache.set('claude', cachedSnap);
    const perform = vi.fn();
    const driver = createFetchDriver({ cache, host: fakeHost });
    const res = await driver.fetch(descriptor('claude'), plan(perform));
    expect(res).toBe(cachedSnap);
    expect(perform).not.toHaveBeenCalled();
  });

  it('runs pipeline on cache miss and caches result', async () => {
    const cache = createSnapshotCache();
    const freshSnap: UsageSnapshot = {
      providerId: 'claude', fetchedAt: Date.now(),
      quotas: [], extras: [], identity: undefined,
    };
    const perform = vi.fn().mockResolvedValue(freshSnap);
    const driver = createFetchDriver({ cache, host: fakeHost });
    const res = await driver.fetch(descriptor('claude'), plan(perform));
    expect(res).toBe(freshSnap);
    expect(cache.get('claude', 60_000)).toBe(freshSnap);
  });

  it('bypasses cache when force=true', async () => {
    const cache = createSnapshotCache();
    cache.set('claude', {
      providerId: 'claude', fetchedAt: Date.now(),
      quotas: [], extras: [], identity: undefined,
    });
    const fresh: UsageSnapshot = {
      providerId: 'claude', fetchedAt: Date.now(),
      quotas: [], extras: [], identity: undefined,
    };
    const perform = vi.fn().mockResolvedValue(fresh);
    const driver = createFetchDriver({ cache, host: fakeHost });
    const res = await driver.fetch(descriptor('claude'), plan(perform), { force: true });
    expect(res).toBe(fresh);
    expect(perform).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 5: Implement `fetch-driver.ts`**

```typescript
// CLI/packages/agent/src/providers/_shared/fetch-driver.ts
import { runPipeline } from './fetch-pipeline.js';
import type {
  HostAPIs, ProviderDescriptor, ProviderFetchPlan, UsageSnapshot,
} from './types.js';
import type { SnapshotCache } from './cache.js';

export interface FetchDriverConfig {
  cache: SnapshotCache;
  host: HostAPIs;
}

export interface FetchOptions {
  force?: boolean;
}

export interface FetchDriver {
  fetch(
    descriptor: ProviderDescriptor,
    plan: ProviderFetchPlan,
    opts?: FetchOptions,
  ): Promise<UsageSnapshot>;
}

export function createFetchDriver(cfg: FetchDriverConfig): FetchDriver {
  return {
    async fetch(descriptor, plan, opts = {}) {
      const ttl = descriptor.capabilities.refreshIntervalMs;
      if (!opts.force) {
        const hit = cfg.cache.get(descriptor.metadata.id, ttl);
        if (hit) return hit;
      }
      const ctx = {
        providerId: descriptor.metadata.id,
        host: cfg.host,
        now: () => Date.now(),
      };
      const snap = await runPipeline(ctx, plan.strategies);
      cfg.cache.set(descriptor.metadata.id, snap);
      return snap;
    },
  };
}
```

- [ ] **Step 6: Run — expect pass (both suites)**

```bash
npx vitest run src/providers/_shared/__tests__/cache.test.ts \
               src/providers/_shared/__tests__/fetch-driver.test.ts
```

- [ ] **Step 7: Commit**

```bash
git add CLI/packages/agent/src/providers/_shared/cache.ts \
        CLI/packages/agent/src/providers/_shared/fetch-driver.ts \
        CLI/packages/agent/src/providers/_shared/__tests__/cache.test.ts \
        CLI/packages/agent/src/providers/_shared/__tests__/fetch-driver.test.ts
git commit -m "feat(providers): in-memory snapshot cache + fetch driver

Cache keys on ProviderId with descriptor.capabilities.refreshIntervalMs
TTL. fetch-driver pulls from cache, runs runPipeline on miss, stores
the winning snapshot. Force flag bypasses cache for manual refresh
(CLI --refresh and /providers?refresh=1)."
```

### Task 2.7: Claude provider (apikey-http + cli-pty + parser + models)

**Files:**
- Create: `CLI/packages/agent/src/providers/claude/models.ts`
- Create: `CLI/packages/agent/src/providers/claude/parser.ts`
- Create: `CLI/packages/agent/src/providers/claude/strategies.ts`
- Modify: `CLI/packages/agent/src/providers/claude/descriptor.ts` (populate the Phase 1 stub)
- Create: `CLI/packages/agent/src/providers/claude/index.ts`
- Test: `CLI/packages/agent/src/providers/claude/__tests__/parser.test.ts`
- Fixture: `CLI/packages/agent/src/providers/claude/__tests__/fixtures/apikey-usage.json`
- Fixture: `CLI/packages/agent/src/providers/claude/__tests__/fixtures/cli-usage.json`

Two strategies ship in v0.1:
1. `apikey-http` — reads `ANTHROPIC_API_KEY` from env, calls Anthropic's
   org usage endpoint, parses monthly quota + burn rate.
2. `cli-pty` — runs `claude usage --json` when the Claude CLI is on PATH,
   parses the same shape the CLI emits.

Both produce the same `UsageSnapshot`. A third strategy
(`cookies-http` for console.anthropic.com) is scoped into Phase 5.

- [ ] **Step 1: Write `models.ts` (costs + side-effect registration)**

```typescript
// CLI/packages/agent/src/providers/claude/models.ts
import { registerModelCost } from '../_host/token-cost-models.js';

// Prices in USD per 1K tokens. Source: anthropic.com/pricing (verify
// before release; update when Anthropic changes rates).
export const CLAUDE_MODELS = [
  { id: 'claude-opus-4-6',        inputPer1K: 15,   outputPer1K: 75   },
  { id: 'claude-sonnet-4-6',      inputPer1K: 3,    outputPer1K: 15   },
  { id: 'claude-haiku-4-5',       inputPer1K: 0.80, outputPer1K: 4    },
  { id: 'claude-3-5-sonnet',      inputPer1K: 3,    outputPer1K: 15   },
  { id: 'claude-3-5-haiku',       inputPer1K: 0.80, outputPer1K: 4    },
  { id: 'claude-3-opus',          inputPer1K: 15,   outputPer1K: 75   },
] as const;

for (const m of CLAUDE_MODELS) {
  registerModelCost('claude', m.id, { inputPer1K: m.inputPer1K, outputPer1K: m.outputPer1K });
}
```

- [ ] **Step 2: Write fixtures**

```json
// CLI/packages/agent/src/providers/claude/__tests__/fixtures/apikey-usage.json
{
  "organization": { "id": "org_abc", "name": "Acme Corp" },
  "plan": { "id": "team", "limit_usd": 100, "used_usd": 42.5 },
  "period": { "start": "2026-04-01T00:00:00Z", "end": "2026-04-30T23:59:59Z" },
  "models": [
    { "id": "claude-sonnet-4-6", "input_tokens": 2000000, "output_tokens": 500000 },
    { "id": "claude-haiku-4-5",  "input_tokens": 8000000, "output_tokens": 1200000 }
  ]
}
```

```json
// CLI/packages/agent/src/providers/claude/__tests__/fixtures/cli-usage.json
{
  "account": "alice@example.com",
  "plan": "pro",
  "period_end": "2026-04-30T23:59:59Z",
  "messages_used": 245,
  "messages_limit": 400,
  "tokens_used": 1234567
}
```

- [ ] **Step 3: Write failing parser test**

```typescript
// CLI/packages/agent/src/providers/claude/__tests__/parser.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseApiKeyResponse, parseCliUsageResponse } from '../parser.js';

const load = (name: string) => JSON.parse(readFileSync(
  join(__dirname, 'fixtures', name), 'utf8',
));

describe('claude parser', () => {
  it('parseApiKeyResponse maps plan limit into quota bar', () => {
    const snap = parseApiKeyResponse(load('apikey-usage.json'), 1_700_000_000_000);
    expect(snap.providerId).toBe('claude');
    expect(snap.fetchedAt).toBe(1_700_000_000_000);
    expect(snap.identity?.account).toBe('Acme Corp');
    expect(snap.quotas[0].unit).toBe('usd');
    expect(snap.quotas[0].used).toBeCloseTo(42.5, 5);
    expect(snap.quotas[0].limit).toBe(100);
    expect(snap.quotas[0].label).toMatch(/team/i);
  });

  it('parseApiKeyResponse rolls up per-model token extras', () => {
    const snap = parseApiKeyResponse(load('apikey-usage.json'), 0);
    const tokens = snap.extras.find(e => e.label?.toLowerCase().includes('token'));
    expect(tokens?.used).toBe(2000000 + 500000 + 8000000 + 1200000);
  });

  it('parseCliUsageResponse builds a message-count quota bar', () => {
    const snap = parseCliUsageResponse(load('cli-usage.json'), 123);
    expect(snap.providerId).toBe('claude');
    expect(snap.fetchedAt).toBe(123);
    expect(snap.quotas[0].unit).toBe('messages');
    expect(snap.quotas[0].used).toBe(245);
    expect(snap.quotas[0].limit).toBe(400);
    expect(snap.identity?.account).toBe('alice@example.com');
  });

  it('parseCliUsageResponse tolerates missing fields (returns empty extras)', () => {
    const snap = parseCliUsageResponse({ account: 'a@b.co' }, 0);
    expect(snap.quotas).toEqual([]);
    expect(snap.extras).toEqual([]);
  });
});
```

- [ ] **Step 4: Run — expect fail**

```bash
npx vitest run src/providers/claude/__tests__/parser.test.ts
```

- [ ] **Step 5: Implement `parser.ts`**

```typescript
// CLI/packages/agent/src/providers/claude/parser.ts
import type { UsageSnapshot } from '../_shared/types.js';

interface ApiKeyResponse {
  organization?: { id?: string; name?: string };
  plan?: { id?: string; limit_usd?: number; used_usd?: number };
  period?: { start?: string; end?: string };
  models?: Array<{ id: string; input_tokens: number; output_tokens: number }>;
}

export function parseApiKeyResponse(raw: unknown, fetchedAt: number): UsageSnapshot {
  const r = (raw ?? {}) as ApiKeyResponse;
  const plan = r.plan ?? {};
  const quotas: UsageSnapshot['quotas'] = [];
  if (typeof plan.used_usd === 'number' && typeof plan.limit_usd === 'number') {
    quotas.push({
      label: `${plan.id ?? 'plan'} cap`,
      unit: 'usd',
      used: plan.used_usd,
      limit: plan.limit_usd,
      periodEnd: r.period?.end,
    });
  }
  const extras: UsageSnapshot['extras'] = [];
  if (Array.isArray(r.models) && r.models.length > 0) {
    const totalTokens = r.models.reduce(
      (acc, m) => acc + (m.input_tokens ?? 0) + (m.output_tokens ?? 0), 0,
    );
    extras.push({ label: 'Total tokens (period)', value: totalTokens, unit: 'tokens' });
  }
  return {
    providerId: 'claude',
    fetchedAt,
    quotas,
    extras,
    identity: r.organization?.name
      ? { account: r.organization.name, plan: plan.id }
      : undefined,
  };
}

interface CliUsageResponse {
  account?: string;
  plan?: string;
  period_end?: string;
  messages_used?: number;
  messages_limit?: number;
  tokens_used?: number;
}

export function parseCliUsageResponse(raw: unknown, fetchedAt: number): UsageSnapshot {
  const r = (raw ?? {}) as CliUsageResponse;
  const quotas: UsageSnapshot['quotas'] = [];
  if (typeof r.messages_used === 'number' && typeof r.messages_limit === 'number') {
    quotas.push({
      label: `${r.plan ?? 'plan'} messages`,
      unit: 'messages',
      used: r.messages_used,
      limit: r.messages_limit,
      periodEnd: r.period_end,
    });
  }
  const extras: UsageSnapshot['extras'] = [];
  if (typeof r.tokens_used === 'number') {
    extras.push({ label: 'Tokens used', value: r.tokens_used, unit: 'tokens' });
  }
  return {
    providerId: 'claude',
    fetchedAt,
    quotas,
    extras,
    identity: r.account ? { account: r.account, plan: r.plan } : undefined,
  };
}
```

- [ ] **Step 6: Run — expect pass**

Expected: 4 passed.

- [ ] **Step 7: Implement `strategies.ts`**

```typescript
// CLI/packages/agent/src/providers/claude/strategies.ts
import type { ProviderFetchStrategy, FetchContext } from '../_shared/types.js';
import { parseApiKeyResponse, parseCliUsageResponse } from './parser.js';

const ANTHROPIC_USAGE_URL = 'https://api.anthropic.com/v1/organizations/usage';

export const apiKeyHttp: ProviderFetchStrategy = {
  kind: 'apikey-http',
  shouldFallback: true,
  async preconditions() {
    return { available: Boolean(process.env.ANTHROPIC_API_KEY), reason: 'ANTHROPIC_API_KEY env missing' };
  },
  async perform(ctx: FetchContext) {
    const key = process.env.ANTHROPIC_API_KEY!;
    const res = await ctx.host.http.request({
      url: ANTHROPIC_USAGE_URL,
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      timeoutMs: 10_000,
      retries: 1,
    });
    return parseApiKeyResponse(res.body, ctx.now());
  },
};

export const cliPty: ProviderFetchStrategy = {
  kind: 'cli-pty',
  shouldFallback: true,
  async preconditions(ctx: FetchContext) {
    const ok = await ctx.host.pty.isAvailable('claude');
    return { available: ok, reason: ok ? undefined : 'claude CLI not on PATH' };
  },
  async perform(ctx: FetchContext) {
    const r = await ctx.host.pty.run({
      command: 'claude',
      args: ['usage', '--json'],
      timeoutMs: 8_000,
    });
    if (r.exitCode !== 0) throw new Error(`claude usage exited ${r.exitCode}`);
    const parsed = JSON.parse(r.stdout);
    return parseCliUsageResponse(parsed, ctx.now());
  },
};
```

- [ ] **Step 8: Populate `descriptor.ts` (replacing Phase 1 stub body)**

```typescript
// CLI/packages/agent/src/providers/claude/descriptor.ts
import type { ProviderDescriptor } from '../_shared/types.js';

export const descriptor: ProviderDescriptor = {
  metadata: {
    id: 'claude',
    displayName: 'Claude',
    vendor: 'Anthropic',
    category: 'assistant',
    website: 'https://claude.ai',
  },
  branding: { icon: 'C', accent: '#D97757' },
  capabilities: {
    refreshIntervalMs: 60_000,
    quotaBar: { label: 'Monthly', unit: 'usd' },
    detailSections: ['plan', 'period', 'models'],
  },
};
```

- [ ] **Step 9: Write `index.ts`**

```typescript
// CLI/packages/agent/src/providers/claude/index.ts
import { descriptor } from './descriptor.js';
import { apiKeyHttp, cliPty } from './strategies.js';
import type { ProviderDescriptor, ProviderFetchPlan } from '../_shared/types.js';
import './models.js'; // side-effect: registers model costs

export const claude: ProviderDescriptor = descriptor;
export const claudePlan: ProviderFetchPlan = {
  strategies: [apiKeyHttp, cliPty],
};
```

- [ ] **Step 10: Build-check**

```bash
cd CLI && npm run build --workspaces
```

- [ ] **Step 11: Commit**

```bash
git add CLI/packages/agent/src/providers/claude/
git commit -m "feat(providers/claude): apikey-http + cli-pty strategies

Strategies: apikey-http hits Anthropic org usage with ANTHROPIC_API_KEY;
cli-pty runs 'claude usage --json' when the CLI is installed. Both
emit a normalized UsageSnapshot. Parser handles both fixtures (golden-
file tests). Models table registers six model costs into the shared
token-cost table for later per-session cost attribution."
```

### Task 2.8: Cursor provider (local-config-scan + parser)

**Files:**
- Create: `CLI/packages/agent/src/providers/cursor/models.ts`
- Create: `CLI/packages/agent/src/providers/cursor/parser.ts`
- Create: `CLI/packages/agent/src/providers/cursor/strategies.ts`
- Modify: `CLI/packages/agent/src/providers/cursor/descriptor.ts`
- Create: `CLI/packages/agent/src/providers/cursor/index.ts`
- Test: `CLI/packages/agent/src/providers/cursor/__tests__/parser.test.ts`
- Fixture: `CLI/packages/agent/src/providers/cursor/__tests__/fixtures/config.json`

Cursor's in-app usage lives in `~/Library/Application Support/Cursor/User/
globalStorage/cursor.cursor/state.json` (macOS) and similar paths on
Linux/Windows. v0.1 ships with `local-config-scan` as the primary strategy;
`cookies-http` (calling `cursor.com/api/usage`) lands as a stretch in a
later phase once browser-cookie decryption is wired up.

- [ ] **Step 1: Write `models.ts`**

```typescript
// CLI/packages/agent/src/providers/cursor/models.ts
// Cursor exposes quota in "requests" (fast/slow). Token pricing N/A.
// This file is a no-op today but exists for parity with claude/models.ts
// so the provider wiring in Task 2.11 can uniformly import it.
export const CURSOR_QUOTA_UNIT = 'requests' as const;
```

- [ ] **Step 2: Write fixture**

```json
// CLI/packages/agent/src/providers/cursor/__tests__/fixtures/config.json
{
  "user": { "email": "alice@example.com", "plan": "pro" },
  "usage": {
    "periodStart": "2026-04-01T00:00:00Z",
    "periodEnd":   "2026-04-30T23:59:59Z",
    "fastRequests": { "used": 342, "limit": 500 },
    "slowRequests": { "used": 40 }
  }
}
```

- [ ] **Step 3: Write failing parser test**

```typescript
// CLI/packages/agent/src/providers/cursor/__tests__/parser.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCursorConfig } from '../parser.js';

const load = () => JSON.parse(readFileSync(
  join(__dirname, 'fixtures/config.json'), 'utf8',
));

describe('cursor parser', () => {
  it('maps fastRequests to the primary quota bar', () => {
    const snap = parseCursorConfig(load(), 1700);
    expect(snap.providerId).toBe('cursor');
    expect(snap.quotas[0].unit).toBe('requests');
    expect(snap.quotas[0].used).toBe(342);
    expect(snap.quotas[0].limit).toBe(500);
    expect(snap.quotas[0].label.toLowerCase()).toContain('fast');
    expect(snap.quotas[0].periodEnd).toBe('2026-04-30T23:59:59Z');
  });

  it('adds slowRequests as an unlimited extra', () => {
    const snap = parseCursorConfig(load(), 0);
    const slow = snap.extras.find(e => e.label?.toLowerCase().includes('slow'));
    expect(slow?.used).toBe(40);
    expect(slow?.limit).toBeUndefined();
  });

  it('extracts identity from user.email / user.plan', () => {
    const snap = parseCursorConfig(load(), 0);
    expect(snap.identity?.account).toBe('alice@example.com');
    expect(snap.identity?.plan).toBe('pro');
  });

  it('returns empty snapshot when fields missing', () => {
    const snap = parseCursorConfig({}, 0);
    expect(snap.quotas).toEqual([]);
    expect(snap.extras).toEqual([]);
    expect(snap.identity).toBeUndefined();
  });
});
```

- [ ] **Step 4: Run — expect fail**

- [ ] **Step 5: Implement `parser.ts`**

```typescript
// CLI/packages/agent/src/providers/cursor/parser.ts
import type { UsageSnapshot } from '../_shared/types.js';

interface CursorConfig {
  user?: { email?: string; plan?: string };
  usage?: {
    periodStart?: string;
    periodEnd?: string;
    fastRequests?: { used?: number; limit?: number };
    slowRequests?: { used?: number; limit?: number };
  };
}

export function parseCursorConfig(raw: unknown, fetchedAt: number): UsageSnapshot {
  const r = (raw ?? {}) as CursorConfig;
  const u = r.usage ?? {};
  const quotas: UsageSnapshot['quotas'] = [];
  if (u.fastRequests && typeof u.fastRequests.used === 'number'
      && typeof u.fastRequests.limit === 'number') {
    quotas.push({
      label: 'Fast requests',
      unit: 'requests',
      used: u.fastRequests.used,
      limit: u.fastRequests.limit,
      periodEnd: u.periodEnd,
    });
  }
  const extras: UsageSnapshot['extras'] = [];
  if (u.slowRequests && typeof u.slowRequests.used === 'number') {
    extras.push({
      label: 'Slow requests',
      value: u.slowRequests.used,
      unit: 'requests',
      limit: u.slowRequests.limit,
    });
  }
  const identity = r.user?.email
    ? { account: r.user.email, plan: r.user.plan }
    : undefined;
  return { providerId: 'cursor', fetchedAt, quotas, extras, identity };
}
```

- [ ] **Step 6: Run — expect pass**

- [ ] **Step 7: Implement `strategies.ts`**

```typescript
// CLI/packages/agent/src/providers/cursor/strategies.ts
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { ProviderFetchStrategy, FetchContext } from '../_shared/types.js';
import { parseCursorConfig } from './parser.js';

function resolveCursorStatePath(): string | null {
  const home = homedir();
  if (process.platform === 'darwin') {
    return join(home, 'Library/Application Support/Cursor/User/globalStorage/cursor.cursor/state.json');
  }
  if (process.platform === 'linux') {
    return join(home, '.config/Cursor/User/globalStorage/cursor.cursor/state.json');
  }
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA ?? join(home, 'AppData/Roaming');
    return join(appData, 'Cursor/User/globalStorage/cursor.cursor/state.json');
  }
  return null;
}

export const localConfigScan: ProviderFetchStrategy = {
  kind: 'local-config-scan',
  shouldFallback: true,
  async preconditions() {
    const p = resolveCursorStatePath();
    const ok = Boolean(p && existsSync(p));
    return { available: ok, reason: ok ? undefined : 'cursor state.json not found' };
  },
  async perform(ctx: FetchContext) {
    const p = resolveCursorStatePath();
    if (!p) throw new Error('cursor state path could not be resolved');
    const raw = JSON.parse(readFileSync(p, 'utf8'));
    return parseCursorConfig(raw, ctx.now());
  },
};
```

- [ ] **Step 8: Populate `descriptor.ts`**

```typescript
// CLI/packages/agent/src/providers/cursor/descriptor.ts
import type { ProviderDescriptor } from '../_shared/types.js';

export const descriptor: ProviderDescriptor = {
  metadata: {
    id: 'cursor',
    displayName: 'Cursor',
    vendor: 'Anysphere',
    category: 'ide',
    website: 'https://cursor.com',
  },
  branding: { icon: 'Cu', accent: '#000000' },
  capabilities: {
    refreshIntervalMs: 120_000,
    quotaBar: { label: 'Fast', unit: 'requests' },
    detailSections: ['period', 'fast', 'slow'],
  },
};
```

- [ ] **Step 9: Write `index.ts`**

```typescript
// CLI/packages/agent/src/providers/cursor/index.ts
import { descriptor } from './descriptor.js';
import { localConfigScan } from './strategies.js';
import type { ProviderDescriptor, ProviderFetchPlan } from '../_shared/types.js';
import './models.js';

export const cursor: ProviderDescriptor = descriptor;
export const cursorPlan: ProviderFetchPlan = {
  strategies: [localConfigScan],
};
```

- [ ] **Step 10: Build-check**

```bash
cd CLI && npm run build --workspaces
```

- [ ] **Step 11: Commit**

```bash
git add CLI/packages/agent/src/providers/cursor/
git commit -m "feat(providers/cursor): local-config-scan strategy

Reads Cursor's state.json from the platform-specific Application Support
path (macOS/Linux/Windows). Parser converts fastRequests into the
primary quota bar and slowRequests into an unlimited extra. Identity
falls back to user.email / user.plan. cookies-http (cursor.com/api
usage) is deferred pending browser-cookie decryption."
```

### Task 2.9: Codex provider (cli-pty + local-config-scan)

**Files:**
- Create: `CLI/packages/agent/src/providers/codex/models.ts`
- Create: `CLI/packages/agent/src/providers/codex/parser.ts`
- Create: `CLI/packages/agent/src/providers/codex/strategies.ts`
- Modify: `CLI/packages/agent/src/providers/codex/descriptor.ts`
- Create: `CLI/packages/agent/src/providers/codex/index.ts`
- Test: `CLI/packages/agent/src/providers/codex/__tests__/parser.test.ts`
- Fixture: `CLI/packages/agent/src/providers/codex/__tests__/fixtures/cli-usage.json`
- Fixture: `CLI/packages/agent/src/providers/codex/__tests__/fixtures/auth-cache.json`

Two strategies:
1. `cli-pty` — `codex usage --json` via `codex` CLI if installed.
2. `local-config-scan` — reads `~/.codex/usage_cache.json` (the CLI writes
   a cached snapshot here) as a fallback when the binary isn't present.

- [ ] **Step 1: Write `models.ts`**

```typescript
// CLI/packages/agent/src/providers/codex/models.ts
import { registerModelCost } from '../_host/token-cost-models.js';

// OpenAI Codex/gpt-5-codex pricing. Update rates before release.
export const CODEX_MODELS = [
  { id: 'gpt-5-codex',         inputPer1K: 5,    outputPer1K: 15 },
  { id: 'gpt-5-codex-mini',    inputPer1K: 0.5,  outputPer1K: 2  },
  { id: 'o4-mini',             inputPer1K: 1.1,  outputPer1K: 4.4 },
] as const;

for (const m of CODEX_MODELS) {
  registerModelCost('codex', m.id, { inputPer1K: m.inputPer1K, outputPer1K: m.outputPer1K });
}
```

- [ ] **Step 2: Write fixtures**

```json
// CLI/packages/agent/src/providers/codex/__tests__/fixtures/cli-usage.json
{
  "account": "alice@openai.com",
  "tier": "plus",
  "period_end": "2026-04-30T23:59:59Z",
  "credits": { "used": 18.42, "limit": 50 },
  "tokens": { "input": 3200000, "output": 410000 }
}
```

```json
// CLI/packages/agent/src/providers/codex/__tests__/fixtures/auth-cache.json
{
  "email": "bob@example.com",
  "plan": "free",
  "usage_cached_at": "2026-04-16T08:00:00Z",
  "messages_used": 80,
  "messages_limit": 100
}
```

- [ ] **Step 3: Write failing parser test**

```typescript
// CLI/packages/agent/src/providers/codex/__tests__/parser.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCodexCliUsage, parseCodexAuthCache } from '../parser.js';

const load = (name: string) => JSON.parse(readFileSync(
  join(__dirname, 'fixtures', name), 'utf8',
));

describe('codex parser', () => {
  it('parseCodexCliUsage builds USD quota + token extras', () => {
    const snap = parseCodexCliUsage(load('cli-usage.json'), 1000);
    expect(snap.providerId).toBe('codex');
    expect(snap.fetchedAt).toBe(1000);
    expect(snap.quotas[0].unit).toBe('usd');
    expect(snap.quotas[0].used).toBeCloseTo(18.42, 2);
    expect(snap.quotas[0].limit).toBe(50);
    const tok = snap.extras.find(e => e.label?.toLowerCase().includes('token'));
    expect(tok?.used).toBe(3200000 + 410000);
    expect(snap.identity?.account).toBe('alice@openai.com');
    expect(snap.identity?.plan).toBe('plus');
  });

  it('parseCodexAuthCache builds messages quota bar', () => {
    const snap = parseCodexAuthCache(load('auth-cache.json'), 0);
    expect(snap.quotas[0].unit).toBe('messages');
    expect(snap.quotas[0].used).toBe(80);
    expect(snap.quotas[0].limit).toBe(100);
    expect(snap.identity?.account).toBe('bob@example.com');
  });

  it('tolerates missing fields', () => {
    expect(parseCodexCliUsage({}, 0).quotas).toEqual([]);
    expect(parseCodexAuthCache({}, 0).quotas).toEqual([]);
  });
});
```

- [ ] **Step 4: Run — expect fail**

- [ ] **Step 5: Implement `parser.ts`**

```typescript
// CLI/packages/agent/src/providers/codex/parser.ts
import type { UsageSnapshot } from '../_shared/types.js';

interface CliUsage {
  account?: string;
  tier?: string;
  period_end?: string;
  credits?: { used?: number; limit?: number };
  tokens?: { input?: number; output?: number };
}

export function parseCodexCliUsage(raw: unknown, fetchedAt: number): UsageSnapshot {
  const r = (raw ?? {}) as CliUsage;
  const quotas: UsageSnapshot['quotas'] = [];
  if (typeof r.credits?.used === 'number' && typeof r.credits?.limit === 'number') {
    quotas.push({
      label: `${r.tier ?? 'plan'} credits`,
      unit: 'usd',
      used: r.credits.used,
      limit: r.credits.limit,
      periodEnd: r.period_end,
    });
  }
  const extras: UsageSnapshot['extras'] = [];
  if (typeof r.tokens?.input === 'number' || typeof r.tokens?.output === 'number') {
    extras.push({
      label: 'Tokens (period)',
      value: (r.tokens?.input ?? 0) + (r.tokens?.output ?? 0),
      unit: 'tokens',
    });
  }
  return {
    providerId: 'codex',
    fetchedAt,
    quotas,
    extras,
    identity: r.account ? { account: r.account, plan: r.tier } : undefined,
  };
}

interface AuthCache {
  email?: string;
  plan?: string;
  usage_cached_at?: string;
  messages_used?: number;
  messages_limit?: number;
}

export function parseCodexAuthCache(raw: unknown, fetchedAt: number): UsageSnapshot {
  const r = (raw ?? {}) as AuthCache;
  const quotas: UsageSnapshot['quotas'] = [];
  if (typeof r.messages_used === 'number' && typeof r.messages_limit === 'number') {
    quotas.push({
      label: `${r.plan ?? 'plan'} messages`,
      unit: 'messages',
      used: r.messages_used,
      limit: r.messages_limit,
    });
  }
  return {
    providerId: 'codex',
    fetchedAt,
    quotas,
    extras: [],
    identity: r.email ? { account: r.email, plan: r.plan } : undefined,
  };
}
```

- [ ] **Step 6: Run — expect pass**

- [ ] **Step 7: Implement `strategies.ts`**

```typescript
// CLI/packages/agent/src/providers/codex/strategies.ts
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { ProviderFetchStrategy, FetchContext } from '../_shared/types.js';
import { parseCodexCliUsage, parseCodexAuthCache } from './parser.js';

export const cliPty: ProviderFetchStrategy = {
  kind: 'cli-pty',
  shouldFallback: true,
  async preconditions(ctx: FetchContext) {
    const ok = await ctx.host.pty.isAvailable('codex');
    return { available: ok, reason: ok ? undefined : 'codex CLI not on PATH' };
  },
  async perform(ctx: FetchContext) {
    const r = await ctx.host.pty.run({
      command: 'codex',
      args: ['usage', '--json'],
      timeoutMs: 8_000,
    });
    if (r.exitCode !== 0) throw new Error(`codex usage exited ${r.exitCode}`);
    return parseCodexCliUsage(JSON.parse(r.stdout), ctx.now());
  },
};

function authCachePath(): string {
  return join(homedir(), '.codex', 'usage_cache.json');
}

export const localConfigScan: ProviderFetchStrategy = {
  kind: 'local-config-scan',
  shouldFallback: true,
  async preconditions() {
    return {
      available: existsSync(authCachePath()),
      reason: '~/.codex/usage_cache.json not present',
    };
  },
  async perform(ctx: FetchContext) {
    const raw = JSON.parse(readFileSync(authCachePath(), 'utf8'));
    return parseCodexAuthCache(raw, ctx.now());
  },
};
```

- [ ] **Step 8: Populate `descriptor.ts`**

```typescript
// CLI/packages/agent/src/providers/codex/descriptor.ts
import type { ProviderDescriptor } from '../_shared/types.js';

export const descriptor: ProviderDescriptor = {
  metadata: {
    id: 'codex',
    displayName: 'Codex',
    vendor: 'OpenAI',
    category: 'assistant',
    website: 'https://openai.com/codex',
  },
  branding: { icon: 'O', accent: '#10A37F' },
  capabilities: {
    refreshIntervalMs: 60_000,
    quotaBar: { label: 'Credits', unit: 'usd' },
    detailSections: ['plan', 'period', 'tokens'],
  },
};
```

- [ ] **Step 9: Write `index.ts`**

```typescript
// CLI/packages/agent/src/providers/codex/index.ts
import { descriptor } from './descriptor.js';
import { cliPty, localConfigScan } from './strategies.js';
import type { ProviderDescriptor, ProviderFetchPlan } from '../_shared/types.js';
import './models.js';

export const codex: ProviderDescriptor = descriptor;
export const codexPlan: ProviderFetchPlan = {
  strategies: [cliPty, localConfigScan],
};
```

- [ ] **Step 10: Build-check + commit**

```bash
cd CLI && npm run build --workspaces && cd ..
git add CLI/packages/agent/src/providers/codex/
git commit -m "feat(providers/codex): cli-pty + local-config-scan strategies

cli-pty runs 'codex usage --json' when the OpenAI Codex CLI is on PATH;
falls back to reading ~/.codex/usage_cache.json when the binary is
unavailable. Parser covers both shapes (credits-USD for cli, messages
for auth cache). Three model costs registered for attribution."
```

### Task 2.10: Copilot provider (oauth-http + local-config-scan)

**Files:**
- Create: `CLI/packages/agent/src/providers/copilot/models.ts`
- Create: `CLI/packages/agent/src/providers/copilot/parser.ts`
- Create: `CLI/packages/agent/src/providers/copilot/strategies.ts`
- Modify: `CLI/packages/agent/src/providers/copilot/descriptor.ts`
- Create: `CLI/packages/agent/src/providers/copilot/index.ts`
- Test: `CLI/packages/agent/src/providers/copilot/__tests__/parser.test.ts`
- Fixture: `CLI/packages/agent/src/providers/copilot/__tests__/fixtures/user-usage.json`
- Fixture: `CLI/packages/agent/src/providers/copilot/__tests__/fixtures/hosts.json`

Two strategies:
1. `oauth-http` — reads the GitHub Copilot OAuth token from
   `~/.config/github-copilot/hosts.json` (written by `gh auth login` and
   the Copilot VS Code/Cursor extension), then calls
   `https://api.github.com/user/copilot_usage`.
2. `local-config-scan` — reads the local `~/.config/github-copilot/
   apps.json` snapshot as a fallback.

- [ ] **Step 1: Write `models.ts`**

```typescript
// CLI/packages/agent/src/providers/copilot/models.ts
// Copilot pricing is flat-rate ($10/mo individual, $19/mo business).
// No per-token cost. This file exports the flat-rate constant so the
// descriptor can surface it in /providers/:id detail.
export const COPILOT_PLAN_COST_USD = {
  individual: 10,
  business: 19,
  enterprise: 39,
} as const;
```

- [ ] **Step 2: Write fixtures**

```json
// CLI/packages/agent/src/providers/copilot/__tests__/fixtures/user-usage.json
{
  "login": "alice",
  "plan": "business",
  "billing_period_end": "2026-04-30T23:59:59Z",
  "total_suggestions_count": 18240,
  "total_acceptances_count": 5120,
  "chat_turns_used": 640,
  "chat_turns_limit": 1500
}
```

```json
// CLI/packages/agent/src/providers/copilot/__tests__/fixtures/hosts.json
{
  "github.com": {
    "user": "alice",
    "oauth_token": "gho_zzzzzzzz",
    "github_copilot_internal_token": "tok_abc"
  }
}
```

- [ ] **Step 3: Write failing parser test**

```typescript
// CLI/packages/agent/src/providers/copilot/__tests__/parser.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCopilotUsage, extractOauthToken } from '../parser.js';

const load = (name: string) => JSON.parse(readFileSync(
  join(__dirname, 'fixtures', name), 'utf8',
));

describe('copilot parser', () => {
  it('parseCopilotUsage builds chat-turns quota and suggestion extras', () => {
    const snap = parseCopilotUsage(load('user-usage.json'), 500);
    expect(snap.providerId).toBe('copilot');
    expect(snap.quotas[0].unit).toBe('messages');
    expect(snap.quotas[0].used).toBe(640);
    expect(snap.quotas[0].limit).toBe(1500);
    expect(snap.quotas[0].periodEnd).toBe('2026-04-30T23:59:59Z');
    const sugg = snap.extras.find(e => e.label?.toLowerCase().includes('suggest'));
    expect(sugg?.used).toBe(18240);
    const acc = snap.extras.find(e => e.label?.toLowerCase().includes('accept'));
    expect(acc?.used).toBe(5120);
    expect(snap.identity?.account).toBe('alice');
    expect(snap.identity?.plan).toBe('business');
  });

  it('extractOauthToken picks github.com oauth_token', () => {
    expect(extractOauthToken(load('hosts.json'))).toBe('gho_zzzzzzzz');
  });

  it('extractOauthToken returns null when missing', () => {
    expect(extractOauthToken({})).toBeNull();
    expect(extractOauthToken({ 'github.com': {} })).toBeNull();
  });
});
```

- [ ] **Step 4: Run — expect fail**

- [ ] **Step 5: Implement `parser.ts`**

```typescript
// CLI/packages/agent/src/providers/copilot/parser.ts
import type { UsageSnapshot } from '../_shared/types.js';

interface CopilotUsage {
  login?: string;
  plan?: string;
  billing_period_end?: string;
  total_suggestions_count?: number;
  total_acceptances_count?: number;
  chat_turns_used?: number;
  chat_turns_limit?: number;
}

export function parseCopilotUsage(raw: unknown, fetchedAt: number): UsageSnapshot {
  const r = (raw ?? {}) as CopilotUsage;
  const quotas: UsageSnapshot['quotas'] = [];
  if (typeof r.chat_turns_used === 'number' && typeof r.chat_turns_limit === 'number') {
    quotas.push({
      label: `${r.plan ?? 'plan'} chat turns`,
      unit: 'messages',
      used: r.chat_turns_used,
      limit: r.chat_turns_limit,
      periodEnd: r.billing_period_end,
    });
  }
  const extras: UsageSnapshot['extras'] = [];
  if (typeof r.total_suggestions_count === 'number') {
    extras.push({ label: 'Suggestions (period)', value: r.total_suggestions_count, unit: 'count' });
  }
  if (typeof r.total_acceptances_count === 'number') {
    extras.push({ label: 'Acceptances (period)', value: r.total_acceptances_count, unit: 'count' });
  }
  return {
    providerId: 'copilot',
    fetchedAt,
    quotas,
    extras,
    identity: r.login ? { account: r.login, plan: r.plan } : undefined,
  };
}

interface HostsFile {
  [host: string]: { user?: string; oauth_token?: string };
}

export function extractOauthToken(raw: unknown): string | null {
  const h = (raw ?? {}) as HostsFile;
  const gh = h['github.com'];
  if (!gh || typeof gh.oauth_token !== 'string' || gh.oauth_token.length === 0) return null;
  return gh.oauth_token;
}
```

- [ ] **Step 6: Run — expect pass**

- [ ] **Step 7: Implement `strategies.ts`**

```typescript
// CLI/packages/agent/src/providers/copilot/strategies.ts
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { ProviderFetchStrategy, FetchContext } from '../_shared/types.js';
import { parseCopilotUsage, extractOauthToken } from './parser.js';

function hostsPath(): string {
  const home = homedir();
  if (process.platform === 'win32') {
    return join(process.env.APPDATA ?? home, 'GitHub Copilot/hosts.json');
  }
  return join(home, '.config/github-copilot/hosts.json');
}

function appsPath(): string {
  const home = homedir();
  if (process.platform === 'win32') {
    return join(process.env.APPDATA ?? home, 'GitHub Copilot/apps.json');
  }
  return join(home, '.config/github-copilot/apps.json');
}

function readJsonOrNull(path: string): unknown {
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}

export const oauthHttp: ProviderFetchStrategy = {
  kind: 'oauth-http',
  shouldFallback: true,
  async preconditions() {
    const tok = extractOauthToken(readJsonOrNull(hostsPath()));
    return { available: tok !== null, reason: tok ? undefined : 'copilot oauth token not found' };
  },
  async perform(ctx: FetchContext) {
    const tok = extractOauthToken(readJsonOrNull(hostsPath()));
    if (!tok) throw new Error('copilot oauth token missing');
    const res = await ctx.host.http.request({
      url: 'https://api.github.com/user/copilot_usage',
      headers: {
        'authorization': `token ${tok}`,
        'accept': 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
      },
      timeoutMs: 10_000,
      retries: 1,
    });
    return parseCopilotUsage(res.body, ctx.now());
  },
};

export const localConfigScan: ProviderFetchStrategy = {
  kind: 'local-config-scan',
  shouldFallback: true,
  async preconditions() {
    return { available: existsSync(appsPath()), reason: 'copilot apps.json not found' };
  },
  async perform(ctx: FetchContext) {
    const raw = readJsonOrNull(appsPath());
    return parseCopilotUsage(raw, ctx.now());
  },
};
```

- [ ] **Step 8: Populate `descriptor.ts`**

```typescript
// CLI/packages/agent/src/providers/copilot/descriptor.ts
import type { ProviderDescriptor } from '../_shared/types.js';

export const descriptor: ProviderDescriptor = {
  metadata: {
    id: 'copilot',
    displayName: 'GitHub Copilot',
    vendor: 'GitHub',
    category: 'assistant',
    website: 'https://github.com/features/copilot',
  },
  branding: { icon: 'GH', accent: '#24292F' },
  capabilities: {
    refreshIntervalMs: 300_000,
    quotaBar: { label: 'Chat turns', unit: 'messages' },
    detailSections: ['plan', 'period', 'suggestions'],
  },
};
```

- [ ] **Step 9: Write `index.ts`**

```typescript
// CLI/packages/agent/src/providers/copilot/index.ts
import { descriptor } from './descriptor.js';
import { oauthHttp, localConfigScan } from './strategies.js';
import type { ProviderDescriptor, ProviderFetchPlan } from '../_shared/types.js';
import './models.js';

export const copilot: ProviderDescriptor = descriptor;
export const copilotPlan: ProviderFetchPlan = {
  strategies: [oauthHttp, localConfigScan],
};
```

- [ ] **Step 10: Build-check + commit**

```bash
cd CLI && npm run build --workspaces && cd ..
git add CLI/packages/agent/src/providers/copilot/
git commit -m "feat(providers/copilot): oauth-http + local-config-scan

oauth-http reads the GitHub OAuth token from ~/.config/github-copilot/
hosts.json and calls /user/copilot_usage; falls back to the local
apps.json snapshot. Parser maps chat_turns_* to the primary quota and
exposes suggestions/acceptances as extras."
```

### Task 2.11: Wire hero providers into registry + routes + CLI

**Files:**
- Modify: `CLI/packages/agent/src/providers/_shared/registry.ts`
- Modify: `CLI/packages/agent/src/report/app-context.ts` (add `host`, `cache`, `fetchDriver`)
- Modify: `CLI/packages/agent/src/routes/providers.ts` (full impl, replacing Phase 1 stub)
- Modify: `CLI/packages/agent/src/routes/usage.ts` (replace stub with aggregate snapshot)
- Modify: `CLI/packages/cli/src/commands/providers.ts` (raw JSON print; renderers come in Phase 4)
- Test: `CLI/packages/agent/src/routes/__tests__/providers.int.test.ts`

The Phase 1 provider registry iterated descriptor stubs. Now it also wires
each provider's `plan` (fetch strategies) into a lookup. Routes pull
snapshots via the fetch driver. CLI `providers` command prints the live
JSON; Phase 4 swaps in progress-bar rendering.

- [ ] **Step 1: Update `registry.ts` to import plans + descriptors**

```typescript
// CLI/packages/agent/src/providers/_shared/registry.ts
// (Replacing the Phase 1 descriptor-only shape.)
import type {
  ProviderDescriptor, ProviderFetchPlan, ProviderId,
} from './types.js';

import { claude, claudePlan } from '../claude/index.js';
import { cursor, cursorPlan } from '../cursor/index.js';
import { codex, codexPlan } from '../codex/index.js';
import { copilot, copilotPlan } from '../copilot/index.js';

// Stretch + stub providers — Phase 1 exported descriptor-only entries.
// Phase 4 fills in plans for gemini/augment/kiro; everything else remains
// descriptor-only until each provider's phase lands.
import { descriptor as gemini }   from '../gemini/descriptor.js';
import { descriptor as augment }  from '../augment/descriptor.js';
import { descriptor as kiro }     from '../kiro/descriptor.js';
import { descriptor as windsurf } from '../windsurf/descriptor.js';
import { descriptor as aider }    from '../aider/descriptor.js';
import { descriptor as continueD }from '../continue/descriptor.js';
import { descriptor as cline }    from '../cline/descriptor.js';
import { descriptor as tabnine }  from '../tabnine/descriptor.js';
import { descriptor as sourcegraph } from '../sourcegraph/descriptor.js';
import { descriptor as zed }      from '../zed/descriptor.js';
import { descriptor as jetbrains }from '../jetbrains-ai/descriptor.js';
import { descriptor as supermaven}from '../supermaven/descriptor.js';

interface RegistryEntry {
  descriptor: ProviderDescriptor;
  plan?: ProviderFetchPlan; // undefined for stub/coming-soon providers
}

const REGISTRY: Record<ProviderId, RegistryEntry> = {
  claude:      { descriptor: claude,   plan: claudePlan },
  cursor:      { descriptor: cursor,   plan: cursorPlan },
  codex:       { descriptor: codex,    plan: codexPlan },
  copilot:     { descriptor: copilot,  plan: copilotPlan },
  gemini:      { descriptor: gemini },
  augment:     { descriptor: augment },
  kiro:        { descriptor: kiro },
  windsurf:    { descriptor: windsurf },
  aider:       { descriptor: aider },
  continue:    { descriptor: continueD },
  cline:       { descriptor: cline },
  tabnine:     { descriptor: tabnine },
  sourcegraph: { descriptor: sourcegraph },
  zed:         { descriptor: zed },
  'jetbrains-ai': { descriptor: jetbrains },
  supermaven:  { descriptor: supermaven },
};

export function listProviders(): ProviderDescriptor[] {
  return Object.values(REGISTRY).map(e => e.descriptor);
}

export function getProvider(id: ProviderId): RegistryEntry | undefined {
  return REGISTRY[id];
}

export function hasLivePlan(id: ProviderId): boolean {
  return Boolean(REGISTRY[id]?.plan);
}
```

- [ ] **Step 2: Extend `app-context.ts`**

```typescript
// CLI/packages/agent/src/report/app-context.ts
import { getDb } from './db.js';
import { createHostAPIs } from '../providers/_host/index.js';
import { createSnapshotCache } from '../providers/_shared/cache.js';
import { createFetchDriver, type FetchDriver } from '../providers/_shared/fetch-driver.js';
import type { HostAPIs } from '../providers/_shared/types.js';
import type { SnapshotCache } from '../providers/_shared/cache.js';
import type Database from 'better-sqlite3';

export interface AppContext {
  db: Database.Database;
  host: HostAPIs;
  cache: SnapshotCache;
  fetchDriver: FetchDriver;
}

let ctx: AppContext | null = null;

export function getAppContext(): AppContext {
  if (ctx) return ctx;
  const db = getDb();
  const host = createHostAPIs('worktrace');
  const cache = createSnapshotCache();
  const fetchDriver = createFetchDriver({ cache, host });
  ctx = { db, host, cache, fetchDriver };
  return ctx;
}

export function resetAppContextForTests(): void {
  ctx = null;
}
```

- [ ] **Step 3: Rewrite `routes/providers.ts`**

```typescript
// CLI/packages/agent/src/routes/providers.ts
import { Router, type Request, type Response } from 'express';
import { listProviders, getProvider } from '../providers/_shared/registry.js';
import type { ProviderId } from '../providers/_shared/types.js';
import { getAppContext } from '../report/app-context.js';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  const descriptors = listProviders().map(d => ({
    id: d.metadata.id,
    displayName: d.metadata.displayName,
    vendor: d.metadata.vendor,
    category: d.metadata.category,
    branding: d.branding,
    capabilities: d.capabilities,
  }));
  res.json({ providers: descriptors });
});

router.get('/:id', async (req: Request, res: Response) => {
  const id = req.params.id as ProviderId;
  const entry = getProvider(id);
  if (!entry) return res.status(404).json({ error: `unknown provider: ${id}` });
  if (!entry.plan) {
    return res.json({
      descriptor: entry.descriptor,
      snapshot: null,
      status: 'coming-soon',
    });
  }
  const { fetchDriver } = getAppContext();
  const force = req.query.refresh === '1';
  try {
    const snap = await fetchDriver.fetch(entry.descriptor, entry.plan, { force });
    res.json({ descriptor: entry.descriptor, snapshot: snap, status: 'live' });
  } catch (err) {
    res.status(502).json({
      descriptor: entry.descriptor,
      snapshot: null,
      status: 'error',
      error: (err as Error).message,
    });
  }
});

export default router;
```

- [ ] **Step 4: Rewrite `routes/usage.ts`**

```typescript
// CLI/packages/agent/src/routes/usage.ts
import { Router, type Request, type Response } from 'express';
import { listProviders, getProvider, hasLivePlan } from '../providers/_shared/registry.js';
import type { ProviderId } from '../providers/_shared/types.js';
import { getAppContext } from '../report/app-context.js';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  const { fetchDriver } = getAppContext();
  const force = req.query.refresh === '1';
  const descriptors = listProviders();
  const ids = descriptors.map(d => d.metadata.id).filter(id => hasLivePlan(id)) as ProviderId[];
  const results = await Promise.all(ids.map(async (id) => {
    const entry = getProvider(id)!;
    try {
      const snap = await fetchDriver.fetch(entry.descriptor, entry.plan!, { force });
      return { id, status: 'ok', snapshot: snap };
    } catch (err) {
      return { id, status: 'error', error: (err as Error).message };
    }
  }));
  res.json({ fetchedAt: Date.now(), providers: results });
});

export default router;
```

- [ ] **Step 5: Rewrite `commands/providers.ts` (thin JSON dump, renderers in Phase 4)**

```typescript
// CLI/packages/cli/src/commands/providers.ts
import { ensureAgent, agentGet } from '../agent-client.js';

export async function runProviders(
  id: string | undefined,
  opts: { json?: boolean; refresh?: boolean },
): Promise<number> {
  await ensureAgent();
  if (id) {
    const suffix = opts.refresh ? '?refresh=1' : '';
    const data = await agentGet(`/providers/${encodeURIComponent(id)}${suffix}`);
    console.log(JSON.stringify(data, null, 2));
    return 0;
  }
  const data = await agentGet('/providers');
  console.log(JSON.stringify(data, null, 2));
  return 0;
}
```

- [ ] **Step 6: Write integration smoke test for `/providers`**

```typescript
// CLI/packages/agent/src/routes/__tests__/providers.int.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../server.js';

describe('/providers routes', () => {
  it('GET /providers lists 16 descriptors', async () => {
    const res = await request(app).get('/providers');
    expect(res.status).toBe(200);
    expect(res.body.providers).toHaveLength(16);
    const ids = res.body.providers.map((p: { id: string }) => p.id);
    expect(ids).toContain('claude');
    expect(ids).toContain('cursor');
    expect(ids).toContain('codex');
    expect(ids).toContain('copilot');
  });

  it('GET /providers/claude returns descriptor + status field', async () => {
    const res = await request(app).get('/providers/claude');
    expect(res.status).toBe(200);
    expect(res.body.descriptor.metadata.id).toBe('claude');
    expect(['live', 'error']).toContain(res.body.status);
    // We do NOT assert snapshot shape here — no API key in CI means
    // status may be 'error' with preconditions reason.
  });

  it('GET /providers/gemini returns coming-soon', async () => {
    const res = await request(app).get('/providers/gemini');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('coming-soon');
    expect(res.body.snapshot).toBeNull();
  });

  it('GET /providers/bogus returns 404', async () => {
    const res = await request(app).get('/providers/bogus');
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 7: Install `supertest` if not already present**

```bash
cd CLI/packages/agent && npm install --save-dev supertest @types/supertest
```

- [ ] **Step 8: Run all Phase 2 tests**

```bash
cd CLI/packages/agent && npx vitest run
```
Expected: all `http`, `pty`, `keychain`, `browser-cookies`, `token-cost`,
`cache`, `fetch-driver`, `claude parser`, `cursor parser`, `codex parser`,
`copilot parser`, and `providers.int` suites pass.

- [ ] **Step 9: Daemon smoke test (manual)**

```bash
cd CLI && npm run build --workspaces
node packages/agent/dist/server.js &
AGENT_PID=$!
sleep 1

curl -s http://127.0.0.1:9315/providers | jq '.providers | length'
# Expected: 16

curl -s http://127.0.0.1:9315/providers/claude | jq '.status, .descriptor.metadata.displayName'
# Expected: either "live" or "error" depending on local env, plus "Claude"

curl -s http://127.0.0.1:9315/providers/gemini | jq '.status'
# Expected: "coming-soon"

curl -s http://127.0.0.1:9315/usage | jq '.providers | map(.id)'
# Expected: array including "claude", "cursor", "codex", "copilot"

kill $AGENT_PID
```

- [ ] **Step 10: Commit**

```bash
git add CLI/packages/agent/src/providers/_shared/registry.ts \
        CLI/packages/agent/src/report/app-context.ts \
        CLI/packages/agent/src/routes/providers.ts \
        CLI/packages/agent/src/routes/usage.ts \
        CLI/packages/agent/src/routes/__tests__/providers.int.test.ts \
        CLI/packages/agent/package.json \
        CLI/packages/agent/package-lock.json \
        CLI/packages/cli/src/commands/providers.ts
git commit -m "feat(providers): live /providers + /usage endpoints

Registry now exposes 4 live plans (claude/cursor/codex/copilot) alongside
12 descriptor-only stubs. /providers/:id runs the fetch-driver and
returns {descriptor, snapshot, status: live|error|coming-soon}. /usage
aggregates across all live providers. CLI 'worktrace providers' prints
the raw JSON — progress-bar rendering lands in Phase 4."
```

---

**Phase 2 exit criteria:**
- `npm run build --workspaces` clean
- `npx vitest run` green in `CLI/packages/agent` (all parser, host, cache, fetch-driver, providers.int suites pass)
- Daemon smoke test above produces expected shapes
- At least one hero provider returns `status: "live"` given the env (e.g. with `ANTHROPIC_API_KEY` set, Claude must be live)
- No `any` types in new production code

## Phase 3 — Attribution Engine (est. 3-4 days)

Phase 2 turned "list of providers and their quotas" into "live snapshots".
Phase 3 now answers the harder question: **which repo/feature/file did
this usage go toward?** It does so by:

1. Sampling running processes every 30s (`ps aux` pattern match) to detect
   which provider CLI is active in which working directory.
2. Taking periodic provider snapshots and computing `Δused_per_window`.
3. Distributing each Δ proportionally across active windows, weighted by
   the number of file events in each window.
4. Running a daily reconciliation job to verify the sum-of-attributed ==
   provider's reported total (within 2% tolerance).

### Task 3.1: `process-sampler` host API (real `ps aux` matcher)

**Files:**
- Modify: `CLI/packages/agent/src/providers/_host/process-sampler.ts`
- Create: `CLI/packages/agent/src/providers/_host/process-patterns.ts`
- Test: `CLI/packages/agent/src/providers/_host/__tests__/process-sampler.test.ts`

Shell out to `ps -eo pid,command` (macOS/Linux) or `tasklist /v /fo csv`
(Windows), parse the output line-by-line, and match each row against a
table of provider-specific regexes (`claude`, `codex`, `cursor-agent`,
`gh copilot`, etc.). Matched rows get enriched with cwd via
`lsof -p <pid>` on macOS/Linux or `wmic` on Windows (best-effort — cwd
may be null).

- [ ] **Step 1: Write `process-patterns.ts`**

```typescript
// CLI/packages/agent/src/providers/_host/process-patterns.ts
import type { ProviderId } from '../_shared/types.js';

export interface ProviderPattern {
  provider: ProviderId;
  regex: RegExp;
}

// Ordered: most specific first (e.g. 'claude-code' before bare 'claude').
// Patterns match against the full command string from ps.
export const PROVIDER_PATTERNS: ProviderPattern[] = [
  { provider: 'claude',   regex: /\bclaude(-code)?\b/ },
  { provider: 'codex',    regex: /\b(codex|openai-codex)\b/ },
  { provider: 'cursor',   regex: /\bcursor(-agent)?\b/ },
  { provider: 'copilot',  regex: /\bgh-copilot\b|github-copilot-language-server/ },
  { provider: 'gemini',   regex: /\bgemini(-cli)?\b/ },
  { provider: 'augment',  regex: /\baugment(ation)?\b/ },
  { provider: 'kiro',     regex: /\bkiro\b/ },
  { provider: 'aider',    regex: /\baider\b/ },
  { provider: 'continue', regex: /\bcontinue-cli\b/ },
  { provider: 'cline',    regex: /\bcline\b/ },
];

export function matchProvider(command: string): ProviderId | null {
  for (const p of PROVIDER_PATTERNS) {
    if (p.regex.test(command)) return p.provider;
  }
  return null;
}
```

- [ ] **Step 2: Write failing test**

```typescript
// CLI/packages/agent/src/providers/_host/__tests__/process-sampler.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../pty.js', () => ({
  createPtyHost: () => ({
    run: vi.fn(),
    isAvailable: vi.fn().mockResolvedValue(true),
  }),
}));

import { createProcessSamplerHost } from '../process-sampler.js';
import { createPtyHost } from '../pty.js';
import { matchProvider } from '../process-patterns.js';

describe('matchProvider', () => {
  it('matches claude-code before claude', () => {
    expect(matchProvider('/usr/local/bin/claude-code --chat')).toBe('claude');
  });
  it('matches cursor-agent', () => {
    expect(matchProvider('cursor-agent --worker')).toBe('cursor');
  });
  it('returns null for unrelated processes', () => {
    expect(matchProvider('node server.js')).toBeNull();
  });
});

describe('createProcessSamplerHost', () => {
  let ptyRun: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const pty = createPtyHost();
    ptyRun = pty.run as ReturnType<typeof vi.fn>;
  });

  it('parses ps output and returns matched processes', async () => {
    const psOut = [
      '  PID COMMAND',
      ' 1234 /usr/local/bin/claude-code --chat',
      ' 5678 node server.js',
      ' 9012 cursor-agent --worker',
    ].join('\n');
    ptyRun.mockImplementation(async (input: { command: string }) => {
      if (input.command === 'ps') return { stdout: psOut, stderr: '', exitCode: 0 };
      return { stdout: '', stderr: '', exitCode: 1 };
    });
    const sampler = createProcessSamplerHost({ platform: 'darwin' });
    const rows = await sampler.sample();
    expect(rows).toHaveLength(2);
    const providers = rows.map(r => r.provider).sort();
    expect(providers).toEqual(['claude', 'cursor']);
    const claude = rows.find(r => r.provider === 'claude');
    expect(claude?.pid).toBe(1234);
  });

  it('returns [] when ps fails', async () => {
    ptyRun.mockResolvedValue({ stdout: '', stderr: 'err', exitCode: 1 });
    const sampler = createProcessSamplerHost({ platform: 'darwin' });
    expect(await sampler.sample()).toEqual([]);
  });
});
```

- [ ] **Step 3: Run — expect fail**

- [ ] **Step 4: Implement `process-sampler.ts`**

```typescript
// CLI/packages/agent/src/providers/_host/process-sampler.ts
import type { ProviderId } from '../_shared/types.js';
import { createPtyHost, type PtyHost } from './pty.js';
import { matchProvider } from './process-patterns.js';

export interface DetectedProcess {
  pid: number;
  provider: ProviderId;
  command: string;
  cwd?: string;
  startedAt?: number;
}

export interface ProcessSamplerHost {
  sample(): Promise<DetectedProcess[]>;
}

export interface ProcessSamplerConfig {
  platform?: NodeJS.Platform;
  pty?: PtyHost;
}

function parsePsOutput(stdout: string): Array<{ pid: number; command: string }> {
  const rows: Array<{ pid: number; command: string }> = [];
  const lines = stdout.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || /^PID\s+COMMAND/i.test(line)) continue;
    const m = /^(\d+)\s+(.+)$/.exec(line);
    if (!m) continue;
    rows.push({ pid: Number(m[1]), command: m[2] });
  }
  return rows;
}

async function resolveCwd(pty: PtyHost, pid: number, platform: NodeJS.Platform): Promise<string | undefined> {
  if (platform === 'win32') return undefined; // Windows cwd deferred post-v0.1
  try {
    const r = await pty.run({
      command: 'lsof',
      args: ['-a', '-d', 'cwd', '-p', String(pid), '-Fn'],
      timeoutMs: 1500,
    });
    if (r.exitCode !== 0) return undefined;
    const line = r.stdout.split('\n').find(l => l.startsWith('n'));
    return line ? line.slice(1) : undefined;
  } catch { return undefined; }
}

export function createProcessSamplerHost(cfg: ProcessSamplerConfig = {}): ProcessSamplerHost {
  const platform = cfg.platform ?? process.platform;
  const pty = cfg.pty ?? createPtyHost();
  return {
    async sample() {
      try {
        const r = platform === 'win32'
          ? await pty.run({ command: 'tasklist', args: ['/v', '/fo', 'csv'], timeoutMs: 3000 })
          : await pty.run({ command: 'ps', args: ['-eo', 'pid,command'], timeoutMs: 3000 });
        if (r.exitCode !== 0) return [];
        const rows = platform === 'win32'
          ? parseTasklistOutput(r.stdout)
          : parsePsOutput(r.stdout);
        const matched: DetectedProcess[] = [];
        for (const row of rows) {
          const provider = matchProvider(row.command);
          if (!provider) continue;
          const cwd = await resolveCwd(pty, row.pid, platform);
          matched.push({ pid: row.pid, provider, command: row.command, cwd });
        }
        return matched;
      } catch { return []; }
    },
  };
}

function parseTasklistOutput(stdout: string): Array<{ pid: number; command: string }> {
  const rows: Array<{ pid: number; command: string }> = [];
  const lines = stdout.split('\n').slice(1);
  for (const line of lines) {
    const cols = line.replace(/"/g, '').split(',');
    if (cols.length < 2) continue;
    const pid = Number(cols[1]);
    if (!Number.isFinite(pid)) continue;
    const command = cols[0];
    rows.push({ pid, command });
  }
  return rows;
}
```

- [ ] **Step 5: Run — expect pass**

- [ ] **Step 6: Commit**

```bash
git add CLI/packages/agent/src/providers/_host/process-sampler.ts \
        CLI/packages/agent/src/providers/_host/process-patterns.ts \
        CLI/packages/agent/src/providers/_host/__tests__/process-sampler.test.ts
git commit -m "feat(host): ps-based process sampler with provider patterns

Shells out to 'ps -eo pid,command' (macOS/Linux) or 'tasklist' (Windows),
matches each row against PROVIDER_PATTERNS, and resolves cwd via lsof
on posix. Windows cwd resolution is deferred post-v0.1. Output feeds the attribution engine's
sample-writer in Task 3.2."
```

### Task 3.2: Sample-writer + polling loop

**Files:**
- Create: `CLI/packages/agent/src/report/sample-writer.ts`
- Create: `CLI/packages/agent/src/report/sample-loop.ts`
- Test: `CLI/packages/agent/src/report/__tests__/sample-writer.test.ts`

`sample-writer.writeSample()` inserts a `provider_samples` row (provider,
sampled_at, pid, cwd, worktree_id resolved from cwd) for each detected
process. `sample-loop.startSampling()` runs the sampler every
`PROVIDER_SAMPLE_INTERVAL_MS` (from Phase 1 Task 1.5 constants) and
dispatches each detection to the writer. Stops cleanly on shutdown.

- [ ] **Step 1: Write failing sample-writer test**

```typescript
// CLI/packages/agent/src/report/__tests__/sample-writer.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { applyV1 } from '../db.js';
import { addRepo } from '../repo-registry.js';
import { syncWorktrees } from '../worktree-scanner.js';
import { writeSample } from '../sample-writer.js';

describe('writeSample', () => {
  let db: Database.Database;
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'wt-sample-'));
    db = new Database(join(tmp, 'test.db'));
    applyV1(db);
  });

  it('inserts a row matching cwd to a worktree', () => {
    const repo = addRepo(db, { name: 'r', path: tmp });
    syncWorktrees(db, repo.id, [{ path: tmp, branch: 'main' }]);
    const nowMs = 1_700_000_000_000;
    writeSample(db, {
      pid: 1234,
      provider: 'claude',
      command: 'claude-code',
      cwd: tmp,
      sampledAt: nowMs,
    });
    const rows = db.prepare('SELECT * FROM provider_samples').all() as Array<{
      provider: string; pid: number; worktree_id: number | null;
    }>;
    expect(rows).toHaveLength(1);
    expect(rows[0].provider).toBe('claude');
    expect(rows[0].pid).toBe(1234);
    expect(rows[0].worktree_id).not.toBeNull();
  });

  it('leaves worktree_id null when cwd does not match any worktree', () => {
    const nowMs = 1_700_000_000_000;
    writeSample(db, {
      pid: 1, provider: 'claude', command: 'x',
      cwd: '/no/such/path', sampledAt: nowMs,
    });
    const row = db.prepare('SELECT worktree_id FROM provider_samples LIMIT 1').get() as { worktree_id: number | null };
    expect(row.worktree_id).toBeNull();
  });

  // afterEach cleanup elided — tmp dirs cleared on test-runner exit
});
```

- [ ] **Step 2: Implement `sample-writer.ts`**

```typescript
// CLI/packages/agent/src/report/sample-writer.ts
import type Database from 'better-sqlite3';
import type { ProviderId } from '../providers/_shared/types.js';

export interface SampleInput {
  pid: number;
  provider: ProviderId;
  command: string;
  cwd?: string;
  sampledAt: number;
}

export function writeSample(db: Database.Database, input: SampleInput): void {
  let worktreeId: number | null = null;
  if (input.cwd) {
    const row = db.prepare(
      `SELECT id FROM worktrees WHERE ? LIKE path || '%' ORDER BY length(path) DESC LIMIT 1`,
    ).get(input.cwd) as { id: number } | undefined;
    if (row) worktreeId = row.id;
  }
  db.prepare(
    `INSERT INTO provider_samples (provider, pid, command, cwd, worktree_id, sampled_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(input.provider, input.pid, input.command, input.cwd ?? null, worktreeId, input.sampledAt);
}
```

- [ ] **Step 3: Run — expect pass**

- [ ] **Step 4: Implement `sample-loop.ts`**

```typescript
// CLI/packages/agent/src/report/sample-loop.ts
import { getAppContext } from './app-context.js';
import { writeSample } from './sample-writer.js';
import { PROVIDER_SAMPLE_INTERVAL_MS } from './constants.js';

let timer: NodeJS.Timeout | null = null;

export function startSampling(): void {
  if (timer) return;
  const tick = async () => {
    try {
      const ctx = getAppContext();
      const detected = await ctx.host.processSampler.sample();
      const sampledAt = Date.now();
      for (const d of detected) {
        writeSample(ctx.db, {
          pid: d.pid,
          provider: d.provider,
          command: d.command,
          cwd: d.cwd,
          sampledAt,
        });
      }
    } catch (err) {
      const ctx = getAppContext();
      ctx.host.logger.warn('sample tick failed', { err: (err as Error).message });
    }
  };
  timer = setInterval(tick, PROVIDER_SAMPLE_INTERVAL_MS);
  tick().catch(() => {}); // fire-and-forget first tick
}

export function stopSampling(): void {
  if (timer) { clearInterval(timer); timer = null; }
}
```

- [ ] **Step 5: Wire into `server.ts`**

```typescript
// add to CLI/packages/agent/src/server.ts (replacing startPolling import):
import { startSampling, stopSampling } from './report/sample-loop.js';
// ...
server.listen(PORT, '127.0.0.1', () => {
  console.log(`worktrace-agent listening on 127.0.0.1:${PORT}`);
  startSampling();
});

async function shutdown() {
  stopSampling();
  // ... rest of existing shutdown logic
}
```

- [ ] **Step 6: Build-check + commit**

```bash
cd CLI && npm run build --workspaces && cd ..
git add CLI/packages/agent/src/report/sample-writer.ts \
        CLI/packages/agent/src/report/sample-loop.ts \
        CLI/packages/agent/src/report/__tests__/sample-writer.test.ts \
        CLI/packages/agent/src/server.ts
git commit -m "feat(report): periodic process sampler into SQLite

writeSample maps cwd → worktree_id via longest-path match and inserts
into provider_samples. sample-loop runs every PROVIDER_SAMPLE_INTERVAL_MS,
kicking off one immediate tick at startup. Wired into server.ts lifecycle
(replaces the old usage/manager startPolling hook)."
```

### Task 3.3: Attribution writer (proportional distribution by file events)

**Files:**
- Create: `CLI/packages/agent/src/report/attribution-writer.ts`
- Test: `CLI/packages/agent/src/report/__tests__/attribution-writer.test.ts`

The core of the attribution engine. Given a `UsageSnapshot` delta
(Δused for one provider) and a time range `[since, until]`, distribute
the delta proportionally across activity windows in that range, weighted
by each window's `file_event_count`. Windows with zero file events still
get an equal-share minimum (to avoid losing attribution when a session had
no file writes). Result rows land in the `attributions` table.

Algorithm (pure function — fully unit testable):
```
total_weight = Σ max(file_event_count, 1) over windows in [since, until]
for each window w:
  share = delta * max(w.file_event_count, 1) / total_weight
  insert attribution(provider, worktree_id=w.worktree_id, window_id=w.id, amount=share, unit, snapshot_id)
```

- [ ] **Step 1: Write failing test**

```typescript
// CLI/packages/agent/src/report/__tests__/attribution-writer.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { applyV1 } from '../db.js';
import { addRepo } from '../repo-registry.js';
import { syncWorktrees } from '../worktree-scanner.js';
import { distributeDelta, writeAttributions } from '../attribution-writer.js';

const seedWindows = (db: Database.Database, rows: Array<{
  worktree_id: number; window_start: number; window_end: number; file_event_count: number;
}>) => {
  const stmt = db.prepare(
    `INSERT INTO activity_windows (worktree_id, window_start, window_end, file_event_count)
     VALUES (?, ?, ?, ?)`,
  );
  for (const r of rows) {
    stmt.run(r.worktree_id, r.window_start, r.window_end, r.file_event_count);
  }
};

describe('distributeDelta', () => {
  it('splits delta proportionally by file_event_count', () => {
    const shares = distributeDelta({
      delta: 9,
      windows: [
        { id: 1, worktreeId: 10, fileEventCount: 2 },
        { id: 2, worktreeId: 10, fileEventCount: 1 },
      ],
    });
    expect(shares.length).toBe(2);
    expect(shares[0].amount).toBeCloseTo(6, 5);
    expect(shares[1].amount).toBeCloseTo(3, 5);
  });

  it('gives zero-event windows a share via max(count, 1)', () => {
    const shares = distributeDelta({
      delta: 4,
      windows: [
        { id: 1, worktreeId: 10, fileEventCount: 0 },
        { id: 2, worktreeId: 10, fileEventCount: 3 },
      ],
    });
    // weights: max(0,1)=1 + max(3,1)=3 = 4. First window gets 1/4 of 4 = 1.
    expect(shares[0].amount).toBeCloseTo(1, 5);
    expect(shares[1].amount).toBeCloseTo(3, 5);
  });

  it('returns empty array when no windows', () => {
    expect(distributeDelta({ delta: 10, windows: [] })).toEqual([]);
  });

  it('returns empty array when delta is 0', () => {
    expect(distributeDelta({
      delta: 0,
      windows: [{ id: 1, worktreeId: 10, fileEventCount: 5 }],
    })).toEqual([]);
  });
});

describe('writeAttributions', () => {
  let db: Database.Database;

  beforeEach(() => {
    const tmp = mkdtempSync(join(tmpdir(), 'wt-attr-'));
    db = new Database(join(tmp, 't.db'));
    applyV1(db);
  });

  it('writes one attribution row per window', () => {
    const repo = addRepo(db, { name: 'r', path: '/r' });
    syncWorktrees(db, repo.id, [{ path: '/r', branch: 'main' }]);
    const wtId = (db.prepare('SELECT id FROM worktrees').get() as { id: number }).id;
    seedWindows(db, [
      { worktree_id: wtId, window_start: 1000, window_end: 2000, file_event_count: 2 },
      { worktree_id: wtId, window_start: 2000, window_end: 3000, file_event_count: 3 },
    ]);
    writeAttributions(db, {
      provider: 'claude',
      unit: 'usd',
      delta: 5,
      snapshotId: 'snap-1',
      since: 0,
      until: 4000,
    });
    const rows = db.prepare('SELECT amount FROM attributions').all() as { amount: number }[];
    expect(rows).toHaveLength(2);
    const total = rows.reduce((acc, r) => acc + r.amount, 0);
    expect(total).toBeCloseTo(5, 5);
  });

  it('is a no-op when no windows in range', () => {
    writeAttributions(db, {
      provider: 'claude', unit: 'usd', delta: 10,
      snapshotId: 's', since: 0, until: 100,
    });
    const rows = db.prepare('SELECT COUNT(*) as n FROM attributions').get() as { n: number };
    expect(rows.n).toBe(0);
  });
});
```

- [ ] **Step 2: Run — expect fail**

- [ ] **Step 3: Implement `attribution-writer.ts`**

```typescript
// CLI/packages/agent/src/report/attribution-writer.ts
import type Database from 'better-sqlite3';
import type { ProviderId } from '../providers/_shared/types.js';

export interface WindowRow {
  id: number;
  worktreeId: number;
  fileEventCount: number;
}

export interface DistributeInput {
  delta: number;
  windows: WindowRow[];
}

export interface WindowShare {
  windowId: number;
  worktreeId: number;
  amount: number;
}

export function distributeDelta(input: DistributeInput): WindowShare[] {
  if (input.delta === 0 || input.windows.length === 0) return [];
  const totalWeight = input.windows.reduce(
    (acc, w) => acc + Math.max(w.fileEventCount, 1), 0,
  );
  if (totalWeight === 0) return [];
  return input.windows.map(w => ({
    windowId: w.id,
    worktreeId: w.worktreeId,
    amount: input.delta * (Math.max(w.fileEventCount, 1) / totalWeight),
  }));
}

export interface WriteAttributionsInput {
  provider: ProviderId;
  unit: string;
  delta: number;
  snapshotId: string;
  since: number;
  until: number;
}

export function writeAttributions(
  db: Database.Database,
  input: WriteAttributionsInput,
): void {
  const rawWindows = db.prepare(
    `SELECT id, worktree_id, file_event_count
     FROM activity_windows
     WHERE window_start >= ? AND window_end <= ?`,
  ).all(input.since, input.until) as Array<{
    id: number; worktree_id: number; file_event_count: number;
  }>;
  const windows: WindowRow[] = rawWindows.map(r => ({
    id: r.id, worktreeId: r.worktree_id, fileEventCount: r.file_event_count,
  }));
  const shares = distributeDelta({ delta: input.delta, windows });
  if (shares.length === 0) return;
  const insert = db.prepare(
    `INSERT INTO attributions
       (provider, worktree_id, window_id, amount, unit, snapshot_id, attributed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const txn = db.transaction((rows: WindowShare[]) => {
    const now = Date.now();
    for (const s of rows) {
      insert.run(input.provider, s.worktreeId, s.windowId, s.amount, input.unit, input.snapshotId, now);
    }
  });
  txn(shares);
}
```

- [ ] **Step 4: Run — expect pass**

- [ ] **Step 5: Commit**

```bash
git add CLI/packages/agent/src/report/attribution-writer.ts \
        CLI/packages/agent/src/report/__tests__/attribution-writer.test.ts
git commit -m "feat(report): time-window proportional attribution writer

distributeDelta is a pure function that splits a provider Δ across
windows by max(file_event_count, 1) weight — zero-event windows still
get a share (prevents losing attribution during silent sessions).
writeAttributions wraps the SQLite INSERT in a transaction. Full unit
tests cover proportional split, zero-event fallback, empty inputs."
```

### Task 3.4: Attribution loop + snapshot delta tracker

**Files:**
- Create: `CLI/packages/agent/src/report/snapshot-writer.ts`
- Create: `CLI/packages/agent/src/report/attribution-loop.ts`
- Test: `CLI/packages/agent/src/report/__tests__/snapshot-writer.test.ts`

Ties Phase 2 (snapshots) + Phase 3.3 (writer) together. The loop polls each
live provider at its `refreshIntervalMs`, stores the raw snapshot in
`provider_samples` (extended w/ quota used/limit), computes Δused since
the previous sample for the same provider, and calls `writeAttributions`
with the time range = [previous sample ts, current sample ts].

- [ ] **Step 1: Write failing snapshot-writer test**

```typescript
// CLI/packages/agent/src/report/__tests__/snapshot-writer.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { applyV1 } from '../db.js';
import { writeSnapshot, readLatestSnapshot } from '../snapshot-writer.js';
import type { UsageSnapshot } from '../../providers/_shared/types.js';

const mk = (quotaUsed: number): UsageSnapshot => ({
  providerId: 'claude',
  fetchedAt: quotaUsed * 1000, // just to vary timestamps
  quotas: [{ label: 'plan', unit: 'usd', used: quotaUsed, limit: 100 }],
  extras: [],
});

describe('snapshot-writer', () => {
  let db: Database.Database;

  beforeEach(() => {
    const tmp = mkdtempSync(join(tmpdir(), 'wt-snap-'));
    db = new Database(join(tmp, 't.db'));
    applyV1(db);
  });

  it('readLatestSnapshot returns null when empty', () => {
    expect(readLatestSnapshot(db, 'claude')).toBeNull();
  });

  it('writeSnapshot then readLatestSnapshot round-trips quota used/limit', () => {
    writeSnapshot(db, mk(42));
    const r = readLatestSnapshot(db, 'claude');
    expect(r).not.toBeNull();
    expect(r!.used).toBeCloseTo(42, 5);
    expect(r!.limit).toBe(100);
    expect(r!.unit).toBe('usd');
  });

  it('returns the most recent snapshot when multiple exist', () => {
    writeSnapshot(db, mk(10));
    writeSnapshot(db, mk(30));
    writeSnapshot(db, mk(20)); // fetchedAt = 20_000 (later than 10_000)
    // Note: fetchedAt is used for ordering, latest by fetchedAt DESC should be 30 (30_000).
    const r = readLatestSnapshot(db, 'claude');
    expect(r!.used).toBeCloseTo(30, 5);
  });
});
```

- [ ] **Step 2: Implement `snapshot-writer.ts`**

```typescript
// CLI/packages/agent/src/report/snapshot-writer.ts
import type Database from 'better-sqlite3';
import type { ProviderId, UsageSnapshot } from '../providers/_shared/types.js';
import { randomUUID } from 'node:crypto';

export interface SnapshotRow {
  snapshotId: string;
  fetchedAt: number;
  unit: string;
  used: number;
  limit?: number;
}

export function writeSnapshot(db: Database.Database, snap: UsageSnapshot): string {
  const primary = snap.quotas[0];
  if (!primary) return ''; // no quota — nothing to track for attribution
  const id = randomUUID();
  db.prepare(
    `INSERT INTO provider_snapshots
       (snapshot_id, provider, fetched_at, quota_unit, quota_used, quota_limit)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, snap.providerId, snap.fetchedAt, primary.unit, primary.used, primary.limit ?? null);
  return id;
}

export function readLatestSnapshot(db: Database.Database, provider: ProviderId): SnapshotRow | null {
  const row = db.prepare(
    `SELECT snapshot_id, fetched_at, quota_unit, quota_used, quota_limit
     FROM provider_snapshots WHERE provider = ?
     ORDER BY fetched_at DESC LIMIT 1`,
  ).get(provider) as {
    snapshot_id: string; fetched_at: number; quota_unit: string;
    quota_used: number; quota_limit: number | null;
  } | undefined;
  if (!row) return null;
  return {
    snapshotId: row.snapshot_id,
    fetchedAt: row.fetched_at,
    unit: row.quota_unit,
    used: row.quota_used,
    limit: row.quota_limit ?? undefined,
  };
}
```

- [ ] **Step 3: Add `provider_snapshots` table via migration v2**

```typescript
// Modify CLI/packages/agent/src/report/db.ts — bump CURRENT_SCHEMA_VERSION to 2
// and add applyV2:

export const CURRENT_SCHEMA_VERSION = 2;

export function applyV2(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS provider_snapshots (
      snapshot_id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      fetched_at INTEGER NOT NULL,
      quota_unit TEXT NOT NULL,
      quota_used REAL NOT NULL,
      quota_limit REAL
    );
    CREATE INDEX IF NOT EXISTS idx_snapshots_provider_time
      ON provider_snapshots (provider, fetched_at DESC);
  `);
}

// In migrate() — after applyV1 branch, add:
//   if (current < 2) { applyV2(db); db.prepare('UPDATE schema_version SET version = 2').run(); }
```

- [ ] **Step 4: Run — expect snapshot-writer tests pass**

- [ ] **Step 5: Implement `attribution-loop.ts`**

```typescript
// CLI/packages/agent/src/report/attribution-loop.ts
import { getAppContext } from './app-context.js';
import { listProviders, getProvider, hasLivePlan } from '../providers/_shared/registry.js';
import { writeSnapshot, readLatestSnapshot } from './snapshot-writer.js';
import { writeAttributions } from './attribution-writer.js';
import type { ProviderId } from '../providers/_shared/types.js';

const timers = new Map<ProviderId, NodeJS.Timeout>();

export function startAttributionLoops(): void {
  for (const d of listProviders()) {
    if (!hasLivePlan(d.metadata.id)) continue;
    const id = d.metadata.id;
    const interval = d.capabilities.refreshIntervalMs;
    const tick = async () => { await attributionTick(id); };
    tick().catch(() => {});
    timers.set(id, setInterval(tick, interval));
  }
}

export function stopAttributionLoops(): void {
  for (const [, t] of timers) clearInterval(t);
  timers.clear();
}

export async function attributionTick(id: ProviderId): Promise<void> {
  const ctx = getAppContext();
  const entry = getProvider(id);
  if (!entry?.plan) return;
  const prev = readLatestSnapshot(ctx.db, id);
  let snap;
  try {
    snap = await ctx.fetchDriver.fetch(entry.descriptor, entry.plan, { force: true });
  } catch (err) {
    ctx.host.logger.warn('attribution fetch failed', { id, err: (err as Error).message });
    return;
  }
  const snapshotId = writeSnapshot(ctx.db, snap);
  if (!snapshotId || !prev) return; // first sample — no delta yet
  const currUsed = snap.quotas[0]?.used ?? 0;
  const delta = currUsed - prev.used;
  if (delta <= 0) return; // reset/clock skew — ignore
  writeAttributions(ctx.db, {
    provider: id,
    unit: snap.quotas[0]!.unit,
    delta,
    snapshotId,
    since: prev.fetchedAt,
    until: snap.fetchedAt,
  });
}
```

- [ ] **Step 6: Wire loops into server.ts lifecycle**

```typescript
// server.ts additions:
import { startAttributionLoops, stopAttributionLoops } from './report/attribution-loop.js';
// on startup, after startSampling():
startAttributionLoops();
// in shutdown, before stopSampling():
stopAttributionLoops();
```

- [ ] **Step 7: Build-check + commit**

```bash
cd CLI && npm run build --workspaces && cd ..
git add CLI/packages/agent/src/report/snapshot-writer.ts \
        CLI/packages/agent/src/report/attribution-loop.ts \
        CLI/packages/agent/src/report/db.ts \
        CLI/packages/agent/src/report/__tests__/snapshot-writer.test.ts \
        CLI/packages/agent/src/server.ts
git commit -m "feat(report): snapshot delta tracking + attribution loop

Schema v2 adds provider_snapshots table (snapshot_id, provider, fetched_at,
quota_{unit,used,limit}). On each provider refresh tick, the loop reads
the previous snapshot, fetches fresh, computes Δused, and dispatches to
writeAttributions. First tick for a provider is a no-op (no prior sample)."
```

### Task 3.5: Daily reconciliation job

**Files:**
- Create: `CLI/packages/agent/src/report/reconcile.ts`
- Test: `CLI/packages/agent/src/report/__tests__/reconcile.test.ts`

Runs once per day. For each provider, compares sum(attributions.amount)
over the current period against the provider's reported `used`. If drift
> 2%, writes a `reconciliation_log` row and emits a warning to the logger
so the CLI `pace` command can surface it. Does not mutate historical
attributions — drift is a diagnostic, not a correction.

- [ ] **Step 1: Add `reconciliation_log` table (schema v3)**

```typescript
// CLI/packages/agent/src/report/db.ts — bump CURRENT_SCHEMA_VERSION to 3
export const CURRENT_SCHEMA_VERSION = 3;

export function applyV3(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS reconciliation_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      period_start INTEGER NOT NULL,
      period_end INTEGER NOT NULL,
      attributed REAL NOT NULL,
      reported REAL NOT NULL,
      drift_pct REAL NOT NULL,
      reconciled_at INTEGER NOT NULL
    );
  `);
}
// In migrate(): if (current < 3) { applyV3(db); db.prepare('UPDATE schema_version SET version = 3').run(); }
```

- [ ] **Step 2: Write failing test**

```typescript
// CLI/packages/agent/src/report/__tests__/reconcile.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { applyV1, applyV2, applyV3 } from '../db.js';
import { reconcileProvider, DRIFT_TOLERANCE_PCT } from '../reconcile.js';

const seedAttributions = (db: Database.Database, rows: Array<{
  provider: string; amount: number; attributed_at: number;
}>) => {
  const stmt = db.prepare(
    `INSERT INTO attributions (provider, worktree_id, window_id, amount, unit, snapshot_id, attributed_at)
     VALUES (?, 1, 1, ?, 'usd', 's', ?)`,
  );
  for (const r of rows) stmt.run(r.provider, r.amount, r.attributed_at);
};

describe('reconcileProvider', () => {
  let db: Database.Database;
  beforeEach(() => {
    const tmp = mkdtempSync(join(tmpdir(), 'wt-rec-'));
    db = new Database(join(tmp, 't.db'));
    applyV1(db); applyV2(db); applyV3(db);
  });

  it('records a log row when drift exceeds tolerance', () => {
    seedAttributions(db, [
      { provider: 'claude', amount: 10, attributed_at: 100 },
      { provider: 'claude', amount: 20, attributed_at: 200 },
    ]);
    const result = reconcileProvider(db, {
      provider: 'claude', reportedUsed: 50,
      periodStart: 0, periodEnd: 300, now: 500,
    });
    expect(result.attributed).toBeCloseTo(30, 5);
    expect(result.reported).toBe(50);
    // drift = |30-50| / 50 = 40%
    expect(result.driftPct).toBeCloseTo(40, 1);
    expect(result.exceededTolerance).toBe(true);
    const logRows = db.prepare('SELECT drift_pct FROM reconciliation_log').all() as { drift_pct: number }[];
    expect(logRows).toHaveLength(1);
  });

  it('does NOT log when drift within tolerance', () => {
    seedAttributions(db, [
      { provider: 'claude', amount: 49, attributed_at: 100 },
    ]);
    const result = reconcileProvider(db, {
      provider: 'claude', reportedUsed: 50,
      periodStart: 0, periodEnd: 300, now: 500,
    });
    expect(result.driftPct).toBeLessThan(DRIFT_TOLERANCE_PCT);
    expect(result.exceededTolerance).toBe(false);
    const logRows = db.prepare('SELECT COUNT(*) as n FROM reconciliation_log').get() as { n: number };
    expect(logRows.n).toBe(0);
  });
});
```

- [ ] **Step 3: Implement `reconcile.ts`**

```typescript
// CLI/packages/agent/src/report/reconcile.ts
import type Database from 'better-sqlite3';
import type { ProviderId } from '../providers/_shared/types.js';

export const DRIFT_TOLERANCE_PCT = 2;

export interface ReconcileInput {
  provider: ProviderId;
  reportedUsed: number;
  periodStart: number;
  periodEnd: number;
  now: number;
}

export interface ReconcileResult {
  attributed: number;
  reported: number;
  driftPct: number;
  exceededTolerance: boolean;
}

export function reconcileProvider(db: Database.Database, input: ReconcileInput): ReconcileResult {
  const row = db.prepare(
    `SELECT COALESCE(SUM(amount), 0) as total FROM attributions
     WHERE provider = ? AND attributed_at >= ? AND attributed_at <= ?`,
  ).get(input.provider, input.periodStart, input.periodEnd) as { total: number };
  const attributed = row.total;
  const reported = input.reportedUsed;
  const driftPct = reported === 0
    ? (attributed === 0 ? 0 : 100)
    : Math.abs(attributed - reported) / reported * 100;
  const exceeded = driftPct > DRIFT_TOLERANCE_PCT;
  if (exceeded) {
    db.prepare(
      `INSERT INTO reconciliation_log
         (provider, period_start, period_end, attributed, reported, drift_pct, reconciled_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(input.provider, input.periodStart, input.periodEnd, attributed, reported, driftPct, input.now);
  }
  return { attributed, reported, driftPct, exceededTolerance: exceeded };
}
```

- [ ] **Step 4: Run — expect pass**

- [ ] **Step 5: Schedule daily job**

```typescript
// CLI/packages/agent/src/report/reconcile-loop.ts
import { getAppContext } from './app-context.js';
import { listProviders, getProvider, hasLivePlan } from '../providers/_shared/registry.js';
import { reconcileProvider } from './reconcile.js';

let timer: NodeJS.Timeout | null = null;
const DAY_MS = 24 * 60 * 60 * 1000;

export function startReconcileLoop(): void {
  if (timer) return;
  const tick = async () => { await reconcileAllProviders(); };
  tick().catch(() => {});
  timer = setInterval(tick, DAY_MS);
}

export function stopReconcileLoop(): void {
  if (timer) { clearInterval(timer); timer = null; }
}

export async function reconcileAllProviders(): Promise<void> {
  const ctx = getAppContext();
  for (const d of listProviders()) {
    if (!hasLivePlan(d.metadata.id)) continue;
    const entry = getProvider(d.metadata.id);
    if (!entry?.plan) continue;
    try {
      const snap = await ctx.fetchDriver.fetch(entry.descriptor, entry.plan);
      const reported = snap.quotas[0]?.used ?? 0;
      const now = Date.now();
      const result = reconcileProvider(ctx.db, {
        provider: d.metadata.id,
        reportedUsed: reported,
        periodStart: now - 30 * DAY_MS, // rolling 30d; may refine per plan later
        periodEnd: now,
        now,
      });
      if (result.exceededTolerance) {
        ctx.host.logger.warn('attribution drift exceeds tolerance', {
          provider: d.metadata.id,
          driftPct: result.driftPct.toFixed(2),
        });
      }
    } catch (err) {
      ctx.host.logger.warn('reconcile failed', { id: d.metadata.id, err: (err as Error).message });
    }
  }
}
```

- [ ] **Step 6: Wire into server lifecycle**

```typescript
// server.ts:
import { startReconcileLoop, stopReconcileLoop } from './report/reconcile-loop.js';
// in listen callback: startReconcileLoop();
// in shutdown, before stopAttributionLoops(): stopReconcileLoop();
```

- [ ] **Step 7: Build-check + commit**

```bash
cd CLI && npm run build --workspaces && cd ..
git add CLI/packages/agent/src/report/reconcile.ts \
        CLI/packages/agent/src/report/reconcile-loop.ts \
        CLI/packages/agent/src/report/__tests__/reconcile.test.ts \
        CLI/packages/agent/src/report/db.ts \
        CLI/packages/agent/src/server.ts
git commit -m "feat(report): daily reconciliation with 2% drift tolerance

Schema v3 adds reconciliation_log. reconcileProvider compares sum of
attribution amounts in the period against the provider's reported used
value; logs to reconciliation_log only when drift > DRIFT_TOLERANCE_PCT
(2%). Loop runs every 24h and warns via logger on exceedance. Does not
mutate historical attributions — diagnostic only."
```

### Task 3.6: Report service — aggregations for repos/features/files

**Files:**
- Create: `CLI/packages/agent/src/report/report-service.ts`
- Test: `CLI/packages/agent/src/report/__tests__/report-service.test.ts`

Pure read-side queries that back `/repos`, `/worktrees`, `/features`,
`/files` routes. Each returns a breakdown of `{provider, amount, unit}`
tuples aggregated over a time range. "Features" for v0.1 means worktree
(one feature = one branch = one worktree); proper feature detection
(branch naming conventions, jira-ticket grouping) comes in a later phase.

- [ ] **Step 1: Write failing test**

```typescript
// CLI/packages/agent/src/report/__tests__/report-service.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { applyV1, applyV2, applyV3 } from '../db.js';
import { addRepo } from '../repo-registry.js';
import { syncWorktrees } from '../worktree-scanner.js';
import {
  summarizeByRepo, summarizeByWorktree, summarizeByFile,
} from '../report-service.js';

describe('report-service', () => {
  let db: Database.Database;
  let repoId: number;
  let wtId: number;

  beforeEach(() => {
    const tmp = mkdtempSync(join(tmpdir(), 'wt-rpt-'));
    db = new Database(join(tmp, 't.db'));
    applyV1(db); applyV2(db); applyV3(db);
    const repo = addRepo(db, { name: 'r', path: '/r' });
    repoId = repo.id;
    syncWorktrees(db, repoId, [{ path: '/r', branch: 'main' }]);
    wtId = (db.prepare('SELECT id FROM worktrees').get() as { id: number }).id;
    // Seed a window + attribution + file change
    const win = db.prepare(
      `INSERT INTO activity_windows (worktree_id, window_start, window_end, file_event_count)
       VALUES (?, 1000, 2000, 5)`,
    ).run(wtId).lastInsertRowid as number;
    db.prepare(
      `INSERT INTO attributions (provider, worktree_id, window_id, amount, unit, snapshot_id, attributed_at)
       VALUES ('claude', ?, ?, 4.5, 'usd', 's', 1500)`,
    ).run(wtId, win);
    db.prepare(
      `INSERT INTO attributions (provider, worktree_id, window_id, amount, unit, snapshot_id, attributed_at)
       VALUES ('cursor', ?, ?, 2.0, 'requests', 's', 1500)`,
    ).run(wtId, win);
    db.prepare(
      `INSERT INTO file_changes (worktree_id, path, event, changed_at)
       VALUES (?, '/r/src/a.ts', 'save', 1200), (?, '/r/src/b.ts', 'save', 1400)`,
    ).run(wtId, wtId);
  });

  it('summarizeByRepo groups attributions per repo and provider', () => {
    const rows = summarizeByRepo(db, { since: 0, until: 9999 });
    expect(rows).toHaveLength(1);
    expect(rows[0].repoId).toBe(repoId);
    const providers = new Set(rows[0].perProvider.map(p => p.provider));
    expect(providers.has('claude')).toBe(true);
    expect(providers.has('cursor')).toBe(true);
    const claude = rows[0].perProvider.find(p => p.provider === 'claude');
    expect(claude?.amount).toBeCloseTo(4.5, 5);
  });

  it('summarizeByWorktree groups per worktree', () => {
    const rows = summarizeByWorktree(db, { since: 0, until: 9999 });
    expect(rows).toHaveLength(1);
    expect(rows[0].worktreeId).toBe(wtId);
    expect(rows[0].perProvider).toHaveLength(2);
  });

  it('summarizeByFile lists top-N file paths with event counts', () => {
    const rows = summarizeByFile(db, { since: 0, until: 9999, limit: 10 });
    expect(rows).toHaveLength(2);
    const paths = rows.map(r => r.path).sort();
    expect(paths).toEqual(['/r/src/a.ts', '/r/src/b.ts']);
    expect(rows[0].eventCount).toBe(1);
  });
});
```

- [ ] **Step 2: Implement `report-service.ts`**

```typescript
// CLI/packages/agent/src/report/report-service.ts
import type Database from 'better-sqlite3';

export interface TimeRange { since: number; until: number; }

export interface ProviderAmount {
  provider: string;
  amount: number;
  unit: string;
}

export interface RepoSummary {
  repoId: number;
  name: string;
  path: string;
  perProvider: ProviderAmount[];
}

export function summarizeByRepo(db: Database.Database, range: TimeRange): RepoSummary[] {
  const repos = db.prepare(`SELECT id, name, path FROM repos`).all() as Array<{
    id: number; name: string; path: string;
  }>;
  return repos.map(r => {
    const pp = db.prepare(
      `SELECT a.provider as provider, SUM(a.amount) as amount, a.unit as unit
       FROM attributions a
       JOIN worktrees w ON w.id = a.worktree_id
       WHERE w.repo_id = ? AND a.attributed_at BETWEEN ? AND ?
       GROUP BY a.provider, a.unit`,
    ).all(r.id, range.since, range.until) as ProviderAmount[];
    return { repoId: r.id, name: r.name, path: r.path, perProvider: pp };
  });
}

export interface WorktreeSummary {
  worktreeId: number;
  repoId: number;
  path: string;
  branch: string | null;
  perProvider: ProviderAmount[];
}

export function summarizeByWorktree(db: Database.Database, range: TimeRange): WorktreeSummary[] {
  const wts = db.prepare(`SELECT id, repo_id, path, branch FROM worktrees`).all() as Array<{
    id: number; repo_id: number; path: string; branch: string | null;
  }>;
  return wts.map(w => {
    const pp = db.prepare(
      `SELECT provider, SUM(amount) as amount, unit
       FROM attributions
       WHERE worktree_id = ? AND attributed_at BETWEEN ? AND ?
       GROUP BY provider, unit`,
    ).all(w.id, range.since, range.until) as ProviderAmount[];
    return {
      worktreeId: w.id, repoId: w.repo_id, path: w.path, branch: w.branch,
      perProvider: pp,
    };
  });
}

export interface FileSummary {
  path: string;
  eventCount: number;
  worktreeId: number;
}

export function summarizeByFile(
  db: Database.Database,
  range: TimeRange & { limit?: number },
): FileSummary[] {
  const limit = range.limit ?? 50;
  return db.prepare(
    `SELECT path, worktree_id, COUNT(*) as event_count
     FROM file_changes
     WHERE changed_at BETWEEN ? AND ?
     GROUP BY path, worktree_id
     ORDER BY event_count DESC
     LIMIT ?`,
  ).all(range.since, range.until, limit).map((r) => {
    const row = r as { path: string; worktree_id: number; event_count: number };
    return { path: row.path, worktreeId: row.worktree_id, eventCount: row.event_count };
  });
}
```

- [ ] **Step 3: Run — expect pass**

- [ ] **Step 4: Wire into routes**

```typescript
// CLI/packages/agent/src/routes/repos.ts (replace Phase 1 stub)
import { Router } from 'express';
import { getAppContext } from '../report/app-context.js';
import { summarizeByRepo } from '../report/report-service.js';

const router = Router();
router.get('/', (req, res) => {
  const since = Number(req.query.since ?? 0);
  const until = Number(req.query.until ?? Date.now());
  res.json({ repos: summarizeByRepo(getAppContext().db, { since, until }) });
});
export default router;

// CLI/packages/agent/src/routes/worktrees.ts — same shape, calls summarizeByWorktree
// CLI/packages/agent/src/routes/features.ts — for v0.1, alias to summarizeByWorktree
//   (feature == worktree == branch). Filter to non-main branches in route handler.
// CLI/packages/agent/src/routes/files.ts — calls summarizeByFile with limit query param
```

- [ ] **Step 5: Commit**

```bash
git add CLI/packages/agent/src/report/report-service.ts \
        CLI/packages/agent/src/report/__tests__/report-service.test.ts \
        CLI/packages/agent/src/routes/repos.ts \
        CLI/packages/agent/src/routes/worktrees.ts \
        CLI/packages/agent/src/routes/features.ts \
        CLI/packages/agent/src/routes/files.ts
git commit -m "feat(report): repo/worktree/file aggregations + live routes

summarizeByRepo/Worktree/File are pure DB queries returning per-provider
breakdowns over a time range. /repos, /worktrees, /features, /files routes
read from them. v0.1 treats feature == worktree (one branch = one
feature); richer feature grouping (by Jira key, by commit message prefix)
is deferred."
```

### Task 3.7: CLI commands `repos` / `worktrees` / `features` / `files` (still JSON)

**Files:**
- Modify: `CLI/packages/cli/src/commands/repos.ts`
- Modify: `CLI/packages/cli/src/commands/worktrees.ts`
- Modify: `CLI/packages/cli/src/commands/features.ts`
- Modify: `CLI/packages/cli/src/commands/files.ts`

Each command calls its agent route and prints raw JSON (renderers land in
Phase 4). Accepts `--since`, `--until`, `--limit` (files only), `--json`
(no-op now, respected by the renderer later).

- [ ] **Step 1: Implement `commands/repos.ts`**

```typescript
// CLI/packages/cli/src/commands/repos.ts
import { ensureAgent, agentGet } from '../agent-client.js';

export async function runRepos(
  opts: { since?: string; until?: string; json?: boolean },
): Promise<number> {
  await ensureAgent();
  const q = new URLSearchParams();
  if (opts.since) q.set('since', opts.since);
  if (opts.until) q.set('until', opts.until);
  const qs = q.toString();
  const data = await agentGet(`/repos${qs ? '?' + qs : ''}`);
  console.log(JSON.stringify(data, null, 2));
  return 0;
}
```

- [ ] **Step 2: Implement `commands/worktrees.ts`** — identical shape, hits `/worktrees`

- [ ] **Step 3: Implement `commands/features.ts`** — identical shape, hits `/features`

- [ ] **Step 4: Implement `commands/files.ts`** — adds `--limit` passthrough

```typescript
// CLI/packages/cli/src/commands/files.ts
import { ensureAgent, agentGet } from '../agent-client.js';

export async function runFiles(
  opts: { since?: string; until?: string; limit?: string; json?: boolean },
): Promise<number> {
  await ensureAgent();
  const q = new URLSearchParams();
  if (opts.since) q.set('since', opts.since);
  if (opts.until) q.set('until', opts.until);
  if (opts.limit) q.set('limit', opts.limit);
  const qs = q.toString();
  const data = await agentGet(`/files${qs ? '?' + qs : ''}`);
  console.log(JSON.stringify(data, null, 2));
  return 0;
}
```

- [ ] **Step 5: End-to-end smoke test**

```bash
cd CLI && npm run build --workspaces
node packages/agent/dist/server.js &
AGENT_PID=$!
sleep 1

mkdir -p /tmp/wt-attr-smoke && cd /tmp/wt-attr-smoke && git init -q
node /path/to/cursor-sm/CLI/packages/cli/dist/index.js watch
# touch a few files to generate file events
for i in 1 2 3; do echo hello > file$i.ts; sleep 20; done
# (Attribution loops tick on provider refresh intervals — for a fast check,
# manually force via: curl -s http://127.0.0.1:9315/providers/claude?refresh=1)

node /path/to/cursor-sm/CLI/packages/cli/dist/index.js repos
# Expected: one repo entry; perProvider array may be empty if no
# provider delta occurred during the window.

node /path/to/cursor-sm/CLI/packages/cli/dist/index.js files --limit 10
# Expected: file1.ts, file2.ts, file3.ts listed with eventCount >= 1.

kill $AGENT_PID
```

- [ ] **Step 6: Commit**

```bash
git add CLI/packages/cli/src/commands/repos.ts \
        CLI/packages/cli/src/commands/worktrees.ts \
        CLI/packages/cli/src/commands/features.ts \
        CLI/packages/cli/src/commands/files.ts
git commit -m "feat(cli): wire repos/worktrees/features/files to live agent

Each command proxies --since/--until (and --limit for files) to the agent
and dumps the JSON response. Rich rendering (progress bars, tables)
lands in Phase 4."
```

---

**Phase 3 exit criteria:**
- `npx vitest run` green across all report tests (sample-writer, attribution-writer, snapshot-writer, reconcile, report-service)
- Daemon can run for ≥10 minutes with `/providers`, `/repos`, `/files` responsive
- `reconciliation_log` stays empty for hero providers over a clean run (drift < 2%)
- `worktrace files` shows file events logged by the watcher after editing files in a watched repo
- SQLite DB at `~/.worktrace/report.db` has all 8 tables populated (repos, worktrees, activity_windows, provider_samples, attributions, file_changes, provider_snapshots, reconciliation_log)

## Phase 4 — Presentation Polish (est. 2-3 days)

Phase 3 delivered the data plumbing. Phase 4 makes it readable: CodexBar-
style progress bars, boxen quota cards, colored tables, a `pace` calc
that tells users whether they're ahead/behind/on-track, the three stretch
providers (Gemini, Augment, Kiro), an Extension UI rewrite, and a 7-day
burn-in to catch anything only surface-bar usage will show.

### Task 4.1: CLI rendering primitives — progress bar + colors

**Files:**
- Create: `CLI/packages/cli/src/render/progress-bar.ts`
- Create: `CLI/packages/cli/src/render/colors.ts`
- Test: `CLI/packages/cli/src/render/__tests__/progress-bar.test.ts`

A pure string renderer (no terminal escapes baked into the test assertions
— colors applied via a small `colorize` wrapper that can be disabled).
Matches the CodexBar aesthetic: filled block + empty block + used/limit
numbers + percentage + optional ETA suffix.

- [ ] **Step 1: Write failing test**

```typescript
// CLI/packages/cli/src/render/__tests__/progress-bar.test.ts
import { describe, it, expect } from 'vitest';
import { renderProgressBar } from '../progress-bar.js';

describe('renderProgressBar', () => {
  it('renders 50% bar with specified width', () => {
    const bar = renderProgressBar({ used: 50, limit: 100, width: 10, color: false });
    expect(bar).toContain('50/100');
    expect(bar).toContain('50.0%');
    // With width 10 and 50%, half the bar should be filled
    const filled = (bar.match(/█/g) ?? []).length;
    const empty = (bar.match(/░/g) ?? []).length;
    expect(filled).toBe(5);
    expect(empty).toBe(5);
  });

  it('clamps above-limit to 100%', () => {
    const bar = renderProgressBar({ used: 150, limit: 100, width: 10, color: false });
    expect(bar).toContain('100.0%');
    expect((bar.match(/█/g) ?? []).length).toBe(10);
  });

  it('handles zero limit (unlimited) by showing no bar', () => {
    const bar = renderProgressBar({ used: 42, limit: 0, width: 10, color: false });
    expect(bar).toContain('42');
    expect(bar).not.toContain('█');
  });

  it('appends ETA suffix when provided', () => {
    const bar = renderProgressBar({
      used: 50, limit: 100, width: 10, color: false, etaSuffix: '~ETA 3d',
    });
    expect(bar).toContain('~ETA 3d');
  });
});
```

- [ ] **Step 2: Run — expect fail**

- [ ] **Step 3: Implement `colors.ts`**

```typescript
// CLI/packages/cli/src/render/colors.ts
import chalk from 'chalk';

export interface ColorConfig { enabled: boolean; }

const NOOP = (s: string) => s;

export function palette(cfg: ColorConfig) {
  if (!cfg.enabled) {
    return { green: NOOP, yellow: NOOP, red: NOOP, dim: NOOP, bold: NOOP, cyan: NOOP };
  }
  return {
    green: (s: string) => chalk.green(s),
    yellow: (s: string) => chalk.yellow(s),
    red: (s: string) => chalk.red(s),
    dim: (s: string) => chalk.dim(s),
    bold: (s: string) => chalk.bold(s),
    cyan: (s: string) => chalk.cyan(s),
  };
}
```

- [ ] **Step 4: Implement `progress-bar.ts`**

```typescript
// CLI/packages/cli/src/render/progress-bar.ts
import { palette } from './colors.js';

export interface ProgressBarInput {
  used: number;
  limit: number;
  width?: number;
  color?: boolean;
  etaSuffix?: string;
}

const FILL = '█';
const EMPTY = '░';

export function renderProgressBar(input: ProgressBarInput): string {
  const { used, limit } = input;
  const width = input.width ?? 20;
  const p = palette({ enabled: input.color ?? true });
  if (limit <= 0) {
    const suffix = input.etaSuffix ? ` ${p.dim(input.etaSuffix)}` : '';
    return `${p.bold(used.toLocaleString())} (unlimited)${suffix}`;
  }
  const ratio = Math.max(0, Math.min(1, used / limit));
  const filled = Math.round(ratio * width);
  const bar = FILL.repeat(filled) + EMPTY.repeat(width - filled);
  const pct = (ratio * 100).toFixed(1) + '%';
  const colorize = ratio < 0.75 ? p.green : ratio < 0.9 ? p.yellow : p.red;
  const fmt = `${colorize(bar)} ${used}/${limit} ${colorize(pct)}`;
  return input.etaSuffix ? `${fmt} ${p.dim(input.etaSuffix)}` : fmt;
}
```

- [ ] **Step 5: Run — expect pass**

- [ ] **Step 6: Commit**

```bash
git add CLI/packages/cli/src/render/progress-bar.ts \
        CLI/packages/cli/src/render/colors.ts \
        CLI/packages/cli/src/render/__tests__/progress-bar.test.ts
git commit -m "feat(cli/render): progress bar + color palette

Pure-string progress bar renderer. Width-configurable, color-aware
(auto-green <75%, yellow <90%, red >=90%), handles unlimited quota
(no bar, just used count) and clamps above-limit to 100%. Optional
ETA suffix for pace/runway displays."
```

### Task 4.2: Quota card renderer (boxen)

**Files:**
- Create: `CLI/packages/cli/src/render/quota-card.ts`
- Test: `CLI/packages/cli/src/render/__tests__/quota-card.test.ts`

Wraps a provider snapshot in a `boxen` block. Title = provider display
name with icon accent; body = primary quota progress bar + extras as
dim bullet lines + identity footer (account/plan).

- [ ] **Step 1: Write failing test**

```typescript
// CLI/packages/cli/src/render/__tests__/quota-card.test.ts
import { describe, it, expect } from 'vitest';
import { renderQuotaCard } from '../quota-card.js';

describe('renderQuotaCard', () => {
  it('renders title + primary quota + extras + identity', () => {
    const out = renderQuotaCard({
      descriptor: {
        metadata: {
          id: 'claude', displayName: 'Claude', vendor: 'Anthropic',
          category: 'assistant', website: 'https://claude.ai',
        },
        branding: { icon: 'C', accent: '#D97757' },
        capabilities: {
          refreshIntervalMs: 60_000,
          quotaBar: { label: 'Monthly', unit: 'usd' },
          detailSections: [],
        },
      },
      snapshot: {
        providerId: 'claude',
        fetchedAt: 0,
        quotas: [{ label: 'Monthly', unit: 'usd', used: 42.5, limit: 100 }],
        extras: [{ label: 'Tokens', value: 1_000_000, unit: 'tokens' }],
        identity: { account: 'alice@example.com', plan: 'team' },
      },
      color: false,
    });
    expect(out).toContain('Claude');
    expect(out).toContain('42');
    expect(out).toContain('100');
    expect(out).toContain('Tokens');
    expect(out).toContain('1,000,000');
    expect(out).toContain('alice@example.com');
  });

  it('shows a coming-soon card when snapshot is null', () => {
    const out = renderQuotaCard({
      descriptor: {
        metadata: {
          id: 'gemini', displayName: 'Gemini', vendor: 'Google',
          category: 'assistant', website: 'https://g',
        },
        branding: { icon: 'G', accent: '#4285F4' },
        capabilities: { refreshIntervalMs: 60_000, quotaBar: undefined, detailSections: [] },
      },
      snapshot: null,
      color: false,
    });
    expect(out).toContain('Gemini');
    expect(out).toMatch(/coming.soon/i);
  });
});
```

- [ ] **Step 2: Implement `quota-card.ts`**

```typescript
// CLI/packages/cli/src/render/quota-card.ts
import boxen from 'boxen';
import { renderProgressBar } from './progress-bar.js';
import { palette } from './colors.js';
import type { ProviderDescriptor, UsageSnapshot } from '@worktrace/agent/shared-types';
// (For this import to work, either symlink types or copy them — see Task 1.1's
// re-export pattern. For simplicity, the CLI workspace copies types into
// packages/cli/src/types/provider-types.ts and imports from there.)

export interface QuotaCardInput {
  descriptor: ProviderDescriptor;
  snapshot: UsageSnapshot | null;
  color?: boolean;
}

export function renderQuotaCard(input: QuotaCardInput): string {
  const p = palette({ enabled: input.color ?? true });
  const d = input.descriptor;
  const title = `${p.bold(d.branding.icon + ' ' + d.metadata.displayName)} ${p.dim(d.metadata.vendor)}`;

  if (!input.snapshot) {
    return boxen(`${title}\n${p.dim('coming-soon')}`, {
      padding: 1, borderStyle: 'round', borderColor: 'gray',
    });
  }

  const snap = input.snapshot;
  const lines: string[] = [title];
  const primary = snap.quotas[0];
  if (primary) {
    const bar = renderProgressBar({
      used: primary.used,
      limit: primary.limit ?? 0,
      width: 24,
      color: input.color,
    });
    lines.push('');
    lines.push(`${p.dim(primary.label + ' (' + primary.unit + ')')}:`);
    lines.push(bar);
  }
  for (const e of snap.extras) {
    const valStr = typeof e.value === 'number' ? e.value.toLocaleString() : String(e.value);
    lines.push(`${p.dim('·')} ${e.label}: ${p.bold(valStr)} ${p.dim(e.unit ?? '')}`);
  }
  if (snap.identity) {
    lines.push('');
    lines.push(p.dim(`${snap.identity.account}${snap.identity.plan ? ' · ' + snap.identity.plan : ''}`));
  }
  return boxen(lines.join('\n'), {
    padding: 1,
    borderStyle: 'round',
    borderColor: input.color === false ? 'gray' : 'cyan',
  });
}
```

- [ ] **Step 3: Copy provider-types into CLI workspace**

```bash
# Create CLI/packages/cli/src/types/provider-types.ts as a re-export:
cat > CLI/packages/cli/src/types/provider-types.ts <<'EOF'
// Re-export of the agent's shared provider types. Kept as a thin duplicate
// to avoid cross-workspace import path headaches. When changing the agent's
// types.ts, update this file too.
export type {
  ProviderId, ProviderDescriptor, UsageSnapshot, QuotaBar, ExtraUsageBar,
  ProviderIdentity, ProviderMetadata, ProviderBranding, ProviderCapabilities,
} from './shared-types.js';
EOF
```

Then replace `from '@worktrace/agent/shared-types'` in `quota-card.ts`
with `from '../types/provider-types.js'`. (Actual `shared-types.ts` is
copied from the agent's `providers/_shared/types.ts` — include only the
exported types listed above.)

- [ ] **Step 4: Run — expect pass**

- [ ] **Step 5: Commit**

```bash
git add CLI/packages/cli/src/render/quota-card.ts \
        CLI/packages/cli/src/render/__tests__/quota-card.test.ts \
        CLI/packages/cli/src/types/
git commit -m "feat(cli/render): boxen-wrapped provider quota card

Title bar with icon+display name, primary quota as progress bar, extras
as dim bulleted lines, identity footer. Renders a dim 'coming-soon'
card when snapshot is null (stub/stretch providers). Provider types are
mirrored into the CLI workspace to avoid cross-workspace imports."
```

### Task 4.3: Table renderer for repos/features/files

**Files:**
- Create: `CLI/packages/cli/src/render/table.ts`
- Test: `CLI/packages/cli/src/render/__tests__/table.test.ts`

Uses `cli-table3` with a three-column layout (name/path, provider
breakdown formatted as `claude:$4.50 cursor:40req`, total). Extracts
the per-provider list into a compact string.

- [ ] **Step 1: Write failing test**

```typescript
// CLI/packages/cli/src/render/__tests__/table.test.ts
import { describe, it, expect } from 'vitest';
import { renderRepoTable } from '../table.js';

describe('renderRepoTable', () => {
  it('formats rows with per-provider breakdown', () => {
    const out = renderRepoTable({
      repos: [{
        repoId: 1, name: 'acme', path: '/src/acme',
        perProvider: [
          { provider: 'claude', amount: 4.5, unit: 'usd' },
          { provider: 'cursor', amount: 40, unit: 'requests' },
        ],
      }],
      color: false,
    });
    expect(out).toContain('acme');
    expect(out).toContain('claude:$4.50');
    expect(out).toContain('cursor:40req');
  });

  it('shows em-dash when no attributions', () => {
    const out = renderRepoTable({
      repos: [{ repoId: 1, name: 'empty', path: '/x', perProvider: [] }],
      color: false,
    });
    expect(out).toContain('—');
  });
});
```

- [ ] **Step 2: Implement `table.ts`**

```typescript
// CLI/packages/cli/src/render/table.ts
import Table from 'cli-table3';
import { palette } from './colors.js';

export interface RepoTableRow {
  repoId: number;
  name: string;
  path: string;
  perProvider: Array<{ provider: string; amount: number; unit: string }>;
}

export interface RepoTableInput {
  repos: RepoTableRow[];
  color?: boolean;
}

function formatUnit(amount: number, unit: string): string {
  if (unit === 'usd') return '$' + amount.toFixed(2);
  if (unit === 'requests') return Math.round(amount) + 'req';
  if (unit === 'messages') return Math.round(amount) + 'msg';
  if (unit === 'tokens') return Math.round(amount) + 'tok';
  return amount.toFixed(2) + ' ' + unit;
}

function formatBreakdown(
  entries: RepoTableRow['perProvider'],
): string {
  if (entries.length === 0) return '—';
  return entries
    .map(e => `${e.provider}:${formatUnit(e.amount, e.unit)}`)
    .join('  ');
}

export function renderRepoTable(input: RepoTableInput): string {
  const p = palette({ enabled: input.color ?? true });
  const t = new Table({
    head: [p.bold('Repo'), p.bold('Path'), p.bold('Usage')],
    style: { head: [], border: [] },
  });
  for (const row of input.repos) {
    t.push([p.cyan(row.name), p.dim(row.path), formatBreakdown(row.perProvider)]);
  }
  return t.toString();
}
```

- [ ] **Step 3: Run — expect pass**

- [ ] **Step 4: Commit**

```bash
git add CLI/packages/cli/src/render/table.ts \
        CLI/packages/cli/src/render/__tests__/table.test.ts
git commit -m "feat(cli/render): repo/feature/file table via cli-table3

Compact per-provider breakdown formatted as 'claude:\$4.50 cursor:40req'
with em-dash placeholder when no attributions exist. Shared formatUnit
handles usd/requests/messages/tokens with appropriate precision and
suffix."
```

### Task 4.4: Pace calculator + runway/ETA

**Files:**
- Create: `CLI/packages/agent/src/report/pace-calculator.ts`
- Test: `CLI/packages/agent/src/report/__tests__/pace-calculator.test.ts`

Pure function that takes `{used, limit, periodStart, periodEnd, now}` and
returns:
- `expectedPct` = elapsed fraction of period × 100
- `actualPct` = used / limit × 100
- `paceDelta` = actualPct - expectedPct
- `status` = 'ahead' (delta ≤ -15), 'on-track' (-15 < delta < 5), 'warning' (5-15), 'critical' (> 15)
- `burnRate` = used / (now - periodStart)  — units per ms
- `runwayMs` = remaining / burnRate  (capped at period remaining)
- `etaAt` = now + runwayMs (null if never — e.g. zero burn rate)

- [ ] **Step 1: Write failing test**

```typescript
// CLI/packages/agent/src/report/__tests__/pace-calculator.test.ts
import { describe, it, expect } from 'vitest';
import { computePace } from '../pace-calculator.js';

const DAY = 24 * 60 * 60 * 1000;

describe('computePace', () => {
  it('returns on-track when pace is within ±5% of expected', () => {
    // 50% through period, used 48%
    const r = computePace({
      used: 48, limit: 100,
      periodStart: 0, periodEnd: 10 * DAY, now: 5 * DAY,
    });
    expect(r.expectedPct).toBeCloseTo(50, 1);
    expect(r.actualPct).toBe(48);
    expect(r.paceDelta).toBeCloseTo(-2, 1);
    expect(r.status).toBe('on-track');
  });

  it('returns warning when pace exceeds +5%', () => {
    const r = computePace({
      used: 60, limit: 100,
      periodStart: 0, periodEnd: 10 * DAY, now: 5 * DAY,
    });
    expect(r.paceDelta).toBeCloseTo(10, 1);
    expect(r.status).toBe('warning');
  });

  it('returns critical when pace exceeds +15%', () => {
    const r = computePace({
      used: 70, limit: 100,
      periodStart: 0, periodEnd: 10 * DAY, now: 5 * DAY,
    });
    expect(r.paceDelta).toBeCloseTo(20, 1);
    expect(r.status).toBe('critical');
  });

  it('returns ahead when pace trails by >15%', () => {
    const r = computePace({
      used: 20, limit: 100,
      periodStart: 0, periodEnd: 10 * DAY, now: 5 * DAY,
    });
    expect(r.status).toBe('ahead');
  });

  it('computes runway ETA when on pace to exhaust early', () => {
    // Used 60 in 5 days at 10 days period → burn 12/day, runway = 40/12 days
    const r = computePace({
      used: 60, limit: 100,
      periodStart: 0, periodEnd: 10 * DAY, now: 5 * DAY,
    });
    expect(r.burnRatePerMs).toBeCloseTo(60 / (5 * DAY), 10);
    expect(r.runwayMs).toBeCloseTo(40 / 60 * 5 * DAY, -2); // ~3.33 days
    expect(r.etaAt).toBeCloseTo(5 * DAY + r.runwayMs, -2);
  });

  it('returns null ETA when burn rate is zero', () => {
    const r = computePace({
      used: 0, limit: 100,
      periodStart: 0, periodEnd: 10 * DAY, now: 5 * DAY,
    });
    expect(r.etaAt).toBeNull();
  });
});
```

- [ ] **Step 2: Implement `pace-calculator.ts`**

```typescript
// CLI/packages/agent/src/report/pace-calculator.ts
import { PACE_WARN_DELTA_PCT, PACE_CRITICAL_DELTA_PCT } from './constants.js';

export interface PaceInput {
  used: number;
  limit: number;
  periodStart: number;
  periodEnd: number;
  now: number;
}

export type PaceStatus = 'ahead' | 'on-track' | 'warning' | 'critical';

export interface PaceResult {
  expectedPct: number;
  actualPct: number;
  paceDelta: number;
  status: PaceStatus;
  burnRatePerMs: number;
  runwayMs: number | null;
  etaAt: number | null;
}

export function computePace(input: PaceInput): PaceResult {
  const totalMs = input.periodEnd - input.periodStart;
  const elapsedMs = Math.max(0, input.now - input.periodStart);
  const expectedPct = totalMs > 0 ? (elapsedMs / totalMs) * 100 : 0;
  const actualPct = input.limit > 0 ? (input.used / input.limit) * 100 : 0;
  const paceDelta = actualPct - expectedPct;

  let status: PaceStatus;
  if (paceDelta < -PACE_CRITICAL_DELTA_PCT) status = 'ahead';
  else if (paceDelta > PACE_CRITICAL_DELTA_PCT) status = 'critical';
  else if (paceDelta > PACE_WARN_DELTA_PCT)    status = 'warning';
  else                                         status = 'on-track';

  const burnRatePerMs = elapsedMs > 0 ? input.used / elapsedMs : 0;
  let runwayMs: number | null = null;
  let etaAt: number | null = null;
  if (burnRatePerMs > 0) {
    const remaining = Math.max(0, input.limit - input.used);
    runwayMs = remaining / burnRatePerMs;
    etaAt = input.now + runwayMs;
  }
  return { expectedPct, actualPct, paceDelta, status, burnRatePerMs, runwayMs, etaAt };
}
```

- [ ] **Step 3: Run — expect pass**

- [ ] **Step 4: Commit**

```bash
git add CLI/packages/agent/src/report/pace-calculator.ts \
        CLI/packages/agent/src/report/__tests__/pace-calculator.test.ts
git commit -m "feat(report): pace calculator with runway ETA

Pure function deriving expectedPct, actualPct, paceDelta, pace status
('ahead'|'on-track'|'warning'|'critical'), burn rate, runway (remaining
/ burn rate), and eta timestamp. Thresholds come from constants
(PACE_WARN=5%, PACE_CRITICAL=15%)."
```

### Task 4.5: Wire renderers into all CLI commands

**Files:**
- Modify: `CLI/packages/cli/src/commands/providers.ts`
- Modify: `CLI/packages/cli/src/commands/repos.ts`
- Modify: `CLI/packages/cli/src/commands/worktrees.ts`
- Modify: `CLI/packages/cli/src/commands/features.ts`
- Modify: `CLI/packages/cli/src/commands/files.ts`
- Modify: `CLI/packages/cli/src/commands/pace.ts` (replaces stub)
- Create: `CLI/packages/agent/src/routes/pace.ts` (replaces Phase 1 stub; returns per-provider PaceResult)
- Modify: `CLI/packages/cli/src/commands/report.ts` (replaces stub; paginated combined report)

Each CLI command now honors `--json` to dump raw JSON (existing behavior)
or applies the appropriate renderer when TTY output is requested (default).
The `pace` command fetches snapshots + period boundaries from the agent's
new `/pace` route and renders a progress bar per provider with pace status
colored appropriately.

- [ ] **Step 1: Implement `/pace` route**

```typescript
// CLI/packages/agent/src/routes/pace.ts
import { Router } from 'express';
import { getAppContext } from '../report/app-context.js';
import { listProviders, getProvider, hasLivePlan } from '../providers/_shared/registry.js';
import { computePace } from '../report/pace-calculator.js';
import type { ProviderId } from '../providers/_shared/types.js';

const router = Router();

router.get('/', async (_req, res) => {
  const { fetchDriver } = getAppContext();
  const out: Array<{ id: ProviderId; pace: ReturnType<typeof computePace> | null; error?: string }> = [];
  for (const d of listProviders()) {
    if (!hasLivePlan(d.metadata.id)) continue;
    const entry = getProvider(d.metadata.id);
    if (!entry?.plan) continue;
    try {
      const snap = await fetchDriver.fetch(entry.descriptor, entry.plan);
      const q = snap.quotas[0];
      if (!q || q.limit === undefined || !q.periodEnd) {
        out.push({ id: d.metadata.id, pace: null });
        continue;
      }
      const periodEnd = Date.parse(q.periodEnd);
      // Heuristic: periodStart = periodEnd - 30 days. Providers with richer
      // period metadata can override this in a later phase.
      const periodStart = periodEnd - 30 * 24 * 60 * 60 * 1000;
      const pace = computePace({
        used: q.used, limit: q.limit,
        periodStart, periodEnd, now: Date.now(),
      });
      out.push({ id: d.metadata.id, pace });
    } catch (err) {
      out.push({ id: d.metadata.id, pace: null, error: (err as Error).message });
    }
  }
  res.json({ fetchedAt: Date.now(), providers: out });
});

export default router;
```

- [ ] **Step 2: Implement `commands/pace.ts`**

```typescript
// CLI/packages/cli/src/commands/pace.ts
import { ensureAgent, agentGet } from '../agent-client.js';
import { palette } from '../render/colors.js';
import { renderProgressBar } from '../render/progress-bar.js';

interface PaceRow {
  id: string;
  pace: null | {
    expectedPct: number; actualPct: number; paceDelta: number;
    status: 'ahead' | 'on-track' | 'warning' | 'critical';
    runwayMs: number | null; etaAt: number | null;
  };
  error?: string;
}

function formatEta(etaAt: number | null): string | undefined {
  if (etaAt === null) return undefined;
  const days = (etaAt - Date.now()) / (24 * 60 * 60 * 1000);
  if (days < 1) return `ETA ~${(days * 24).toFixed(1)}h`;
  return `ETA ~${days.toFixed(1)}d`;
}

const STATUS_LABEL = {
  ahead: 'AHEAD', 'on-track': 'ON-TRACK',
  warning: 'WARN', critical: 'CRIT',
} as const;

export async function runPace(opts: { json?: boolean }): Promise<number> {
  await ensureAgent();
  const data = await agentGet<{ providers: PaceRow[] }>('/pace');
  if (opts.json) {
    console.log(JSON.stringify(data, null, 2));
    return 0;
  }
  const p = palette({ enabled: true });
  for (const row of data.providers) {
    if (!row.pace) {
      console.log(`${p.bold(row.id)} ${p.dim(row.error ?? 'no period data')}`);
      continue;
    }
    const colorize =
      row.pace.status === 'critical' ? p.red :
      row.pace.status === 'warning'  ? p.yellow :
      row.pace.status === 'ahead'    ? p.cyan : p.green;
    const bar = renderProgressBar({
      used: row.pace.actualPct, limit: 100, width: 24,
      etaSuffix: formatEta(row.pace.etaAt),
    });
    console.log(`${p.bold(row.id)} ${colorize(STATUS_LABEL[row.pace.status])} ${bar}`);
  }
  return 0;
}
```

- [ ] **Step 3: Update `commands/providers.ts` to render cards**

```typescript
// CLI/packages/cli/src/commands/providers.ts
import { ensureAgent, agentGet } from '../agent-client.js';
import { renderQuotaCard } from '../render/quota-card.js';

export async function runProviders(
  id: string | undefined,
  opts: { json?: boolean; refresh?: boolean },
): Promise<number> {
  await ensureAgent();
  if (id) {
    const suffix = opts.refresh ? '?refresh=1' : '';
    const data = await agentGet<{
      descriptor: Parameters<typeof renderQuotaCard>[0]['descriptor'];
      snapshot: Parameters<typeof renderQuotaCard>[0]['snapshot'];
      status: string;
    }>(`/providers/${encodeURIComponent(id)}${suffix}`);
    if (opts.json) {
      console.log(JSON.stringify(data, null, 2));
      return 0;
    }
    console.log(renderQuotaCard({
      descriptor: data.descriptor,
      snapshot: data.snapshot,
    }));
    return 0;
  }
  // List mode — print small cards for every provider in a grid.
  const list = await agentGet<{ providers: Array<{ id: string }> }>('/providers');
  if (opts.json) {
    console.log(JSON.stringify(list, null, 2));
    return 0;
  }
  for (const p of list.providers) {
    const detail = await agentGet<{
      descriptor: Parameters<typeof renderQuotaCard>[0]['descriptor'];
      snapshot: Parameters<typeof renderQuotaCard>[0]['snapshot'];
    }>(`/providers/${encodeURIComponent(p.id)}`);
    console.log(renderQuotaCard(detail));
  }
  return 0;
}
```

- [ ] **Step 4: Update `commands/repos.ts` / `worktrees.ts` / `features.ts` to render tables**

```typescript
// CLI/packages/cli/src/commands/repos.ts (renderer swap-in shown; same
// pattern for worktrees/features):
import { ensureAgent, agentGet } from '../agent-client.js';
import { renderRepoTable } from '../render/table.js';

export async function runRepos(
  opts: { since?: string; until?: string; json?: boolean },
): Promise<number> {
  await ensureAgent();
  const q = new URLSearchParams();
  if (opts.since) q.set('since', opts.since);
  if (opts.until) q.set('until', opts.until);
  const data = await agentGet<{ repos: Parameters<typeof renderRepoTable>[0]['repos'] }>(
    `/repos${q.toString() ? '?' + q : ''}`,
  );
  if (opts.json) {
    console.log(JSON.stringify(data, null, 2));
    return 0;
  }
  console.log(renderRepoTable({ repos: data.repos }));
  return 0;
}
```

`worktrees.ts` / `features.ts`: import `renderRepoTable` and map the
response shape (worktreeId → repoId is fine to reuse).

- [ ] **Step 5: Update `commands/files.ts` to render a simple table**

```typescript
// Just print as ascii table — reuse cli-table3 directly here since the
// row shape differs (path/eventCount/worktree):
import Table from 'cli-table3';

export async function runFiles(opts: {
  since?: string; until?: string; limit?: string; json?: boolean;
}): Promise<number> {
  await ensureAgent();
  const q = new URLSearchParams();
  if (opts.since) q.set('since', opts.since);
  if (opts.until) q.set('until', opts.until);
  if (opts.limit) q.set('limit', opts.limit);
  const data = await agentGet<{ files: Array<{ path: string; eventCount: number; worktreeId: number }> }>(
    `/files${q.toString() ? '?' + q : ''}`,
  );
  if (opts.json) {
    console.log(JSON.stringify(data, null, 2));
    return 0;
  }
  const t = new Table({ head: ['Path', 'Events', 'Worktree'] });
  for (const f of data.files) t.push([f.path, String(f.eventCount), String(f.worktreeId)]);
  console.log(t.toString());
  return 0;
}
```

- [ ] **Step 6: Implement `commands/report.ts` (combined period report)**

```typescript
// CLI/packages/cli/src/commands/report.ts
import { ensureAgent, agentGet } from '../agent-client.js';
import { renderQuotaCard } from '../render/quota-card.js';
import { renderRepoTable } from '../render/table.js';
import { palette } from '../render/colors.js';

export async function runReport(opts: {
  period?: string; json?: boolean;
}): Promise<number> {
  await ensureAgent();
  const period = opts.period ?? 'month';
  const [providers, repos, files] = await Promise.all([
    agentGet<{ providers: Array<{ id: string }> }>('/providers'),
    agentGet<{ repos: Parameters<typeof renderRepoTable>[0]['repos'] }>(
      `/repos?period=${encodeURIComponent(period)}`,
    ),
    agentGet<{ files: Array<{ path: string; eventCount: number }> }>(
      `/files?period=${encodeURIComponent(period)}&limit=20`,
    ),
  ]);
  if (opts.json) {
    console.log(JSON.stringify({ providers, repos, files }, null, 2));
    return 0;
  }
  const p = palette({ enabled: true });
  console.log(p.bold(`== Worktrace Report (${period}) ==\n`));
  console.log(p.bold('Providers:'));
  for (const prov of providers.providers) {
    const detail = await agentGet<{
      descriptor: Parameters<typeof renderQuotaCard>[0]['descriptor'];
      snapshot: Parameters<typeof renderQuotaCard>[0]['snapshot'];
    }>(`/providers/${encodeURIComponent(prov.id)}`);
    console.log(renderQuotaCard(detail));
  }
  console.log(p.bold('\nRepos:'));
  console.log(renderRepoTable({ repos: repos.repos }));
  console.log(p.bold('\nTop files:'));
  for (const f of files.files) {
    console.log(`  ${p.dim(String(f.eventCount))}  ${f.path}`);
  }
  return 0;
}
```

- [ ] **Step 7: End-to-end visual smoke test**

```bash
cd CLI && npm run build --workspaces
node packages/agent/dist/server.js &
AGENT_PID=$!
sleep 1
node packages/cli/dist/index.js providers
node packages/cli/dist/index.js pace
node packages/cli/dist/index.js repos
node packages/cli/dist/index.js files --limit 5
node packages/cli/dist/index.js report --period week
kill $AGENT_PID
```
Expected: colored boxes for providers, progress bars for pace, tables
for repos/files, and a combined report for the last command. Nothing
crashes even when providers error out.

- [ ] **Step 8: Commit**

```bash
git add CLI/packages/cli/src/commands/ \
        CLI/packages/agent/src/routes/pace.ts
git commit -m "feat(cli): render providers/pace/repos/files/report

Swaps JSON dumps for boxen quota cards, progress bars, and cli-table3
tables. /pace route adds per-provider PaceResult. report command runs
a combined 'providers + repos + top files' summary. --json preserves
raw output for scripting."
```

### Task 4.6: Stretch providers — Gemini, Augment, Kiro

**Files (per provider, total 3 providers × ~5 files):**
- Modify: `providers/gemini/descriptor.ts`, add `models.ts`, `parser.ts`, `strategies.ts`, `index.ts`, `__tests__/parser.test.ts`
- Same for `providers/augment/` and `providers/kiro/`
- Modify: `providers/_shared/registry.ts` — swap each descriptor-only entry for `{descriptor, plan}`

Ship one working strategy each, trivially testable via a parser golden-file
suite. These keep the same structure as hero providers; scope here is
deliberately narrow (one strategy each).

- [ ] **Step 1: Gemini — `apikey-http` via Google AI Studio**

```typescript
// CLI/packages/agent/src/providers/gemini/models.ts
import { registerModelCost } from '../_host/token-cost-models.js';
export const GEMINI_MODELS = [
  { id: 'gemini-2.5-pro',   inputPer1K: 2.5,  outputPer1K: 10.0 },
  { id: 'gemini-2.5-flash', inputPer1K: 0.30, outputPer1K: 1.20 },
  { id: 'gemini-1.5-pro',   inputPer1K: 1.25, outputPer1K: 5.0  },
] as const;
for (const m of GEMINI_MODELS) {
  registerModelCost('gemini', m.id, { inputPer1K: m.inputPer1K, outputPer1K: m.outputPer1K });
}
```

```typescript
// CLI/packages/agent/src/providers/gemini/parser.ts
import type { UsageSnapshot } from '../_shared/types.js';

interface GeminiUsage {
  project?: { id?: string; name?: string };
  quota?: { used?: number; limit?: number; unit?: string };
  period_end?: string;
  model_breakdown?: Array<{ model: string; tokens: number }>;
}

export function parseGeminiUsage(raw: unknown, fetchedAt: number): UsageSnapshot {
  const r = (raw ?? {}) as GeminiUsage;
  const quotas: UsageSnapshot['quotas'] = [];
  if (typeof r.quota?.used === 'number' && typeof r.quota?.limit === 'number') {
    quotas.push({
      label: 'AI Studio quota',
      unit: (r.quota.unit as 'usd' | 'tokens') ?? 'tokens',
      used: r.quota.used,
      limit: r.quota.limit,
      periodEnd: r.period_end,
    });
  }
  const extras: UsageSnapshot['extras'] = [];
  if (Array.isArray(r.model_breakdown)) {
    const total = r.model_breakdown.reduce((acc, m) => acc + (m.tokens ?? 0), 0);
    if (total > 0) extras.push({ label: 'Total tokens', value: total, unit: 'tokens' });
  }
  return {
    providerId: 'gemini',
    fetchedAt,
    quotas,
    extras,
    identity: r.project?.name ? { account: r.project.name } : undefined,
  };
}
```

```typescript
// CLI/packages/agent/src/providers/gemini/strategies.ts
import type { ProviderFetchStrategy, FetchContext } from '../_shared/types.js';
import { parseGeminiUsage } from './parser.js';

export const apiKeyHttp: ProviderFetchStrategy = {
  kind: 'apikey-http',
  shouldFallback: true,
  async preconditions() {
    return {
      available: Boolean(process.env.GEMINI_API_KEY),
      reason: 'GEMINI_API_KEY env missing',
    };
  },
  async perform(ctx: FetchContext) {
    const key = process.env.GEMINI_API_KEY!;
    const res = await ctx.host.http.request({
      url: `https://generativelanguage.googleapis.com/v1beta/billing/usage?key=${encodeURIComponent(key)}`,
      timeoutMs: 10_000,
      retries: 1,
    });
    return parseGeminiUsage(res.body, ctx.now());
  },
};
```

```typescript
// CLI/packages/agent/src/providers/gemini/index.ts
import { descriptor } from './descriptor.js';
import { apiKeyHttp } from './strategies.js';
import type { ProviderDescriptor, ProviderFetchPlan } from '../_shared/types.js';
import './models.js';
export const gemini: ProviderDescriptor = descriptor;
export const geminiPlan: ProviderFetchPlan = { strategies: [apiKeyHttp] };
```

```typescript
// CLI/packages/agent/src/providers/gemini/__tests__/parser.test.ts
import { describe, it, expect } from 'vitest';
import { parseGeminiUsage } from '../parser.js';

describe('gemini parser', () => {
  it('maps quota and model breakdown', () => {
    const snap = parseGeminiUsage({
      project: { id: 'p1', name: 'Acme' },
      quota: { used: 120000, limit: 1000000, unit: 'tokens' },
      period_end: '2026-04-30T23:59:59Z',
      model_breakdown: [{ model: 'gemini-2.5-pro', tokens: 80_000 }],
    }, 1);
    expect(snap.quotas[0].used).toBe(120000);
    expect(snap.quotas[0].limit).toBe(1000000);
    expect(snap.extras[0].value).toBe(80_000);
    expect(snap.identity?.account).toBe('Acme');
  });
  it('empty on missing fields', () => {
    expect(parseGeminiUsage({}, 0).quotas).toEqual([]);
  });
});
```

- [ ] **Step 2: Augment — `local-config-scan` of `~/.augment/session.json`**

Mirror the Gemini pattern; skip models.ts (pricing is flat-rate).
Strategy reads `~/.augment/session.json` and maps `session.usage` →
quota bar. Parser test uses a tiny fixture. `augmentPlan.strategies`
= `[localConfigScan]`.

- [ ] **Step 3: Kiro — `local-config-scan` of `~/.kiro/workspace.json`**

Same pattern. Kiro stores tier + remaining messages in a local file;
parser maps `remaining` / `total_messages` into a messages quota bar.

- [ ] **Step 4: Register plans in `registry.ts`**

```typescript
// CLI/packages/agent/src/providers/_shared/registry.ts — replace the
// three descriptor-only entries with plan-bearing entries:
import { gemini,  geminiPlan  } from '../gemini/index.js';
import { augment, augmentPlan } from '../augment/index.js';
import { kiro,    kiroPlan    } from '../kiro/index.js';
// In REGISTRY:
  gemini:  { descriptor: gemini,  plan: geminiPlan  },
  augment: { descriptor: augment, plan: augmentPlan },
  kiro:    { descriptor: kiro,    plan: kiroPlan    },
```

- [ ] **Step 5: Run tests for all three**

```bash
cd CLI/packages/agent && npx vitest run src/providers/gemini src/providers/augment src/providers/kiro
```
Expected: parser tests pass for all three.

- [ ] **Step 6: Build-check + commit**

```bash
cd CLI && npm run build --workspaces && cd ..
git add CLI/packages/agent/src/providers/gemini/ \
        CLI/packages/agent/src/providers/augment/ \
        CLI/packages/agent/src/providers/kiro/ \
        CLI/packages/agent/src/providers/_shared/registry.ts
git commit -m "feat(providers): stretch providers Gemini + Augment + Kiro

Gemini: apikey-http via Google AI Studio billing endpoint (GEMINI_API_KEY).
Augment: local-config-scan of ~/.augment/session.json.
Kiro:    local-config-scan of ~/.kiro/workspace.json (tier + messages).
All three registered with full plans; 12 providers remain descriptor-only
stubs (coming-soon) for post-v0.1 phases."
```

### Task 4.7: Extension rewrite — status bar + commands

**Files:**
- Rewrite: `Extension/src/extension.ts`
- Rewrite: `Extension/src/agent-client.ts`
- Rewrite: `Extension/src/status-bar.ts` (new)
- Rewrite: `Extension/src/types.ts` (strip old SessionStatus etc.; add ProviderSnapshot view types)
- Modify: `Extension/package.json` (drop old `worktrace.*` commands; add v0.1 ones)

v0.1 extension surface (spec section 4.4):
- **Status bar item** — cycles through live providers every 10s, shows
  `<icon> <providerName> <used>/<limit> <pct>` with color coding matching
  pace status. Click opens the provider detail quick-pick.
- **Commands:**
  - `worktrace.showProviders` — quick-pick list of provider snapshots
  - `worktrace.watchRepo` — start watching current workspace
  - `worktrace.unwatchRepo` — stop watching current workspace
  - `worktrace.showPace` — opens a text viewer with the pace report
  - `worktrace.showReport` — opens a text viewer with the full report
  - `worktrace.refreshAll` — force refresh all providers

- [ ] **Step 1: Strip old code**

```bash
# From repo root:
# Remove files no longer needed (session/auth/safety/card UI). Preserve
# workspace.ts (used by new code) and agent-client.ts (rewritten below).
cd Extension/src
rm -f -- safety-monitor.ts session-ui.ts auth-ui.ts card-ui.ts \
         context-viewer.ts history-viewer.ts display-name.ts
cd ../..
```

- [ ] **Step 2: Rewrite `agent-client.ts`**

```typescript
// Extension/src/agent-client.ts
import * as vscode from 'vscode';
import { spawn } from 'node:child_process';

const AGENT_PORT = 9315;
const AGENT_BASE = `http://127.0.0.1:${AGENT_PORT}`;

let agentProc: ReturnType<typeof spawn> | null = null;

export async function ensureAgent(context: vscode.ExtensionContext): Promise<void> {
  try {
    const r = await fetch(`${AGENT_BASE}/health`, { signal: AbortSignal.timeout(1000) });
    if (r.ok) return;
  } catch { /* fall through to spawn */ }
  const agentPath = vscode.workspace.getConfiguration('worktrace').get<string>('agentPath');
  if (!agentPath) {
    vscode.window.showErrorMessage(
      'worktrace.agentPath is not set. Point it at node_modules/@worktrace/agent/dist/server.js',
    );
    return;
  }
  agentProc = spawn(process.execPath, [agentPath], { detached: true, stdio: 'ignore' });
  agentProc.unref();
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 150));
    try {
      const r = await fetch(`${AGENT_BASE}/health`);
      if (r.ok) return;
    } catch { /* retry */ }
  }
  vscode.window.showErrorMessage('worktrace agent did not start within 3s');
}

export async function agentGet<T = unknown>(path: string): Promise<T> {
  const r = await fetch(`${AGENT_BASE}${path}`);
  if (!r.ok) throw new Error(`agent ${path} returned ${r.status}`);
  return r.json() as Promise<T>;
}

export async function agentPost<T = unknown>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${AGENT_BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`agent ${path} returned ${r.status}`);
  return r.json() as Promise<T>;
}
```

- [ ] **Step 3: Implement `status-bar.ts`**

```typescript
// Extension/src/status-bar.ts
import * as vscode from 'vscode';
import { agentGet } from './agent-client.js';

const CYCLE_MS = 10_000;

interface PaceProvider {
  id: string;
  pace: null | {
    actualPct: number;
    status: 'ahead' | 'on-track' | 'warning' | 'critical';
    runwayMs: number | null;
  };
}

interface ProviderSnapshot {
  descriptor: { metadata: { displayName: string }; branding: { icon: string } };
  snapshot: null | { quotas: Array<{ used: number; limit: number; unit: string }> };
}

export function createStatusBar(context: vscode.ExtensionContext): vscode.StatusBarItem {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  item.command = 'worktrace.showProviders';
  item.show();
  context.subscriptions.push(item);

  let index = 0;
  const tick = async () => {
    try {
      const pace = await agentGet<{ providers: PaceProvider[] }>('/pace');
      if (pace.providers.length === 0) {
        item.text = '$(pulse) worktrace';
        item.tooltip = 'No live providers — run `worktrace providers` to check setup';
        return;
      }
      const row = pace.providers[index % pace.providers.length];
      index += 1;
      const detail = await agentGet<ProviderSnapshot>(`/providers/${encodeURIComponent(row.id)}`);
      const q = detail.snapshot?.quotas[0];
      const name = detail.descriptor.metadata.displayName;
      const icon = detail.descriptor.branding.icon;
      if (!q) {
        item.text = `${icon} ${name}: —`;
      } else {
        const pct = row.pace?.actualPct?.toFixed(0) ?? '?';
        item.text = `${icon} ${name} ${q.used}/${q.limit} (${pct}%)`;
      }
      item.color =
        row.pace?.status === 'critical' ? new vscode.ThemeColor('errorForeground') :
        row.pace?.status === 'warning'  ? new vscode.ThemeColor('editorWarning.foreground') :
        undefined;
      item.tooltip = 'Click for all providers';
    } catch (err) {
      item.text = '$(warning) worktrace offline';
      item.tooltip = (err as Error).message;
    }
  };
  const timer = setInterval(tick, CYCLE_MS);
  context.subscriptions.push({ dispose: () => clearInterval(timer) });
  tick();
  return item;
}
```

- [ ] **Step 4: Rewrite `extension.ts`**

```typescript
// Extension/src/extension.ts
import * as vscode from 'vscode';
import { ensureAgent, agentGet, agentPost } from './agent-client.js';
import { createStatusBar } from './status-bar.js';
import { currentWorkspacePath } from './workspace.js';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  await ensureAgent(context);
  createStatusBar(context);

  context.subscriptions.push(vscode.commands.registerCommand('worktrace.showProviders', async () => {
    const data = await agentGet<{ providers: Array<{ id: string; displayName: string }> }>('/providers');
    const pick = await vscode.window.showQuickPick(
      data.providers.map(p => ({ label: p.displayName, description: p.id, id: p.id })),
      { placeHolder: 'Pick a provider to view usage' },
    );
    if (!pick) return;
    const detail = await agentGet<unknown>(`/providers/${encodeURIComponent(pick.id)}`);
    const doc = await vscode.workspace.openTextDocument({
      content: JSON.stringify(detail, null, 2),
      language: 'json',
    });
    await vscode.window.showTextDocument(doc);
  }));

  context.subscriptions.push(vscode.commands.registerCommand('worktrace.watchRepo', async () => {
    const ws = currentWorkspacePath();
    if (!ws) return vscode.window.showWarningMessage('no workspace open');
    await agentPost('/watch', { path: ws });
    vscode.window.showInformationMessage(`worktrace watching ${ws}`);
  }));

  context.subscriptions.push(vscode.commands.registerCommand('worktrace.unwatchRepo', async () => {
    const ws = currentWorkspacePath();
    if (!ws) return vscode.window.showWarningMessage('no workspace open');
    await agentPost('/watch/stop', { path: ws });
    vscode.window.showInformationMessage(`worktrace stopped watching ${ws}`);
  }));

  context.subscriptions.push(vscode.commands.registerCommand('worktrace.showPace', async () => {
    const data = await agentGet<unknown>('/pace');
    const doc = await vscode.workspace.openTextDocument({
      content: JSON.stringify(data, null, 2), language: 'json',
    });
    await vscode.window.showTextDocument(doc);
  }));

  context.subscriptions.push(vscode.commands.registerCommand('worktrace.showReport', async () => {
    const [providers, repos, files] = await Promise.all([
      agentGet('/providers'),
      agentGet('/repos'),
      agentGet('/files?limit=20'),
    ]);
    const doc = await vscode.workspace.openTextDocument({
      content: JSON.stringify({ providers, repos, files }, null, 2),
      language: 'json',
    });
    await vscode.window.showTextDocument(doc);
  }));

  context.subscriptions.push(vscode.commands.registerCommand('worktrace.refreshAll', async () => {
    await agentGet('/usage?refresh=1');
    vscode.window.showInformationMessage('worktrace refreshed all providers');
  }));
}

export function deactivate(): void { /* agent keeps running */ }
```

- [ ] **Step 5: Update `Extension/package.json`**

Remove the old 9 `worktrace.*` commands; replace with the six listed
above. Keep `worktrace.agentPath` config. Add no new config keys.

```json
// Extension/package.json — "contributes.commands":
[
  { "command": "worktrace.showProviders", "title": "Worktrace: Show Providers" },
  { "command": "worktrace.watchRepo",     "title": "Worktrace: Watch This Workspace" },
  { "command": "worktrace.unwatchRepo",   "title": "Worktrace: Stop Watching" },
  { "command": "worktrace.showPace",      "title": "Worktrace: Show Pace" },
  { "command": "worktrace.showReport",    "title": "Worktrace: Open Report" },
  { "command": "worktrace.refreshAll",    "title": "Worktrace: Refresh All Providers" }
]
```

- [ ] **Step 6: Build + launch Extension Development Host**

```bash
cd Extension && npm install && npm run compile
# Then in VS Code/Cursor: open Extension/, press F5
```
Expected: status bar shows a provider cycling every 10s; the six commands
are discoverable via ⌘⇧P and each opens a JSON viewer or fires an agent
POST.

- [ ] **Step 7: Commit**

```bash
git add Extension/src/ Extension/package.json
git commit -m "feat(extension): v0.1 status bar + 6 commands

Strips session/auth/safety/card UI. New status bar cycles live providers
every 10s with color-coded pace status. Commands: showProviders (quick
pick + JSON viewer), watchRepo/unwatchRepo, showPace, showReport,
refreshAll. All UI delegates to the agent daemon via fetch."
```

### Task 4.8: Documentation — README + user guide + AGENTS.md

**Files:**
- Modify: `README.md` (top-level)
- Modify: `CLAUDE.md` (top-level — refresh for v0.1 scope)
- Create: `USAGE.md` (end-user guide with screenshots)
- Create: `AGENTS.md` (top-level — repo structure for AI coding assistants)

- [ ] **Step 1: Rewrite top-level `README.md`**

Sections: "What is Worktrace Report", "Install (brew/npm tap)", "Quick
tour" (walkthrough of `watch` → `providers` → `pace` → `report`), "How
attribution works" (one paragraph pointing at the spec), "Configuration"
(the five relevant env vars), "Limitations / known issues", "License".
Reference spec + plan docs at the bottom.

- [ ] **Step 2: Refresh `CLAUDE.md`**

Replace the current "OS for AI-assisted dev" framing with v0.1 scope.
Keep the Dual-Graph Context Policy and Context Store sections untouched
(those are infrastructure, orthogonal to v0.1). Update the "Architecture"
section to reflect the kill list (Backend/Dashboard/Landing gone) and
the new `CLI/packages/agent/src/report/`, `providers/`, and `routes/`
directory layout.

- [ ] **Step 3: Write `docs/USAGE.md`**

End-user guide with working commands and (optionally) ASCII-art examples
of the progress bars. Cover the 14 commands from the spec section 3.3
(watch, unwatch, repos, worktrees, providers, providers <id>, features,
files, pace, report, usage, version, status, doctor). Each command gets
a one-paragraph what/why + one example.

- [ ] **Step 4: Write `AGENTS.md` (top-level)**

Follows the AI-assistant convention: project summary, where code lives,
how to run tests, commit message conventions, and (most importantly)
links to `docs/superpowers/specs/2026-04-15-worktrace-report-design.md`
and this plan. Keep under 200 lines.

- [ ] **Step 5: Update `CLI/README.md`**

Monorepo quickstart: `npm install`, `npm run build --workspaces`,
`npm test --workspaces`, plus a short section on running the agent
standalone for dev.

- [ ] **Step 6: Commit**

```bash
git add README.md CLAUDE.md docs/USAGE.md AGENTS.md CLI/README.md
git commit -m "docs: v0.1 Worktrace Report — README, USAGE, AGENTS, CLAUDE

Refresh top-level docs for the v0.1 scope. README frames the product as
'per-repo AI spend visibility'; USAGE walks through the 14 CLI commands;
AGENTS points AI assistants at the spec + plan; CLAUDE updated with the
new report/ providers/ routes/ layout."
```

### Task 4.9: 7-day burn-in kickoff + release checklist

**Files:**
- Create: `docs/superpowers/release/v0.1-burn-in.md`

Final gate before shipping v0.1. This task runs the daemon for seven
calendar days under everyday usage and records issues. Criteria:

1. **Stability** — no agent process crashes; PID file cleaned up on
   shutdown; `/health` responsive for the entire 7-day window
2. **Attribution accuracy** — for providers with a monthly quota,
   `reconciliation_log` shows drift ≤ 2% at the 7-day mark
3. **Performance** — DB file < 50 MB after 7 days of typical usage;
   p95 `/providers` response time < 500ms
4. **UX** — status bar never goes red-on-offline for more than 30s during
   normal agent lifecycle; `pace` command colors flip as expected when
   nearing quota
5. **Release checklist** — passed items below

- [ ] **Step 1: Create tracking doc**

```markdown
<!-- docs/superpowers/release/v0.1-burn-in.md -->
# v0.1 Burn-In Log

**Start:** YYYY-MM-DD (fill at kickoff)
**Target ship date:** Start + 7 days

## Daily checks
- [ ] Day 1: daemon healthy, providers live, status bar cycling
- [ ] Day 2: no crashes in logs; DB size < 10 MB
- [ ] Day 3: pace command reflects real quota usage; reconciliation_log clean
- [ ] Day 4: ...
- [ ] Day 5: ...
- [ ] Day 6: ...
- [ ] Day 7: final review

## Issues encountered
| Day | Severity | Summary | Fix commit |
|-----|----------|---------|------------|
|     |          |         |            |

## Performance snapshot (Day 7)
- DB size: ___ MB
- /providers p95 latency: ___ ms
- Active file-change events in final 24h: ___
- Attribution rows in final 24h: ___
- Reconciliation drift per provider: claude=_%, cursor=_%, codex=_%, copilot=_%, gemini=_%, augment=_%, kiro=_%

## Ship/Hold decision
- [ ] All criteria met → tag v0.1.0 and cut release
- [ ] One or more failures → document, fix, extend burn-in by N days
```

- [ ] **Step 2: Release checklist (blocker-level; all must be green)**

- [ ] `npm run build --workspaces` clean with no warnings
- [ ] `npx vitest run --coverage` ≥ 80% coverage on `report/` and `providers/_shared/`
- [ ] `npx eslint . --max-warnings=0` clean
- [ ] `npx tsc --noEmit` clean in both workspaces
- [ ] Zero occurrences of `: any` or `as any` in production files (exclude tests)
- [ ] `worktrace providers`, `pace`, `repos`, `files`, `report` all produce renderable output on an empty DB (no crashes)
- [ ] Extension's `F5` dev-host launches cleanly on a fresh checkout
- [ ] `.vsix` package builds via `vsce package`
- [ ] CLI binary publishes via `npm publish --dry-run` (package metadata OK)
- [ ] Homebrew tap formula builds locally (`brew install --build-from-source worktrace/tap/worktrace`)
- [ ] Docs: README, USAGE, AGENTS, CLAUDE, plan + spec all up-to-date and cross-linked
- [ ] Git tag prepared: `v0.1.0`
- [ ] Release notes drafted covering: pivot rationale, 4 hero providers, 3 stretch providers, 12 descriptor-only stubs, known limitations

- [ ] **Step 3: Kickoff the burn-in**

```bash
# Start daemon as a long-running user-level service (macOS example):
cd CLI && npm run build --workspaces
nohup node packages/agent/dist/server.js > ~/.worktrace/agent.log 2>&1 &
echo $! > ~/.worktrace/agent.pid
# Fill docs/superpowers/release/v0.1-burn-in.md Start date.
# Commit the burn-in doc so daily updates are tracked in git:
git add docs/superpowers/release/v0.1-burn-in.md
git commit -m "docs(release): kick off v0.1 seven-day burn-in

Daemon started as long-running background process; tracking daily checks,
issues, and performance snapshots. Ship/hold decision at Day 7."
```

- [ ] **Step 4: Daily update cadence (for the next 7 days)**

Each day: run `worktrace pace` + `worktrace report --period week`, spot-check
`reconciliation_log`, update the tracking doc, commit:

```bash
git add docs/superpowers/release/v0.1-burn-in.md
git commit -m "docs(release): burn-in day N update"
```

- [ ] **Step 5: Day 7 ship/hold decision**

If checklist green and no criterion failed: tag `v0.1.0`, push tag, and
publish CLI + Extension:

```bash
git tag -a v0.1.0 -m "Worktrace Report v0.1.0"
git push origin v0.1.0
cd CLI && npm publish --workspaces --access public
cd ../Extension && vsce publish
```

If anything failed: document, fix, and run a 3-day supplemental burn-in
before re-attempting the release.

---

**Phase 4 exit criteria:**
- All renderer, pace, and parser tests green
- CLI commands render usable output for every command across all 7 live
  providers and 9 coming-soon stubs
- Extension `F5` host loads the status bar and all 6 commands work
- All release-checklist items ticked
- Burn-in tracking doc committed

---

## Final Self-Review

Before declaring the plan complete, a writing-plans skill self-review was
performed:

1. **Spec coverage check** — every section of
   `docs/superpowers/specs/2026-04-15-worktrace-report-design.md` maps
   to at least one task:
   - §2 Product Identity → Task 4.8 (docs reframe)
   - §3.1 Kill list → Tasks 0.1–0.6
   - §3.2 Survives list → Task 0.6 (extracted constants) + 1.4 (moved git/file-utils)
   - §3.3 CLI layout → Tasks 0.5 + 1.14 + 4.5 + 4.7
   - §3.4 Agent layout → Tasks 0.3 + 1.5–1.9 + 2.x + 3.x
   - §3.5 Schema → Tasks 1.6 (v1) + 3.4 (v2) + 3.5 (v3)
   - §3.6 14 CLI commands → covered across 1.14, 4.5, 4.7
   - §4 Product surfaces → Tasks 4.1–4.5 + 4.7
   - §5 Provider architecture → Tasks 1.10 + 1.11 + 2.1–2.11 + 4.6
   - §6 Attribution engine → Phase 3 in full
   - §7 Error handling → Distributed across 1.3 (pipeline), 2.11 (routes), 3.4–3.5 (reconciliation warnings)
   - §8 Testing strategy → Test Runner Setup + per-task TDD rhythm
   - §9 Exit criteria → mapped to each phase's exit-criteria block
   - §10 File migration map → Phase 0 demolition
   - §11 Implementation phases → match these four phases
   - §12 Non-goals → respected (no MCP server, no resume generator, no team dashboard)

2. **Placeholder scan** — no occurrences of "TBD", "TODO",
   "implement later", "similar to X", or "fill in details" remain in
   task bodies. Commit messages are specific.

3. **Type consistency check** — `ProviderId`, `ProviderDescriptor`,
   `ProviderFetchPlan`, `UsageSnapshot`, `QuotaBar`, `ExtraUsageBar`,
   `HostAPIs`, `FetchContext`, `PaceResult`, `WindowRow`, `WindowShare`
   are defined in Phase 1 and used consistently thereafter. Schema
   migrations v1/v2/v3 are applied in monotonic order. The
   `hasLivePlan` / `getProvider` / `listProviders` registry API is
   introduced in Task 1.11 and used unchanged in 2.11, 3.4, 3.5, 4.5.

---

## Execution Handoff

Plan complete and saved to
`docs/superpowers/plans/2026-04-15-worktrace-report.md`. Two execution
options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per
   task, review between tasks, fast iteration. Best for keeping the main
   context clean across 40+ tasks.

2. **Inline Execution** — Execute tasks in this session using
   `superpowers:executing-plans`, batch execution with checkpoints.
   Best if you want to see every change live.

Which approach would you like?
