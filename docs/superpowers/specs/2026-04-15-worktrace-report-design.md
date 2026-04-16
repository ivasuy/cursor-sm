# Worktrace Report — Design Spec

**Date:** 2026-04-15
**Status:** Approved (brainstorm complete, pending implementation plan)

## 1. Problem

A developer running multiple AI coding tools (Claude Code, Cursor, Codex CLI, Copilot) across multiple repos and worktrees has no unified view of:

- How much each provider costs per repo, per worktree, per feature (branch)
- Whether weekly quota pace is healthy or burning too fast
- Which files were touched by which provider
- Total input/output token breakdown attributed to specific work

CodexBar solves the provider-level quota view. Worktrace's unique moat is the persistent daemon with file watcher + multi-repo awareness — it can attribute AI spend to specific repos, worktrees, branches, and files.

## 2. Product Identity

**Worktrace Report** — per-repo, per-worktree, per-feature AI spend breakdown with provider quota tracking, progress bars, pace calculations, and file change tracking.

**v0.1 scope:** Pure deterministic math. No Vertex AI, no MCP server, no cloud sync, no AI narratives. Local daemon + CLI + VS Code extension.

## 3. Architecture

### 3.1 Kill List — What Gets Deleted

| Path | Reason |
|------|--------|
| `Backend/` (entire directory) | Firebase, Vertex AI, cloud auth — out of v0.1 scope |
| `Dashboard/` (entire directory) | Web dashboard deferred to v0.2+ |
| `Landing/` (entire directory) | Marketing site not needed |
| `CLI/packages/agent/src/core/analysis.ts` | Session analysis — replaced by attribution engine |
| `CLI/packages/agent/src/core/continuity.ts` | Cross-session context — out of scope |
| `CLI/packages/agent/src/core/delta-builder.ts` | Diff-based session deltas — replaced by file_changes table |
| `CLI/packages/agent/src/core/memory.ts` | Cross-session memory — out of scope |
| `CLI/packages/agent/src/core/renderer.ts` | Markdown summary renderer — replaced by CLI/extension renderers |
| `CLI/packages/agent/src/core/safety-monitor.ts` | Safety scanning — out of scope |
| `CLI/packages/agent/src/core/session-store.ts` | JSON session store — replaced by SQLite |
| `CLI/packages/agent/src/routes/` (session, safety, auth, card, context, history) | All replaced by new report routes |
| `CLI/packages/agent/src/auth.ts` | Firebase auth — removed |
| `CLI/packages/agent/src/session-state.ts` | In-memory session state — replaced by SQLite |
| `CLI/packages/agent/src/usage/adapters/*.ts` (all 17 flat files) | Rewritten as per-provider folders |
| `CLI/packages/agent/src/usage/manager.ts` | Replaced by new provider registry + fetch pipeline |
| `CLI/packages/agent/src/usage/cache.ts` | Replaced by `_shared/cache.ts` with SQLite backing |
| `CLI/packages/agent/src/usage/platform/` | Merged into `_host/` |

**~60% of current code deleted.**

### 3.2 What Survives (Modified)

| Path | Keeps | Changes |
|------|-------|---------|
| `CLI/packages/agent/src/daemon.ts` | Process lifecycle, port 9315, detached spawn | Remove session/safety/auth route mounting |
| `CLI/packages/agent/src/server.ts` | Express setup, health route | Swap route registrations to new report routes |
| `CLI/packages/agent/src/watcher.ts` | Chokidar file watching | Write events to `file_changes` table instead of session delta |
| `CLI/packages/agent/src/core/git.ts` | `currentBranch()`, `repoRoot()`, `isGitRepo()` | Add `listWorktrees()`, move to `src/report/git.ts` |
| `CLI/packages/agent/src/core/file-utils.ts` | `classifyFile()`, path utilities | Move to `src/report/file-utils.ts` |
| `CLI/packages/agent/src/core/constants.ts` | Intervals, port | Update values |
| `CLI/packages/agent/src/core/types.ts` | Base type definitions | Rewrite for new domain |
| `CLI/packages/agent/src/usage/types.ts` | `ProviderId` enum, basic types | Extend with descriptor/strategy types |
| `Extension/src/` (all 4 files) | VS Code extension shell | Swap commands from session to report |

