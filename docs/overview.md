# Overview

## What the Extension Tracks

Cursor Session Tracker monitors your coding activity in real time:

| Signal | Source | Purpose |
|--------|--------|---------|
| File creates | `workspace.onDidCreateFiles` | Detect new files scaffolded during the session |
| File saves | `workspace.onDidSaveTextDocument` | Track iteration frequency per file |
| File deletes | `workspace.onDidDeleteFiles` | Detect removed files and experimentation patterns |
| File opens | `workspace.onDidOpenTextDocument` | Track which files were browsed |
| Text changes | `workspace.onDidChangeTextDocument` | Record file touch events |
| Git diff | `git diff HEAD` (at session end) | Capture exact code changes |
| Git branch | `git branch --show-current` | Record which branch work happened on |
| User notes | Manual input via command palette | Ground-truth developer intent |

### File Exclusions

Build artifacts, lock files, and generated content are automatically excluded:

`node_modules/`, `dist/`, `build/`, `.next/`, `target/`, `coverage/`, `.git/`, `package-lock.json`, `yarn.lock`, `*.min.js`, `*.map`, and more.

## Summary Sections

Every session summary includes these sections, computed deterministically:

### Session Mode

A label describing the arc of the session, derived from event density across three time phases.

Examples:
- `Exploration → Deep Focus → Winding Down`
- `Scaffolding → Iteration`
- `Quick Sprint`

### Session Confidence

A `Low` / `Medium` / `High` score based on:

- TODO/FIXME markers added during the session
- Debug statements left in code (`console.log`, `print()`, etc.)
- Size of uncommitted diff
- High iteration counts on single files
- Create-delete cycles

### Where I Got Stuck (Friction Log)

Identifies friction points from behavioral signals:

- **Rapid save bursts**: 3+ saves within 60 seconds on the same file
- **Heavy iteration**: 5+ saves on a single file
- **Create-delete cycles**: Files created then deleted (experimentation)
- **Long gaps**: 10+ minutes between events (debugging/deep thinking)

### Tomorrow, First 10 Minutes

A rules-based checklist for the next session:

1. Reopen the last edited file
2. Remove debug statements (if any were added)
3. Address TODO/FIXME markers (if any were added)
4. Review large uncommitted changes (if diff > 200 lines)

### What I Explicitly Didn't Touch

Lists major file categories that were **not** modified:

- Tests
- Documentation
- Configuration files
- UI/styling

This serves as an anti-anxiety signal — knowing what you deliberately left alone.

### My Note

User-authored notes added during the session via the "Add Session Note" command. This is the only section containing direct human intent rather than inferred behavior.

## Offline vs Online Mode

### Offline (Default)

The extension generates a complete summary locally using deterministic analysis. No network calls are made. The summary includes all sections above with behavioral data.

### Online (Signed In)

When the user is signed in via Google Auth and the backend is reachable:

1. The extension sends the full enriched session payload to the backend
2. The backend uses Vertex AI (Gemini 2.5) to generate a polished summary
3. The AI summary replaces the local one

The AI summary benefits from full file context:
- Created files include their entire content, so the model can describe what was built
- Updated files include both the diff and full current state, so changes are understood in context
- Deleted files include a list of affected dependents, so the model explains the impact

### Graceful Fallback

If the backend is unreachable, the token is expired and can't be refreshed, or the user has exceeded their plan quota, the extension silently falls back to the local deterministic summary. No error is shown to the user — the session file is always produced.

## Language & Framework Agnosticism

The extension works with any project type:

- **Frontend**: React, Vue, Svelte, Angular, Next.js
- **Backend**: Node.js, Express, Spring Boot, Django, Flask, Go, Rust
- **Mobile**: Swift, Dart/Flutter, Kotlin
- **Blockchain**: Solidity, Move, Cairo
- **Systems**: C, C++, Rust
- **Scripting**: Python, Ruby, PHP

File classification groups files into categories (Logic, UI, Config, Docs, Test, Other) based on extension and path patterns, covering all major ecosystems.

## Session Output

Session summaries are saved to `.cursor-sessions/` in the workspace root:

```
.cursor-sessions/
  session-2026-02-22_14-30-00.md
  session-2026-02-21_09-15-00.md
  session-2026-02-20_16-45-00.md
```

Each file is a standalone Markdown document that can be:
- Read directly in the editor
- Committed to version control as a development log
- Searched later for past session context
- Used for standup notes or retrospectives
