# Worktrace - Full Product Design

## Core Identity

"The operating system for AI-assisted development" - not a summary tool, but an always-on layer that sits between you and your AI coding tools, providing memory, safety, and proof of work.

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
- Works for Claude Code, Codex CLI, aider, terminal-based devs

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
| Phase 3 | CLI tool, prompt enhancer | Platform expansion |
| Phase 4 | Web dashboard, cloud metadata sync | Visualization + teams |
| Phase 5 | Team features, exportable reports, billing | Monetization |