### 3.3 New Directory Layout

```
CLI/packages/agent/src/
  daemon.ts                    (modified)
  server.ts                    (modified)
  watcher.ts                   (modified)

  providers/
    _shared/
      descriptor.ts            — ProviderDescriptor interface + type guards
      fetch-strategy.ts        — ProviderFetchStrategy interface
      fetch-pipeline.ts        — runPipeline() with timeout + fallback
      registry.ts              — loadAll(), getById(), getInstalled()
      usage-snapshot.ts        — UsageSnapshot, QuotaBar types
      cache.ts                 — SQLite-backed provider cache
      constants.ts             — shared timeouts, intervals
      types.ts                 — FetchContext, FetchKind, FetchOutcome

    _host/
      keychain.ts              — macOS Keychain / credential-store reads
      browser-cookies.ts       — cookie extraction (Chrome/Arc/Edge)
      pty.ts                   — spawn CLI + parse stdout
      http.ts                  — HTTP client with retry + timeout
      token-cost.ts            — model → $/1K token lookup tables
      status.ts                — provider health/availability checks
      process-sampler.ts       — detect running AI tool processes
      playwright.ts            — browser automation for cookie-auth providers
      logger.ts                — structured logging

    claude/
      descriptor.ts            — Claude descriptor (metadata, branding, capabilities, fetchPlan)
      strategies.ts            — cli-pty (claude usage), apikey-http, cookies-http
      parser.ts                — parse Claude CLI output + API responses
      models.ts                — Claude model cost table

    cursor/
      descriptor.ts
      strategies.ts            — cookies-http (Settings page), local-config-scan
      parser.ts

    codex/
      descriptor.ts
      strategies.ts            — cli-pty (codex usage), local-config-scan
      parser.ts
      models.ts

    copilot/
      descriptor.ts
      strategies.ts            — oauth-http (GitHub API), local-config-scan
      parser.ts

    gemini/
      descriptor.ts
      strategies.ts            — apikey-http (AI Studio), cookies-http

    augment/
      descriptor.ts
      strategies.ts

    kiro/
      descriptor.ts
      strategies.ts

    amp/          (stub)
    antigravity/  (stub)
    droid/        (stub)
    jetbrains/    (stub)
    kimi/         (stub)
    kimi-k2/      (stub)
    openrouter/   (stub)
    vertex/       (stub)
    zai/          (stub)

  report/
    db.ts                      — SQLite connection, WAL mode, migrations
    repo-registry.ts           — add/remove/list repos
    worktree-scanner.ts        — detect worktrees per repo via `git worktree list`
    activity-writer.ts         — write activity windows from file events
    sample-writer.ts           — write provider samples from fetch pipeline
    attribution-writer.ts      — time-window correlation: samples → (repo, worktree, branch)
    report-service.ts          — query layer for CLI/extension (aggregations, pace, runway)
    file-utils.ts              — (moved from core/)
    git.ts                     — (extended from core/)

  routes/
    repos.ts                   — GET /repos, GET /repos/:id
    worktrees.ts               — GET /repos/:id/worktrees, GET /worktrees/:id
    providers.ts               — GET /providers, GET /providers/:id
    features.ts                — GET /features, GET /features/:branch
    files.ts                   — GET /files
    pace.ts                    — GET /pace
    watch.ts                   — POST /watch, DELETE /watch
    usage.ts                   — GET /usage (provider-level)
    report.ts                  — GET /report (full roll-up)
```

### 3.4 SQLite Schema

