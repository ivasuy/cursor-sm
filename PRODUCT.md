# Worktrace — Full Product Design

## Core Identity

"The operating system for AI-assisted development" — not a summary tool, but an always-on layer that sits between you and your AI coding tools, providing memory, safety, usage intelligence, and proof of work.

## Product Architecture

Worktrace is a local-first system with three distinct layers:

- **Extension / editor client** — thin VS Code/Cursor UI client that delegates all business logic to the local agent; provides status bar, notifications, quick picks, and URI handler
- **Local Worktrace agent (`worktrace-agent`)** — cross-platform daemon on `localhost:9315` that owns session memory, deterministic analysis, safety monitoring, credential storage, provider usage collection, and all git/file access
- **Cloud backend** — optional layer for Google auth, AI summaries (Vertex AI), usage quotas, dashboard sync, and team/reporting features

The agent is the single source of truth. The extension, CLI, and future dashboard are all thin clients.

---

## What Is Shipped

Everything below is implemented and working in the repo today.

### Agent-First Architecture

- `worktrace-agent` runs as a local HTTP daemon on `127.0.0.1:9315`
- Owns: session lifecycle, file watching (chokidar), deterministic analysis, safety scanning, cross-session memory, context generation, credential storage, backend communication
- Auto-started by the extension on activation or by the CLI on first command
- Shared credential store at `~/.worktrace/credentials.json` (extension and CLI use the same tokens)

### Thin-Client Extension (`Extension/`)

- 4 source files: `extension.ts`, `agent-client.ts`, `types.ts`, `workspace.ts`
- Delegates all logic to agent via HTTP — zero business logic in the extension
- VS Code-native UI: status bar, notifications, quick picks, text document viewers
- URI handler for auth callbacks (`vscode://` / `cursor://` schemes)
- 9 registered commands: end session, add note, sign in, sign out, set display name, generate card, run safety check, show context, search history

### CLI (`CLI/packages/cli/`)

- 9 commands: `start`, `end`, `status`, `context`, `history`, `check`, `note`, `login`, `card`
- Auto-starts agent daemon if not running
- Worktrace-branded terminal UX with typing effects, spinners, gradient banners
- Unified colour system matching the brand palette

### Session Tracking and Memory

- Automatic file event capture via chokidar (creates, saves, deletes)
- Git diff and branch capture at session end
- Deterministic analysis: session mode, friction points, confidence, tomorrow checklist, untouched areas, primary focus files
- Cross-session memory in `.worktrace/sessions.json` — churn hotspot detection, recurring friction, recent branch awareness, open TODOs
- "Where I left off" prompt on startup from recent session history

### Continuity and Context

- `sessions/context.md` generated per workspace as a reusable prompt block
- Platform-agnostic format — paste into any AI tool, `CLAUDE.md`, or `.cursorrules`
- `worktrace context` CLI command dumps to stdout for piping

### Safety Monitoring

- Basic diff-based safety scan: secrets detection, unsafe patterns, flagged changes
- Non-blocking notifications in the extension
- `worktrace check` CLI command for terminal workflows

### Auth and Backend Integration

- Dual login flow: CLI uses local HTTP callback; extension uses URI scheme handler
- Both paths store credentials in the same agent-managed file
- Optional backend for: Google sign-in, AI session summaries (Vertex AI), AI project context, usage quotas, user profiles, shareable cards

### Proof of Work (Basic)

- Markdown session logs in `sessions/`
- Shareable image cards for signed-in users
- Streak tracking and per-day card data in Firestore

---

## What Is Partially Built

These features exist but are narrower than the full vision:

| Area | Current State | Full Vision |
| --- | --- | --- |
| Proof of work | Markdown logs, cards, streaks | Project timelines, exportable reports, daily/weekly digests |
| Cloud sync | Auth, usage limits, profile, saved session metadata | Full metadata sync, dashboard infrastructure |
| Safety monitoring | Basic scan + notification flow | Configurable `.worktrace/rules.yml`, dependency intelligence, scope-creep detection, architectural violation alerts |

---

## What Is Not Built Yet

### Prompt Enhancer

