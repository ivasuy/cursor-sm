# Worktrace - Full Product Design

## Core Identity

"The operating system for AI-assisted development" - not a summary tool, but an always-on layer that sits between you and your AI coding tools, providing memory, safety, and proof of work.

## Product Architecture

Worktrace evolves into a local-first system with three distinct layers:

- **Extension / editor client** - a thin VS Code/Cursor UI client that delegates all business logic to the local agent and provides editor-native UX (status bar, notifications, quick picks, URI handler)
- **Local Worktrace agent (`worktrace-agent`)** - a bundled cross-platform runtime that owns session memory, deterministic analysis, safety monitoring, git/file access, and future provider usage collection
- **Cloud backend** - auth, plans, optional AI summaries, dashboard sync, and future team/reporting features

This keeps the cloud backend focused on metadata and AI enhancement, while the local agent becomes the reusable core for the extension today and the CLI tomorrow.

## Feature Pillars

### 1. Developer Memory (Cross-Session Intelligence)

- Persistent session graph - every session linked to previous ones by project, branch, files touched
- "Where I left off" context auto-generated on session start
- Pattern detection: churn hotspots, recurring friction, abandoned approaches
- Searchable history: "When did I last touch the auth module? What did I try?"
- Metadata-only cloud sync - code never leaves the machine

### 2. Session Continuity Engine (Context Injection)

- On session start, generates a structured prompt block you can paste into ANY AI tool (Cursor, Claude Code, Codex, ChatGPT, Copilot)
- Contains: last session summary, open TODOs, files with high churn, known friction points, recent architectural decisions
- Platform-agnostic format - works as system prompt, `CLAUDE.md` block, or `.cursorrules` injection
- CLI: `worktrace context` dumps the prompt block to stdout, pipeable into any tool

### 3. Prompt Enhancer

- Wraps user prompts with project-aware context before sending to AI
- Adds: "This project uses Express + Firebase, the auth module was recently refactored, these files are fragile"
- Includes guardrails: "Do not modify these stable files unless explicitly asked", "Follow existing patterns in X"
- Learns from session history what the user cares about (testing, performance, security) and injects those priorities

### 4. AI Safety Monitor (Rogue Detection)

- Real-time file watcher that flags when AI-generated changes introduce:
  - Security vulnerabilities - hardcoded secrets, SQL injection patterns, `eval()`, `innerHTML` with user input, missing auth checks
  - Dependency risks - new unknown packages added, known vulnerable versions
  - Architectural violations - writes to files marked as stable, breaks established patterns
  - Scope creep - AI modified 20 files when you asked for a 2-file change
- Non-blocking notifications - warns you, doesn't prevent saves
- Configurable rules per project (`.worktrace/rules.yml`)
- Acts as an orchestration layer: "AI suggested X but based on your project patterns, this conflicts with Y"

### 5. Proof of Work

- Narrative session cards - not just stats, but "Built X over N sessions, iterated on Y, shipped with Z confidence"
- Shareable project timelines - visual journey of how a feature was built
- Exportable reports for clients/teams: hours, sessions, files, decisions, confidence scores
- Daily/weekly digest - auto-generated development log
- Social cards for build-in-public (existing feature, elevated)

### 6. Web Dashboard

- Personal dev timeline - all projects, all sessions, searchable
- Project health view - stability map, churn hotspots, friction trends
- Team view (future) - async standups, who's working on what, cross-dev patterns
- Streak tracking, productivity trends (optional, non-gamified)

### 7. CLI (`worktrace`)

- `worktrace start` / `worktrace end` - session tracking for terminal workflows
- `worktrace context` - dump continuity prompt for piping into AI tools
- `worktrace status` - current session stats
- `worktrace history` - search past sessions
- `worktrace check` - run safety scan on recent changes
- `worktrace usage` - inspect local provider usage, cost, limits, remaining quota, and reset windows
- Works for Claude Code, Codex CLI, aider, terminal-based devs
- Shares the same core runtime as the extension via `worktrace-agent`