```sql
-- WAL mode for concurrent daemon + CLI reads
PRAGMA journal_mode = WAL;

CREATE TABLE repos (
  id          INTEGER PRIMARY KEY,
  path        TEXT UNIQUE NOT NULL,
  name        TEXT NOT NULL,
  added_at    INTEGER NOT NULL  -- unix epoch ms
);

CREATE TABLE worktrees (
  id          INTEGER PRIMARY KEY,
  repo_id     INTEGER NOT NULL,
  path        TEXT UNIQUE NOT NULL,
  is_primary  INTEGER NOT NULL DEFAULT 1,
  detected_at INTEGER NOT NULL,
  FOREIGN KEY (repo_id) REFERENCES repos(id)
);

CREATE TABLE activity_windows (
  id               INTEGER PRIMARY KEY,
  window_start     INTEGER NOT NULL,
  window_end       INTEGER NOT NULL,
  worktree_id      INTEGER NOT NULL,
  branch           TEXT NOT NULL,
  file_event_count INTEGER NOT NULL,
  FOREIGN KEY (worktree_id) REFERENCES worktrees(id)
);

CREATE TABLE provider_samples (
  id                  INTEGER PRIMARY KEY,
  sampled_at          INTEGER NOT NULL,
  provider            TEXT NOT NULL,     -- ProviderId
  weekly_cap          INTEGER,           -- null if unlimited
  weekly_used         INTEGER NOT NULL,
  resets_at           INTEGER NOT NULL,
  input_tokens_cum    INTEGER,
  output_tokens_cum   INTEGER,
  cost_cum_usd        REAL,
  credits_remaining_usd REAL
);

CREATE TABLE attributions (
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

CREATE TABLE file_changes (
  id          INTEGER PRIMARY KEY,
  changed_at  INTEGER NOT NULL,
  worktree_id INTEGER NOT NULL,
  branch      TEXT NOT NULL,
  provider    TEXT,             -- null = human edit (no AI process detected)
  event_type  TEXT NOT NULL,    -- 'create' | 'modify' | 'delete'
  file_path   TEXT NOT NULL,
  FOREIGN KEY (worktree_id) REFERENCES worktrees(id)
);

CREATE INDEX idx_activity_worktree ON activity_windows(worktree_id, window_start);
CREATE INDEX idx_samples_provider ON provider_samples(provider, sampled_at);
CREATE INDEX idx_attributions_worktree ON attributions(worktree_id, branch);
CREATE INDEX idx_file_changes_worktree ON file_changes(worktree_id, branch);
```

## 4. Product Surfaces

### 4.1 CLI Commands (14 total)

Organized as list/detail pairs. Each command shows one depth — never dumps everything.

| Command | What It Shows |
|---------|---------------|
| `worktrace repos` | All tracked repos — name, path, worktree count, last activity |
| `worktrace repos <name>` | Single repo detail — worktrees, branches, total cost, top providers |
| `worktrace worktrees` | All worktrees across repos — branch, provider, file count |
| `worktrace worktrees <path>` | Single worktree — branch, per-provider cost, file breakdown |
| `worktrace providers` | All installed providers — quota bar, weekly used/cap, pace indicator |
| `worktrace providers <id>` | Single provider — session/weekly/secondary quotas, cost, credits, reset timer |
| `worktrace features` | All active features (branches) — repo, provider, cost, file count |
| `worktrace features <branch>` | Single feature — per-provider cost, file changes, duration |
| `worktrace files` | File changes summary — by repo, by provider, create/modify/delete counts |
| `worktrace files <path>` | Single file history — changes, attributed provider, timestamps |
| `worktrace pace` | Pace dashboard — all providers, expected vs actual %, runway ETA |
| `worktrace watch` | Start watching (register cwd as repo, begin tracking) |
| `worktrace usage` | Provider-level usage cards (backward compat with existing command) |
| `worktrace report` | Full roll-up — repos → worktrees → providers → cost → pace (paginated) |

**Global flags:** `--json`, `--refresh`, `--period <7d|30d|all>`

### 4.2 Progress Bars (CodexBar Style)

```
Claude Code    ████████████░░░░░░░░  234 / 500 req   46.8%  ↑ pace +2.1%
Cursor         ██████████████████░░  891 / 1000 req   89.1%  ⚠ pace +12.3%
Codex CLI      ████░░░░░░░░░░░░░░░░   45 / 200 req   22.5%  ✓ on track
Copilot        ██████████████████████ 5000 / 5000 req  100%   ✕ exhausted
```

Pace indicator thresholds:
- `✓ on track` — pace delta < +5%
- `↑ pace +N%` — pace delta +5% to +15% (warning)
- `⚠ pace +N%` — pace delta > +15% (critical)
- `✕ exhausted` — 100% used