- Wraps user prompts with project-aware context before sending to AI
- Adds guardrails: "do not modify stable files", "follow existing patterns in X"
- Learns from session history what the user prioritises (testing, performance, security)
- Injects per-project context: stack, recent refactors, fragile files

### Web Dashboard

- Personal dev timeline — all projects, all sessions, searchable
- Project health view — stability map, churn hotspots, friction trends
- Provider usage timeline — per-project AI tooling costs and quota visibility
- Streak tracking, productivity trends (optional, non-gamified)
- Team view (future) — async standups, who's working on what, cross-dev patterns

### Team Features and Monetisation

- Exportable reports for clients/teams: hours, sessions, files, decisions, confidence scores
- Daily/weekly digest — auto-generated development log
- Billing, plan management, team seats

---

## Provider Usage Intelligence — Next Phase

This is the next major feature. The agent collects usage data from every AI coding tool the developer uses, normalises it into a single contract, and surfaces it in the CLI, extension, and future dashboard.

### Unified Usage Contract

Every provider adapter returns the same shape:

```typescript
interface ProviderUsage {
  provider: string;               // e.g. "claude", "cursor", "codex"
  plan: string | null;            // e.g. "pro", "free", "max"
  quotaUsed: number | null;       // requests/tokens/credits used
  quotaLimit: number | null;      // hard or soft limit
  quotaRemaining: number | null;  // computed or API-reported
  quotaUnit: string;              // "requests" | "tokens" | "credits" | "dollars"
  resetAt: string | null;         // ISO 8601 timestamp of next quota reset
  resetWindow: string | null;     // "daily" | "weekly" | "monthly" | "5h" | "billing-cycle"
  costUsd: number | null;         // dollar cost this period (API-billed providers)
  status: "ok" | "warning" | "exhausted" | "unknown";
  capabilities: string[];         // what this adapter can report on this OS
  lastFetched: string;            // ISO 8601 timestamp
  error: string | null;           // last fetch error, if any
}
```

### Provider Catalogue — 16 Adapters

Each adapter uses the highest-fidelity source available per platform, with fallbacks.

| # | Provider | Auth Method | What It Reports | macOS | Linux | Windows |
|---|----------|-------------|-----------------|-------|-------|---------|
| 1 | **Codex** | Local Codex CLI RPC + PTY fallback | Session usage, model, token counts; optional OpenAI web dashboard extras | CLI + browser | CLI only | CLI only |
| 2 | **Claude** | OAuth API or browser cookies + CLI PTY fallback | Session usage, weekly request count, plan tier, reset window | Full | CLI + API | CLI + API |
| 3 | **Cursor** | Browser session cookies | Plan tier, fast/slow request counts, usage limits, billing reset date | Full | Chromium paths | Chromium paths |
| 4 | **Gemini** | OAuth via Gemini CLI credentials (`~/.gemini/`) | Quota used/remaining, rate limits, model tier | Full | Full | Full |
| 5 | **Antigravity** | Local language server probe (experimental) | Active status, model info; no quota (unlimited during beta) | Probe | Probe | Probe |
| 6 | **Droid** | Browser cookies + WorkOS token flows | Factory usage, billing, plan tier, seat count | Full | Chromium paths | Chromium paths |
| 7 | **Copilot** | GitHub device flow + Copilot internal usage API | Completions count, chat usage, plan tier | Full | Full | Full |
| 8 | **z.ai** | API token from Keychain / credential store | Quota used/remaining, MCP window status | Keychain | libsecret | Credential Manager |
| 9 | **Kimi** | JWT from `kimi-auth` browser cookie | Weekly quota used/remaining, 5-hour rate limit status | Full | Chromium paths | Chromium paths |
| 10 | **Kimi K2** | API key (env var or config file) | Credit balance, usage totals | Full | Full | Full |
| 11 | **Kiro** | CLI-based (`kiro-cli /usage`) | Monthly credits used/remaining, bonus credits | CLI | CLI | CLI |
| 12 | **Vertex AI** | `gcloud` OAuth + local Claude log parsing | Token cost tracking from JSONL session logs, project-level spend | Full | Full | Full |
| 13 | **Augment** | Browser cookies + automatic session keepalive | Credits used/remaining, usage rate, plan tier | Full | Chromium paths | Chromium paths |
| 14 | **Amp** | Browser cookies | Amp Free usage count, plan status | Full | Chromium paths | Chromium paths |
| 15 | **JetBrains AI** | Local XML config from JetBrains IDE directory | Monthly credits used/remaining, model tier | XML read | XML read | XML read |
| 16 | **OpenRouter** | API token (env var or config file) | Credit balance, per-model usage, cost breakdown | Full | Full | Full |

