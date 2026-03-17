# Worktrace Next TODOs

This file tracks only work that is still missing from the current repo after the Phase 1 and Phase 2 functionality already shipped in the extension.

## P0 - Extract agent-ready core boundaries

Why:
- The extension currently owns tracking, analysis, memory, safety, and context generation directly.
- Phase 3 depends on turning that logic into reusable runtime contracts before a CLI or local agent can share it.

What exists already:
- Session tracking and deterministic analysis in the extension
- Local `.worktrace` session store
- Local context generation
- Safety scan logic

What remains:
- Define clear internal boundaries for session lifecycle, memory, context generation, safety, and usage
- Move extension-specific UI and filesystem orchestration away from reusable core logic
- Document the contracts the future agent and CLI will depend on

Acceptance:
- Shared runtime interfaces exist and can be used without VS Code command/UI code
- Extension code becomes a client of those interfaces instead of the only implementation surface

## P0 - Introduce `worktrace-agent`

Why:
- The roadmap depends on a reusable local runtime that can outlive the editor and serve multiple clients.

What exists already:
- No standalone local service or reusable runtime process

What remains:
- Create the `worktrace-agent` package/runtime
- Start it automatically from the extension when needed
- Expose stable local contracts for health, session state, context, safety, and future usage data

Acceptance:
- A local agent can be started and queried independently of the extension UI
- The extension can call the agent for at least one real capability instead of calling local modules directly

## P0 - Ship a minimal CLI

Why:
- Terminal-first workflows are a stated product surface, but the repo currently only supports the extension.

What exists already:
- Context, history, and safety concepts exist only inside the extension UX

What remains:
- Create a `worktrace` CLI package
- Implement a first command set: `start`, `end`, `status`, `context`, `history`, `check`
- Make the CLI talk to `worktrace-agent` rather than duplicating extension logic

Acceptance:
- CLI commands can start/end sessions and read context/history without the editor
- CLI and extension share the same local data/runtime contracts

## P1 - Make safety rules project-configurable

Why:
- The current safety scan is hard-coded and cannot express project-specific protected files or policy choices.

What exists already:
- Diff-based safety checks and warning notifications

What remains:
- Add `.worktrace/rules.yml`
- Support stable-file protection, rule toggles, and project-level thresholds
- Keep a sane default ruleset when the file is absent

Acceptance:
- A project can change safety behavior without modifying source code
- The extension surfaces warnings using merged default + project config

## P1 - Add provider usage adapters

Why:
- Usage intelligence is one of the main Phase 3 differentiators and currently does not exist.

What exists already:
- Backend quota tracking for AI summaries only

What remains:
- Define a normalized provider usage contract
- Add adapter interfaces for provider capabilities, limits, reset windows, and costs
- Implement first collectors for the highest-value providers

Acceptance:
- At least one provider can report normalized usage data through a shared adapter contract
- Unsupported providers report explicit capability gaps instead of failing silently

## P1 - Feed usage context back into Worktrace outputs

Why:
- Usage data has product value only when it affects summaries, continuity, and user decisions.

What exists already:
- Session summaries and project context have no provider-usage context

What remains:
- Add usage context to local summary rendering
- Add usage context to project context generation
- Decide how quota pressure, reset windows, and cost data appear in user-facing output

Acceptance:
- Summaries and context can include provider-usage context when available
- Output still degrades cleanly when no provider data exists

## P2 - Build dashboard and sync after local contracts stabilize

Why:
- Dashboard work should sit on top of stable local agent contracts, not the current extension-only architecture.

What exists already:
- Backend stores limited user/session metadata for usage and cards

What remains:
- Define metadata sync boundaries
- Build project timelines and searchable history views
- Add health/churn/friction visualization on top of synced metadata

Acceptance:
- Dashboard data model matches agent-produced metadata
- Local-first behavior remains intact when sync is disabled

## P2 - Add reporting, exports, and team surfaces

Why:
- Reporting and team features depend on dashboard-grade data, not the current card/streak implementation.

What exists already:
- Shareable cards and basic saved session metadata

What remains:
- Exportable reports
- narrative timelines
- daily/weekly digests
- team-facing views and billing hooks

Acceptance:
- Reporting features consume stable synced metadata instead of scraping Markdown outputs
- Team surfaces build on the same project/session model as the dashboard