### 4.3 Pace & Runway Calculations

```
expected_pct = elapsed_fraction_of_reset_period × 100
actual_pct = weekly_used / weekly_cap × 100
pace_delta = actual_pct - expected_pct

burn_rate = weekly_used / elapsed_time_hours
runway_hours = remaining / burn_rate
runway_eta = now + runway_hours
```

### 4.4 VS Code Extension Surface

**Status bar item:** `Worktrace: 3 repos · $4.21 today`

**Commands (worktrace.* namespace):**

| Command | Action |
|---------|--------|
| `worktrace.showDashboard` | Open report panel (webview with progress bars) |
| `worktrace.showProviders` | Quick pick → provider detail |
| `worktrace.showPace` | Notification with pace summary |
| `worktrace.watchRepo` | Register current workspace as tracked repo |
| `worktrace.unwatchRepo` | Stop tracking current workspace |
| `worktrace.refreshUsage` | Force-refresh all provider data |

### 4.5 Agent HTTP Routes

Daemon on `127.0.0.1:9315`:

| Route | Method | Purpose |
|-------|--------|---------|
| `/health` | GET | Health check |
| `/repos` | GET | List tracked repos |
| `/repos/:id` | GET | Repo detail |
| `/repos/:id/worktrees` | GET | Worktrees for repo |
| `/worktrees/:id` | GET | Worktree detail |
| `/providers` | GET | All installed providers with quota |
| `/providers/:id` | GET | Single provider detail |
| `/features` | GET | All active features |
| `/features/:branch` | GET | Feature detail |
| `/files` | GET | File changes summary |
| `/pace` | GET | Pace dashboard data |
| `/watch` | POST | Register repo for tracking |
| `/watch` | DELETE | Unregister repo |
| `/usage` | GET | Provider-level usage (compat) |
| `/report` | GET | Full roll-up |

## 5. Provider Architecture

### 5.1 Core Interfaces

```typescript
export type ProviderId =
  | 'claude' | 'cursor' | 'codex' | 'copilot'
  | 'gemini' | 'augment' | 'kiro'
  | 'amp' | 'antigravity' | 'droid' | 'jetbrains'
  | 'kimi' | 'kimi-k2' | 'openrouter' | 'vertex' | 'zai';

export type FetchKind =
  | 'cli-rpc' | 'cli-pty' | 'oauth-http' | 'apikey-http'
  | 'cookies-http' | 'playwright-scrape' | 'local-log-scan'
  | 'local-config-scan' | 'keychain' | 'lsp-probe';

export interface ProviderDescriptor {
  id: ProviderId;
  metadata: ProviderMetadata;
  branding: ProviderBranding;
  capabilities: ProviderCapabilities;
  fetchPlan: ProviderFetchPlan;
  cli: ProviderCLIConfig;
}

export interface ProviderMetadata {
  displayName: string;
  vendor: string;
  category: 'ide' | 'cli' | 'api' | 'cloud';
  website: string;
}

export interface ProviderBranding {
  icon: string;        // terminal emoji or nerd-font glyph
  accentColor: string; // hex for extension webview
}

export interface ProviderCapabilities {
  quotaBar: boolean;
  tokenBreakdown: boolean;
  costTracking: boolean;
  creditsBalance: boolean;
  sessionUsage: boolean;
  modelSelection: boolean;
}

export interface ProviderFetchPlan {
  pipeline: StrategyPipeline;
  sampleIntervalMs: number;
  cacheMaxAgeMs: number;
}

export interface StrategyPipeline {
  resolveStrategies(ctx: FetchContext): ProviderFetchStrategy[];
}

export interface ProviderFetchStrategy {
  readonly id: string;
  readonly kind: FetchKind;
  isAvailable(ctx: FetchContext): Promise<boolean>;
  fetch(ctx: FetchContext): Promise<UsageSnapshot>;
  shouldFallback(err: Error, ctx: FetchContext): boolean;
}

export interface FetchContext {
  timeout: number;
  cacheTTL: number;
  logger: Logger;
  hosts: HostAPIs;
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
  cost?: { today: number; last30d: number; totalTokens: number };
  updatedAt: Date;
  identity?: ProviderIdentity;
}

export interface QuotaBar {
  used: number;
  cap: number;
  unit: 'requests' | 'tokens' | 'credits' | 'minutes';
  resetsAt: Date;
}

export interface ExtraUsageBar {
  label: string;          // e.g. "Fast requests", "Premium credits"
  used: number;
  cap: number;
  unit: string;
}

export interface ProviderIdentity {
  email?: string;
  username?: string;
  plan?: string;          // e.g. "Pro", "Free", "Enterprise"
}

export interface ProviderCLIConfig {
  listLabel: string;      // e.g. "Claude Code" for `worktrace providers`
  detailSections: string[]; // which sections to show in detail view
}
```