**Platform key**: "Full" = all sources available. "CLI only" / "CLI + API" = no browser cookie access. "Chromium paths" = reads cookies from known Chromium profile paths. "Probe" = local process/socket detection. "XML read" = reads IDE config files. "Keychain" / "libsecret" / "Credential Manager" = OS-native secure store.

### Cross-Platform Strategy

The agent is the portability boundary. Platform-specific code lives in thin OS adapters, not in provider logic.

#### Source Priority (highest fidelity first)

1. **Provider CLI / RPC** — `codex`, `kiro-cli`, `gcloud`, `gemini` CLI credentials
2. **Provider API with explicit auth** — OAuth tokens, API keys, device flows
3. **Local config / log files** — JetBrains XML, Gemini credentials, Claude JSONL logs, env vars
4. **Browser session cookies** — Chromium profile reads for Cursor, Droid, Kimi, Augment, Amp
5. **PTY fallback** — spawn CLI in pseudo-terminal, parse stdout (last resort)

#### OS Adapters

| Concern | macOS | Linux | Windows |
|---------|-------|-------|---------|
| Secure credential storage | Keychain (`security` CLI) | `libsecret` / `secret-tool` | Windows Credential Manager (`wincred`) |
| Browser cookie read | SQLite from `~/Library/Application Support/{Chrome,Arc,Brave,Edge}/` | SQLite from `~/.config/{google-chrome,chromium,brave,microsoft-edge}/` | SQLite from `%LOCALAPPDATA%/{Google/Chrome,BraveSoftware,Microsoft/Edge}/` |
| Browser cookie decryption | Keychain `Chrome Safe Storage` | `libsecret` GNOME keyring / `kwallet` | DPAPI (`CryptUnprotectData`) |
| Process detection | `lsof` / `ps aux` | `/proc` / `ss` | `tasklist` / `netstat` |
| PTY execution | `node-pty` | `node-pty` | `node-pty` (ConPTY) |
| CLI path resolution | `which` / `$PATH` + known install paths | `which` / `$PATH` | `where` / `$PATH` + `%LOCALAPPDATA%` known paths |

#### Capability Flags

Every adapter reports what it can and cannot do on the current OS:

```typescript
interface AdapterCapabilities {
  canFetchQuota: boolean;
  canFetchCost: boolean;
  canFetchPlan: boolean;
  canFetchResetWindow: boolean;
  canRefreshAuth: boolean;
  requiresBrowser: boolean;      // true = needs cookie access
  requiresCli: boolean;          // true = needs provider CLI installed
  platformSupport: "full" | "partial" | "unsupported";
  missingDependencies: string[]; // e.g. ["chrome not found", "gcloud not installed"]
}
```

### Agent Routes for Usage

New routes added to the agent daemon (`localhost:9315`):

| Route | Purpose |
| --- | --- |
| `GET /usage` | Fetch cached usage for all enabled providers |
| `GET /usage/:provider` | Fetch usage for a single provider |
| `POST /usage/refresh` | Force re-fetch all providers (bypasses cache TTL) |
| `POST /usage/refresh/:provider` | Force re-fetch a single provider |
| `GET /usage/config` | List all adapters with their capabilities and enabled state |
| `PATCH /usage/config` | Enable/disable providers, set API keys, configure auth |

### CLI Commands for Usage

```
worktrace usage                  # table of all providers: plan, used/limit, reset, status
worktrace usage claude           # detailed view for one provider
worktrace usage --json           # machine-readable output
worktrace usage --refresh        # force re-fetch before displaying
```

### Implementation Architecture

