# Feature Overview

This file covers what Worktrace currently does in the repo today. It is intentionally narrower than the long-term roadmap in `product-pivot.md`.

## Signals Worktrace Tracks

The extension captures these local signals while you work:

| Signal | Source | Purpose |
| --- | --- | --- |
| File creates | `workspace.onDidCreateFiles` | Detect scaffolding and new modules |
| File saves | `workspace.onDidSaveTextDocument` | Measure iteration intensity per file |
| File deletes | `workspace.onDidDeleteFiles` | Detect churn and abandoned approaches |
| File opens | `workspace.onDidOpenTextDocument` | Track files the session explored |
| Text changes | `workspace.onDidChangeTextDocument` | Mark active files as touched |
| Git diff | `git diff HEAD` at session end | Capture actual code changes |
| Git branch | `git branch --show-current` | Keep session context branch-aware |
| Manual notes | Command palette input | Capture explicit human intent |

Excluded content includes generated folders, build output, dependency folders, lock files, `sessions/`, and `.worktrace/`.

## Shipped Features

### Deterministic session summary

Every session can be summarized locally without network access. Current summary logic includes:

- session mode
- confidence level
- friction points
- tomorrow checklist
- untouched categories
- user note
- grouped change summary

### Cross-session memory

Worktrace stores compact session history in `.worktrace/sessions.json` and uses it for:

- churn hotspot detection
- recurring friction detection
- recent branch awareness
- carrying forward open TODOs
- startup "where I left off" prompts

### Project context / continuity

Worktrace maintains `sessions/context.md` as a reusable project context block.

- Local fallback generation exists in the extension.
- AI generation exists in the backend.
- The context is designed to be pasted into any AI tool manually.

### Search and review flows

Current commands let the user:

- search prior sessions by file, branch, mode, or intent keywords
- open the current project context document
- copy project context to the clipboard
- run a diff-based safety check on current changes

### Proof-of-work surfaces

The repo already includes:

- Markdown session logs in `sessions/`
- shareable image cards for signed-in users
- streak and per-day card data backed by saved session metadata in Firestore

This is a narrower implementation than the roadmap's full reports, timelines, and exports.

## Local vs Signed-In Behavior

### Local-only mode

Without backend auth, Worktrace still provides:

- session capture
- deterministic summaries
- local project context generation
- `.worktrace` memory
- history search
- safety scan

### Signed-in mode

With a working backend and Google sign-in, Worktrace also provides:

- AI session summaries
- AI project context generation
- shareable card generation
- usage quota enforcement
- display name sync

If backend calls fail, Worktrace falls back to local summary/context generation.

## Files Written to the Workspace

```text
sessions/
  session-YYYY-MM-DD_HH-MM-SS.md
  context.md
  card-YYYY-MM-DD.png

.worktrace/
  sessions.json
```

## Current Limitations

The following roadmap items are not implemented yet:

- `worktrace-agent`
- CLI commands such as `worktrace start`, `worktrace end`, `worktrace context`, `worktrace usage`
- automatic prompt enhancement or outbound prompt wrapping
- provider usage collection for Codex, Claude, Gemini, Cursor, or local cost scans
- project-configurable safety rules in `.worktrace/rules.yml`
- dependency-risk checks and scope-creep detection
- web dashboard, metadata sync UI, team views, exports, reports, or digests