### 5.2 Fetch Pipeline

```typescript
export async function runPipeline(
  descriptor: ProviderDescriptor,
  ctx: FetchContext
): Promise<ProviderFetchOutcome> {
  const attempts: FetchAttempt[] = [];

  for (const strategy of descriptor.fetchPlan.pipeline.resolveStrategies(ctx)) {
    if (!(await strategy.isAvailable(ctx))) {
      attempts.push({ id: strategy.id, status: 'unavailable' });
      continue;
    }
    try {
      const snapshot = await withTimeout(
        strategy.fetch(ctx),
        ctx.timeout
      );
      attempts.push({ id: strategy.id, status: 'ok' });
      return { snapshot, attempts, sourceLabel: strategy.kind };
    } catch (err) {
      attempts.push({ id: strategy.id, status: 'error', error: err as Error });
      if (!strategy.shouldFallback(err as Error, ctx)) throw err;
    }
  }
  throw new AllStrategiesFailedError(descriptor.id, attempts);
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new TimeoutError(ms)), ms)
    ),
  ]);
}
```

### 5.3 Host APIs

| Host API | Purpose |
|----------|---------|
| `keychain.ts` | Read credentials from macOS Keychain / Linux secret-service |
| `browser-cookies.ts` | Extract session cookies from Chrome, Arc, Edge (SQLite cookie DBs) |
| `pty.ts` | Spawn CLI process, capture stdout, parse structured output |
| `http.ts` | HTTP client with retry (exponential backoff), timeout, auth header injection |
| `token-cost.ts` | Model → cost-per-1K-token lookup tables (updated per provider) |
| `status.ts` | Provider health checks (is the service reachable?) |
| `process-sampler.ts` | Detect running AI tool processes via `ps aux` pattern matching |
| `playwright.ts` | Browser automation for providers requiring cookie-authenticated web scraping |
| `logger.ts` | Structured logging with provider context |

### 5.4 Provider Implementation Matrix

| Provider | Tier | v0.1 Status | Primary Strategy | Fallback | Auth |
|----------|------|-------------|-----------------|----------|------|
| Claude | Hero | Full | cli-pty (`claude usage`) | apikey-http, cookies-http | CLI session / API key |
| Cursor | Hero | Full | cookies-http (Settings page) | local-config-scan | Browser cookies |
| Codex | Hero | Full | cli-pty (`codex usage`) | local-config-scan | CLI session |
| Copilot | Hero | Full | oauth-http (GitHub API) | local-config-scan | GitHub OAuth token |
| Gemini | Stretch | Partial | apikey-http (AI Studio) | cookies-http | API key |
| Augment | Stretch | Partial | cookies-http | — | Browser cookies |
| Kiro | Stretch | Partial | local-config-scan | — | Local config |
| Amp | Stub | Descriptor only | — | — | — |
| Antigravity | Stub | Descriptor only | — | — | — |
| Droid | Stub | Descriptor only | — | — | — |
| JetBrains | Stub | Descriptor only | — | — | — |
| Kimi | Stub | Descriptor only | — | — | — |
| Kimi K2 | Stub | Descriptor only | — | — | — |
| OpenRouter | Stub | Descriptor only | — | — | — |
| Vertex | Stub | Descriptor only | — | — | — |
| Zai | Stub | Descriptor only | — | — | — |

### 5.5 Process Sampler

Detects running AI tool processes to attribute file changes to providers.

