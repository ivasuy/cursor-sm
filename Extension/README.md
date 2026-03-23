# Worktrace

Worktrace is a thin VS Code / Cursor extension that provides editor-native UI for the Worktrace agent daemon. All business logic (session lifecycle, analysis, safety, memory, context, credentials) lives in the agent; the extension delegates via HTTP.

The product vision in [`../PRODUCT.md`](../PRODUCT.md) is larger than what ships today. This README describes the current extension package.

## Current Status

| State | What is true in this repo today |
| --- | --- |
| Completed | Agent-first architecture, thin-client extension, CLI, local session tracking, deterministic summaries, basic safety scan, `.worktrace` session memory, startup "where I left off" prompt, `sessions/context.md`, history search, shared credential store, optional AI summaries/context, shareable cards |
| Partial | Proof of work exists as summaries, cards, streaks, and basic backend session records; cloud data exists for auth, usage, profile, and saved AI session metadata, but not full metadata sync/dashboard features |
| Not built yet | Prompt enhancer, provider usage intelligence, configurable safety rules, dashboard, export/reporting flows, team features |

## How It Works

### Thin UI client

- On activation, auto-starts the agent daemon via `ensureAgent()`.
- All commands delegate to the agent via HTTP (`localhost:9315`).
- Provides VS Code-native UI: status bar, notifications, quick picks, text viewers.
- URI handler receives auth callbacks and forwards tokens to the agent.
- Contains only 4 source files: `extension.ts`, `agent-client.ts`, `types.ts`, `workspace.ts`.

### What the agent provides

- Session lifecycle (start, end, note, status)
- File event capture via chokidar
- Deterministic analysis and Markdown summaries
- Cross-session memory in `.worktrace/sessions.json`
- Continuity context in `sessions/context.md`
- Safety scanning
- Credential storage and token refresh (`~/.worktrace/credentials.json`)
- Backend communication for AI summaries, cards, and user profiles

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

### Prerequisites

Build the agent first (the extension requires it):

```bash
cd CLI
npm install
npm run build --workspaces
```

### Extension

```bash
cd Extension
npm install
npm run compile
npm run package
```

Open `Extension/` in VS Code / Cursor and press `F5` to launch the Extension Development Host. The extension auto-starts the agent daemon.

### Backend (optional)

The backend is optional. The extension and agent work offline without it.

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