### 8. Local Worktrace Agent (`worktrace-agent`)

- A bundled local service/runtime that the extension starts automatically and the CLI reuses directly
- Owns the local `.worktrace/` data store, deterministic analysis engine, safety monitor, session graph, and future prompt/context APIs
- Exposes stable local routes/contracts for `usage`, `cost`, `context`, `health`, and `refresh`
- Lets Worktrace stay expandable: multiple clients can talk to the same core without duplicating logic
- Becomes the right place to integrate external collectors such as CodexBar-derived provider usage logic

### 9. Provider Usage Intelligence (CodexBar-derived collector layer)

- Bundle provider usage collection into the local Worktrace agent, not the cloud backend
- Reuse CodexBar's provider fetchers/parsers for:
  - token usage
  - hard limits / soft limits
  - remaining quota
  - reset timestamps / windows
  - local cost scans from JSONL/session logs
- Start with Codex, Claude, Gemini, Cursor, and local cost usage, then expand to more providers behind the same adapter model
- Keep only the reusable backend/provider logic from CodexBar; do not import menu bar UI, SwiftUI/AppKit code, or the macOS-specific app shell
- Cross-platform rule: prefer CLI/API/config/log-file sources first, then add OS-specific adapters for browser/session/secure-store access where needed
- Every provider reports explicit capabilities so Worktrace can distinguish supported, partially supported, and unavailable features per OS

## What Makes This Unpayable-to-Leave

| Feature | Why an LLM alone can't do this |
| --- | --- |
| Cross-session memory | LLMs have no persistence between conversations |
| Behavioral pattern detection | Requires continuous observation, not one-shot analysis |
| Churn/stability tracking | Needs longitudinal data across days/weeks |
| Safety monitoring | Needs real-time file watching, not post-hoc review |
| Proof of work | Requires verified, timestamped session data |
| Context injection | Needs awareness of all past sessions, not just current |

## Phased Rollout

| Phase | What ships | Unlock |
| --- | --- | --- |
| ~~Phase 1~~ | ~~Rebrand to Worktrace, refactor extension into multi-file architecture, safety monitor (basic), improved session summaries~~ | ~~Foundation~~ **COMPLETED** |
| ~~Phase 2~~ | ~~Cross-session memory, continuity engine, context injection, `.worktrace/` local data store~~ | ~~Core differentiator~~ **COMPLETED** |
| ~~Phase 3~~ | ~~`worktrace-agent`, CLI tool, extension thin-client rewrite~~, prompt enhancer, local usage intelligence | ~~Platform expansion~~ **AGENT + CLI + THIN CLIENT SHIPPED** |
| Phase 4 | Web dashboard, cloud metadata sync, agent-backed usage timeline | Visualization + teams |
| Phase 5 | Team features, exportable reports, billing | Monetization |

## Current Repo Reality Check

This section reflects what is implemented in the codebase today. It is intentionally separate from the product direction above.

### Implemented in the repo today

- **`worktrace-agent`** — local daemon on `localhost:9315` owning session lifecycle, analysis, safety, memory, context, credentials, and history (`CLI/packages/agent/`)
- **`worktrace` CLI** — terminal-first client with Matrix-themed UX: `start`, `end`, `status`, `context`, `history`, `check`, `note`, `login`, `card` (`CLI/packages/cli/`)
- **Thin-client extension** — VS Code/Cursor extension that delegates all business logic to the agent via HTTP; provides only UI (status bar, notifications, quick picks, URI handler) (`Extension/`)
- **Agent-first architecture** — agent is the single source of truth; extension and CLI are both thin HTTP clients
- Local session tracking with deterministic summaries
- Basic diff-based safety scanning
- Local `.worktrace` session store for cross-session memory
- Startup "where I left off" prompt based on recent local session history
- `sessions/context.md` generation for continuity / context injection
- Session history search from the extension and CLI
- Shared credential store (`~/.worktrace/credentials.json`) across extension and CLI
- Optional backend-powered AI session summaries (`Backend/`)
- Optional backend-powered AI project context generation
- Shareable session cards