```
CLI/packages/agent/src/
  usage/
    types.ts                     # ProviderUsage, AdapterCapabilities interfaces
    manager.ts                   # UsageManager — orchestrates adapters, caching, polling
    cache.ts                     # TTL cache in ~/.worktrace/usage-cache.json
    adapters/
      base.ts                    # BaseAdapter abstract class
      codex.ts                   # Codex CLI RPC + PTY + optional web
      claude.ts                  # OAuth API + browser cookies + PTY
      cursor.ts                  # Browser cookies
      gemini.ts                  # OAuth via ~/.gemini/ credentials
      antigravity.ts             # Local language server probe
      droid.ts                   # Browser cookies + WorkOS tokens
      copilot.ts                 # GitHub device flow + usage API
      zai.ts                     # Keychain/credential store API token
      kimi.ts                    # Browser cookie JWT
      kimi-k2.ts                 # API key credits
      kiro.ts                    # CLI /usage command
      vertex.ts                  # gcloud OAuth + log parsing
      augment.ts                 # Browser cookies + keepalive
      amp.ts                     # Browser cookies
      jetbrains.ts               # Local XML config read
      openrouter.ts              # API token credits
    platform/
      credentials.ts             # OS-native secure store (Keychain / libsecret / wincred)
      cookies.ts                 # Chromium cookie reader (SQLite + decryption per OS)
      process.ts                 # Process detection (lsof / /proc / tasklist)
      pty.ts                     # PTY execution wrapper (node-pty)
      paths.ts                   # OS-specific path resolution for browsers, CLIs, configs
```

### Caching and Polling

- Each adapter defines its own TTL (e.g. Cursor: 60s, Copilot: 300s, OpenRouter: 120s)
- Cache stored in `~/.worktrace/usage-cache.json` — survives agent restarts
- Agent runs a background poll loop at configurable intervals (default: 5 minutes)
- `POST /usage/refresh` bypasses cache for on-demand checks
- Stale data is served with a `lastFetched` timestamp so clients can show freshness

### Configuration

Stored in `~/.worktrace/config.json`:

```json
{
  "usage": {
    "enabled": true,
    "pollIntervalMs": 300000,
    "providers": {
      "claude": { "enabled": true },
      "cursor": { "enabled": true },
      "codex": { "enabled": true, "apiKey": null },
      "gemini": { "enabled": true },
      "copilot": { "enabled": true },
      "openrouter": { "enabled": false, "apiKey": "sk-or-..." },
      "kimi-k2": { "enabled": false, "apiKey": "..." },
      "vertex": { "enabled": true, "projectId": "my-project" },
      "jetbrains": { "enabled": true },
      "kiro": { "enabled": true },
      "zai": { "enabled": true },
      "antigravity": { "enabled": false },
      "droid": { "enabled": false },
      "kimi": { "enabled": false },
      "augment": { "enabled": false },
      "amp": { "enabled": false }
    }
  }
}
```

Auto-detection: on first run, the agent scans for installed CLIs, browser profiles, and config files, then auto-enables providers it finds evidence of.

---

## Phased Rollout

| Phase | What Ships | Status |
| --- | --- | --- |
| ~~Phase 1~~ | ~~Worktrace branding, multi-file extension, basic safety monitor, deterministic summaries~~ | **COMPLETED** |
| ~~Phase 2~~ | ~~Cross-session memory, continuity engine, context injection, `.worktrace/` local store~~ | **COMPLETED** |
| ~~Phase 3a~~ | ~~`worktrace-agent` daemon, CLI tool, extension thin-client rewrite, shared credential store~~ | **COMPLETED** |
| ~~Phase 3b~~ | ~~Provider usage intelligence — 16 adapter framework, 4 full-parity adapters (Codex, Claude, Cursor, Copilot), agent routes, CLI `usage` command, web dashboard~~ | **COMPLETED** |
| Phase 4 | Prompt enhancer, configurable safety rules (`.worktrace/rules.yml`), scope-creep detection | Planned |
| Phase 5 | Web dashboard, cloud metadata sync, usage timeline, project health views | Planned |
| Phase 6 | Team features, exportable reports, daily/weekly digests, billing | Planned |

---

## Execution Plan

### ~~Step 1 — Build `worktrace-agent` as the local runtime~~ COMPLETED