```
Process patterns:
  claude     → /claude|claude-code/
  cursor     → /cursor|Cursor Helper/
  codex      → /codex/
  copilot    → /copilot-agent|copilot-language-server/
  gemini     → /gemini/
```

**Multi-process resolution order** (when multiple AI tools running simultaneously):
1. Most recent process start time
2. Process cwd matches the worktree path
3. First match by pattern order
4. If still ambiguous: proportional split by token delta since last sample

**Human edits** (file events with no detected AI process): tagged `provider: null` in `file_changes` table. Counted in file stats but not attributed AI cost.

## 6. Attribution Engine

### 6.1 Time-Window Correlation

The attribution engine runs on each provider sample cycle (default: every 60 seconds).

```
For each new provider_sample S:
  1. Compute delta: Δtokens = S.tokens_cum - prev_sample.tokens_cum
  2. If Δtokens == 0 → skip (no new usage)
  3. Find activity_windows overlapping [prev_sample.sampled_at, S.sampled_at]
  4. For each overlapping window W:
     - weight = W.file_event_count / total_file_events_in_period
     - attributed_tokens = Δtokens × weight
     - attributed_cost = Δcost × weight
  5. Write attribution rows with source_sample_id = S.id
```

### 6.2 Reconciliation

Daily reconciliation job (runs at midnight local time):
- Sum attributed tokens per provider for the day
- Compare against provider sample deltas for the same period
- If drift > 2%: log warning, rebalance proportionally
- Invariant: `SUM(attributions.tokens) == SUM(provider_sample deltas)` per day per provider (within 2% tolerance)

## 7. Error Handling

### 7.1 Fetch Failures

- Every strategy call is timeout-bounded (default: 10s per strategy, 30s total per provider)
- On failure: log attempt, try next strategy in pipeline
- On all-strategies-failed: return stale cache if available (< 5 min old), otherwise surface error in CLI/extension
- Never block the daemon's main loop on a provider fetch

### 7.2 SQLite Resilience

- WAL mode for concurrent reads from CLI while daemon writes
- `busy_timeout = 5000ms` to handle brief write contention
- Schema migrations via version table — daemon checks on startup

### 7.3 Process Sampler Edge Cases

- Process exits between samples → use last-known process for the window
- Multiple AI processes in same worktree → proportional split (see 5.5)
- No process detected → `provider: null` (human edit)

## 8. Testing Strategy

### 8.1 Unit Tests

| Target | What to Test |
|--------|-------------|
| Provider parsers | Parse real CLI output / API responses → UsageSnapshot |
| Pace calculator | Expected vs actual % at various elapsed fractions |
| Attribution engine | Token deltas distributed correctly across worktrees |
| Process sampler | Pattern matching against `ps` output fixtures |
| Report service | Aggregation queries return correct rollups |

### 8.2 Integration Tests

| Target | What to Test |
|--------|-------------|
| Fetch pipeline | Strategy fallback chain with mock failures |
| SQLite operations | Concurrent read/write under WAL mode |
| CLI commands | End-to-end command → route → DB → formatted output |

### 8.3 Snapshot / Golden File Tests

- Provider parser outputs compared against golden JSON files
- CLI render outputs compared against golden terminal strings
- Ensures formatting doesn't regress

## 9. Exit Criteria (v0.1 Ship Gate)

| Criterion | Threshold |
|-----------|-----------|
| Provider accuracy | < 2% drift vs provider's own dashboard for hero providers |
| Fetch success rate | ≥ 95% of scheduled samples succeed (across all hero providers) |
| Attribution coverage | ≥ 90% of file events attributed to a provider |
| CLI render speed | < 200ms for any single command |
| Burn-in | 7 consecutive days of daily use without data loss or crash |
| Hero providers | All 4 (Claude, Cursor, Codex, Copilot) fully functional |

## 10. File Migration Map

### Deleted

