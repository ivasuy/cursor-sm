# Worktrace

Worktrace is a local-first VS Code / Cursor extension for AI-assisted development. It tracks real coding sessions, keeps cross-session memory in the workspace, generates deterministic summaries locally, and optionally uses a backend for Google sign-in, AI summaries, AI-generated project context, and shareable cards.

The product vision in [`../PRODUCT_ROADMAP.md`](../PRODUCT.md) is larger than what ships today. This README describes the current extension package, not the future roadmap.

## Current Status

| State | What is true in this repo today |
| --- | --- |
| Completed | Worktrace branding, multi-file extension architecture, local session tracking, deterministic summaries, basic safety scan, `.worktrace` session memory, startup "where I left off" prompt, `sessions/context.md`, history search, optional AI summaries/context, shareable cards |
| Partial | Proof of work exists as summaries, cards, streaks, and basic backend session records; cloud data exists for auth, usage, profile, and saved AI session metadata, but not full metadata sync/dashboard features |
| Not built yet | `worktrace-agent`, CLI, prompt enhancer, provider usage intelligence, configurable safety rules, dashboard, export/reporting flows, team features |

## What Ships Today

### Local-first extension

- Starts tracking automatically when a workspace opens.
- Records file creates, saves, deletes, opens, edits, git diff, branch, and manual notes.
- Stores cross-session memory in `.worktrace/sessions.json`.

### Deterministic session summaries

- Generates Markdown summaries even with no backend configured.
- Infers session mode, friction points, tomorrow checklist, confidence, untouched areas, and primary focus files.
- Writes outputs into `sessions/`.

### Continuity and memory

- Shows a "where I left off" prompt on startup when recent session data exists.
- Maintains `sessions/context.md` as a reusable project context block for any AI tool.
- Lets you search session history by file, branch, or intent keywords.

### Safety and proof of work

- Runs a basic diff-based safety scan for secrets, unsafe patterns, and other flagged changes.
- Generates shareable cards for signed-in users with session activity and streak data.
- Persists limited AI session metadata in Firestore for cards and usage tracking.

### Optional backend enhancements

- Google sign-in.
- AI-generated session summaries via Vertex AI.
- AI-generated project context updates via Vertex AI.
- Usage quota enforcement and user profile storage.

## Commands

| Command | Description |
| --- | --- |
| `Worktrace: End Session & Generate Summary` | End the active session and write a Markdown summary |
| `Worktrace: Add Session Note` | Save a manual note into the current session |
| `Worktrace: Sign In with Google` | Enable AI summaries, AI context, and cards |
| `Worktrace: Sign Out` | Clear stored auth tokens |
| `Worktrace: Set Display Name` | Set the name shown on cards |
| `Worktrace: Generate Shareable Card` | Generate a card for a chosen day |
| `Worktrace: Run Safety Check` | Scan the current git diff for basic issues |
| `Worktrace: Show Session Context` | Open `sessions/context.md` and copy it to the clipboard |
| `Worktrace: Search Session History` | Search stored session history by file, branch, or keywords |

## Workspace Output

```text
sessions/
  session-2026-03-17_19-10-22.md
  context.md
  card-2026-03-17.png

.worktrace/
  sessions.json
```

- `sessions/` contains user-facing outputs.
- `.worktrace/sessions.json` contains the local cross-session memory store.

## Quick Start

### Extension

```bash
cd Extension
npm install
npm run compile
npm run package
```

Open `Extension/` in VS Code / Cursor and press `F5` to launch the Extension Development Host.

### Backend

The backend is optional. The extension still works offline without it.

```bash
cd Backend
npm install
cp .env.example .env
npm run dev
```

See [Setup Guide](../Docs/SETUP.md) for environment variables, auth setup, deployment, and Docker usage.

## Docs

- [Setup Guide](../Docs/SETUP.md)
- [Architecture](../Docs/ARCHITECTURE.md)
- [Feature Overview](../Docs/OVERVIEW.md)
- [Docker Backend Guide](../Docs/DOCKER.md)
- [Product Roadmap](../PRODUCT.md)

## License

MIT