- Agent daemon on `localhost:9315` with full session lifecycle
- Core modules: analysis, safety, memory, context, delta-builder, renderer, git, file-utils
- Stable HTTP routes for all operations

### ~~Step 2 — Ship the CLI and thin-client extension~~ COMPLETED

- CLI with 9 commands, auto-starts agent, Worktrace-branded terminal UX
- Extension rewritten as 4-file thin client delegating everything to agent via HTTP
- Shared credential store, dual auth flow (CLI callback + extension URI scheme)

### ~~Step 3 — Provider usage intelligence (Phase 3b)~~ COMPLETED

- Adapter framework: `BaseAdapter`, `ProviderUsage`, `AdapterCapabilities`, `UsageManager` with TTL cache + background polling
- Platform layer: `platform/paths.ts` (OS-specific paths), `platform/keychain.ts` (macOS Keychain reader for Claude OAuth)
- 4 full CodexBar-parity adapters shipped:
  - **Codex**: OAuth API (`chatgpt.com/backend-api/wham/usage`) — 5h + weekly rate limits, credits balance, plan from JWT
  - **Claude**: OAuth API (`api.anthropic.com/api/oauth/usage`) — 5h session, 7-day weekly, Opus/Sonnet weekly, extra usage credits; token from macOS Keychain (`claudeAiOauth.accessToken`)
  - **Cursor**: `api2.cursor.sh` + `cursor.com/api/usage-summary` fallback — plan usage in USD, on-demand breakdown, billing cycle reset
  - **Copilot**: Internal API (`api.github.com/copilot_internal/user`) with editor headers — premium interactions + chat quotas
- 12 additional stub adapters (Gemini, Kiro, Kimi, Kimi K2, Vertex, JetBrains, OpenRouter, z.ai, Antigravity, Droid, Augment, Amp)
- Auto-detection: only installed providers shown, 5-minute detection cache
- Agent routes: `GET /usage`, `GET /usage/:provider`, `POST /usage/refresh`, `GET /usage/config`, `PATCH /usage/config`
- CLI: `worktrace usage` with provider cards, quota bars, reset countdowns, credits, quick-view table
- Web dashboard: real-time usage page fetching from agent API

### Step 4 — Feed usage into Worktrace intelligence

- Add `usageContext` to session summaries, continuity prompts, and AI summary payloads
- Surface per-session provider info: which tool was used, quota pressure, cost
- Enable per-project AI cost tracking over time

### Step 5 — Prompt enhancer

- Wrap user prompts with project-aware context
- Inject guardrails, architectural constraints, user priorities from session history

### Step 6 — Web dashboard

- Personal dev timeline across all projects and sessions
- Provider usage timeline with cost visibility
- Project health view: stability map, churn hotspots, friction trends

### Step 7 — Team and monetisation

- Team views, async standups, cross-dev patterns
- Exportable reports, daily/weekly digests
- Billing and plan management

---

## Repo Directory Structure

| Directory | Purpose |
| --- | --- |
| `Extension/` | VS Code / Cursor extension — thin UI client |
| `Backend/` | Express server — auth, AI summaries, cards, usage quotas |
| `CLI/` | npm workspaces monorepo for `@worktrace/agent` and `worktrace` CLI |
| `CLI/packages/agent/` | Local daemon — session lifecycle, analysis, safety, memory, context, usage |
| `CLI/packages/cli/` | Terminal client — Worktrace-branded UX, thin HTTP client to agent |
| `Dashboard/` | Future web dashboard |
| `Landing/` | Landing page |
| `Docs/` | Project documentation |

## What Makes This Unpayable-to-Leave

| Feature | Why an LLM alone can't do this |
| --- | --- |
| Cross-session memory | LLMs have no persistence between conversations |
| Behavioural pattern detection | Requires continuous observation, not one-shot analysis |
| Churn/stability tracking | Needs longitudinal data across days/weeks |
| Safety monitoring | Needs real-time file watching, not post-hoc review |
| Proof of work | Requires verified, timestamped session data |
| Context injection | Needs awareness of all past sessions, not just current |
| Provider usage intelligence | Requires local system access, credential stores, and cross-tool aggregation that no single AI provider will build |