```
Backend/                          → deleted
Dashboard/                        → deleted
Landing/                          → deleted
CLI/packages/agent/src/auth.ts    → deleted
CLI/packages/agent/src/session-state.ts → deleted
CLI/packages/agent/src/core/analysis.ts → deleted
CLI/packages/agent/src/core/continuity.ts → deleted
CLI/packages/agent/src/core/delta-builder.ts → deleted
CLI/packages/agent/src/core/memory.ts → deleted
CLI/packages/agent/src/core/renderer.ts → deleted
CLI/packages/agent/src/core/safety-monitor.ts → deleted
CLI/packages/agent/src/core/session-store.ts → deleted
CLI/packages/agent/src/routes/*   → deleted (all current routes)
CLI/packages/agent/src/usage/adapters/* → deleted (all 17 flat files)
CLI/packages/agent/src/usage/manager.ts → deleted
CLI/packages/agent/src/usage/cache.ts → deleted
CLI/packages/agent/src/usage/platform/ → deleted
```

### Moved / Evolved

```
CLI/packages/agent/src/core/git.ts        → CLI/packages/agent/src/report/git.ts (extended)
CLI/packages/agent/src/core/file-utils.ts → CLI/packages/agent/src/report/file-utils.ts
CLI/packages/agent/src/core/constants.ts  → CLI/packages/agent/src/report/constants.ts (merged)
CLI/packages/agent/src/core/types.ts      → CLI/packages/agent/src/providers/_shared/types.ts (rewritten)
CLI/packages/agent/src/usage/types.ts     → CLI/packages/agent/src/providers/_shared/types.ts (merged)
```

### New

```
CLI/packages/agent/src/providers/_shared/   (8 files — descriptor, strategy, pipeline, registry, snapshot, cache, constants, types)
CLI/packages/agent/src/providers/_host/     (9 files — keychain, browser-cookies, pty, http, token-cost, status, process-sampler, playwright, logger)
CLI/packages/agent/src/providers/claude/    (4 files — descriptor, strategies, parser, models)
CLI/packages/agent/src/providers/cursor/    (3 files — descriptor, strategies, parser)
CLI/packages/agent/src/providers/codex/     (4 files — descriptor, strategies, parser, models)
CLI/packages/agent/src/providers/copilot/   (3 files — descriptor, strategies, parser)
CLI/packages/agent/src/providers/gemini/    (2 files — descriptor, strategies)
CLI/packages/agent/src/providers/augment/   (2 files — descriptor, strategies)
CLI/packages/agent/src/providers/kiro/      (2 files — descriptor, strategies)
CLI/packages/agent/src/providers/{9 stubs}/ (1 file each — descriptor)
CLI/packages/agent/src/report/              (9 files — db, repo-registry, worktree-scanner, activity-writer, sample-writer, attribution-writer, report-service, file-utils, git)
CLI/packages/agent/src/routes/              (9 files — repos, worktrees, providers, features, files, pace, watch, usage, report)
```

## 11. Implementation Phases

### Phase 1 — Skeleton (est. 2-3 days)

- Set up SQLite with schema + migrations
- Provider `_shared/` interfaces + `_host/` stubs
- Registry that loads descriptors
- Empty route handlers wired to Express
- `worktrace watch` registers a repo

### Phase 2 — Hero Providers (est. 4-5 days)

- Implement Claude, Cursor, Codex, Copilot fetch strategies
- Implement required host APIs (pty, http, browser-cookies, keychain)
- Fetch pipeline with fallback + cache
- `worktrace providers` and `worktrace providers <id>` working
- Provider parser unit tests + golden files

### Phase 3 — Attribution Engine (est. 3-4 days)

- Process sampler detecting running AI tools
- Activity window writer from chokidar events
- Sample writer storing provider snapshots
- Attribution writer correlating samples → worktrees
- Reconciliation job
- `worktrace repos`, `worktrace features`, `worktrace files` working

### Phase 4 — Presentation Polish (est. 2-3 days)

- Progress bars (CodexBar style) in CLI
- Pace calculator + runway ETA
- `worktrace pace`, `worktrace report` working
- Extension status bar + commands
- Stretch providers (Gemini, Augment, Kiro)
- 7-day burn-in begins

**Total estimated: 11-15 days**

## 12. Non-Goals (v0.1)

- No Vertex AI or any cloud AI service
- No MCP server exposure
- No cloud sync or team features
- No web dashboard
- No Firebase auth
- No session summaries or narratives
- No safety scanning
- No cross-session memory/continuity
- No Firestore or any remote database