### Partial or narrower than the vision

- Proof of work exists as Markdown session logs, shareable cards, streaks, and saved backend session metadata, but not as timelines, exports, or reports
- Cloud support exists for auth, usage limits, profile data, and saved session metadata, but not as full metadata sync or dashboard infrastructure
- Safety monitoring exists as a basic scan and notification flow, but not as configurable project rules, dependency intelligence, or scope-creep detection

### Not implemented yet

- prompt enhancer / outbound prompt wrapping
- provider usage intelligence and adapter model
- cross-platform provider collectors
- web dashboard
- team views, reports, exports, and billing

## Repo Directory Structure

| Directory | Purpose |
| --- | --- |
| `Extension/` | VS Code / Cursor extension — editor-side UX layer |
| `Backend/` | Express server — auth, AI summaries, cards, usage |
| `CLI/` | npm workspaces monorepo for `@worktrace/agent` and `worktrace` CLI |
| `CLI/packages/agent/` | Local daemon — session lifecycle, analysis, safety, memory, context |
| `CLI/packages/cli/` | Terminal client — Matrix-themed UX, thin HTTP client to agent |
| `Dashboard/` | Future web dashboard |
| `Landing/` | Landing page |
| `Docs/` | Project documentation |

## Execution Plan

### ~~Step 1 - Build `worktrace-agent` as the local runtime~~ COMPLETED

- `worktrace-agent` runs as a local daemon on `localhost:9315`
- Core modules extracted from the extension: analysis, safety, memory, context, delta-builder, renderer, git, file-utils, session-store
- All VS Code dependencies removed; uses `fs/promises`, `child_process`, chokidar
- Stable HTTP routes for session lifecycle, context, history, safety, auth, cards, and profile

### ~~Step 2 - Ship the CLI on top of the same agent~~ COMPLETED

- `worktrace` CLI ships with 9 commands: `start`, `end`, `status`, `context`, `history`, `check`, `note`, `login`, `card`
- CLI auto-starts the agent daemon if not running
- Matrix-themed terminal UX with typing effects, spinners, gradient banners
- Cross-platform support (macOS, Linux, Windows)

### Step 3 - Add CodexBar-derived usage collection inside the agent

- Treat CodexBar as a collector source, not as a product dependency
- Reuse only provider/back-end logic from `CodexBarCore`
- Rebuild orchestration in Worktrace instead of importing CodexBar's current `UsageStore` app layer
- Normalize all provider output into a Worktrace usage contract that preserves the value of CodexBar snapshots while staying backend/client-agnostic
- Initial scope:
  - Codex
  - Claude
  - Gemini
  - Cursor
  - local cost scanning

### Step 4 - Make it truly cross-platform

- The local agent must be the portability boundary, not the current macOS-only CodexBar app
- v1 source priority:
  - provider CLIs
  - provider APIs with explicit auth
  - config/session files
  - local history/log scans
- Defer macOS-only dashboard/browser flows behind capability flags until there are Linux/Windows replacements
- Replace platform-specific auth/session access gradually with per-OS adapters for:
  - secure credential storage
  - browser profile/session discovery
  - process / PTY execution

### Step 5 - Feed usage intelligence back into Worktrace

- Add normalized `usageContext` into local Markdown summaries, continuity prompts, and AI summary payloads
- Let Worktrace explain not just what changed, but the operating context:
  - which provider was used
  - quota pressure
  - reset timing
  - cost accumulation
- Use the same data later in the web dashboard for per-project AI tooling timelines and cost visibility

### Step 6 - Keep the platform expandable

- All provider integrations must be adapter-driven so new AI tools can be added without changing the extension/CLI contract
- The local agent remains the single place where session intelligence, safety, and provider telemetry come together
- The cloud backend stays optional for AI summaries and sync, not required for core Worktrace functionality
