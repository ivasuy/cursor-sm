# Worktrace Next TODOs

This file tracks work that is still missing from the current repo. Phase 1, Phase 2, and core Phase 3 (agent + CLI) are shipped.

## Completed

### ~~P0 - Extract agent-ready core boundaries~~ DONE
All core modules (analysis, safety, memory, context, delta-builder, renderer, git, file-utils, session-store) extracted from the extension into `CLI/packages/agent/` with no VS Code dependencies.

### ~~P0 - Introduce `worktrace-agent`~~ DONE
Local daemon on `localhost:9315` with HTTP routes for session lifecycle, context, history, safety, auth, cards, and profile. Auto-started by CLI, runs as a detached background process.

### ~~P0 - Ship a minimal CLI~~ DONE
`worktrace` CLI with 9 commands: `start`, `end`, `status`, `context`, `history`, `check`, `note`, `login`, `card`. Matrix-themed terminal UX. Cross-platform.

---

## P0 - Connect extension to the agent

Why:
- The extension still uses its own inline logic for analysis, safety, memory, and context.
- It should become a client of `worktrace-agent` to share the same runtime as the CLI.

What remains:
- Replace extension inline logic with HTTP calls to the agent
- Start agent automatically from extension activation
- Keep extension UX (panels, notifications, commands) as a thin layer over agent responses

Acceptance:
- Extension and CLI share identical session data, analysis, and safety results via the same agent

## P1 - Make safety rules project-configurable

Why:
- The current safety scan is hard-coded and cannot express project-specific protected files or policy choices.

What remains:
- Add `.worktrace/rules.yml`
- Support stable-file protection, rule toggles, and project-level thresholds
- Keep a sane default ruleset when the file is absent

Acceptance:
- A project can change safety behavior without modifying source code
- The extension and CLI surface warnings using merged default + project config

## P1 - Add provider usage adapters

Why:
- Usage intelligence is a Phase 3 differentiator and currently does not exist.

What remains:
- Define a normalized provider usage contract
- Add adapter interfaces for provider capabilities, limits, reset windows, and costs
- Implement first collectors for highest-value providers (Codex, Claude, Gemini, Cursor)

Acceptance:
- At least one provider can report normalized usage data through a shared adapter contract
- Unsupported providers report explicit capability gaps instead of failing silently

## P1 - Feed usage context back into Worktrace outputs

Why:
- Usage data has product value only when it affects summaries, continuity, and user decisions.

What remains:
- Add usage context to local summary rendering
- Add usage context to project context generation
- Decide how quota pressure, reset windows, and cost data appear in user-facing output

Acceptance:
- Summaries and context can include provider-usage context when available
- Output still degrades cleanly when no provider data exists

## P1 - Add `worktrace usage` CLI command

Why:
- Inspect local provider usage, cost, limits, remaining quota, and reset windows from the terminal.

What remains:
- Implement `usage` command in CLI
- Wire to agent provider usage adapters (depends on P1 adapter work above)

Acceptance:
- `worktrace usage` shows normalized usage data for configured providers

## P2 - Build web dashboard and sync

Why:
- Dashboard work should sit on top of stable local agent contracts.

What remains:
- Define metadata sync boundaries
- Build project timelines and searchable history views
- Add health/churn/friction visualization on top of synced metadata
- The `Dashboard/` directory is the centralized home for this work

Acceptance:
- Dashboard data model matches agent-produced metadata
- Local-first behavior remains intact when sync is disabled

## P2 - Add reporting, exports, and team surfaces

Why:
- Reporting and team features depend on dashboard-grade data.

What remains:
- Exportable reports
- Narrative timelines
- Daily/weekly digests
- Team-facing views and billing hooks

Acceptance:
- Reporting features consume stable synced metadata instead of scraping Markdown outputs
- Team surfaces build on the same project/session model as the dashboard
