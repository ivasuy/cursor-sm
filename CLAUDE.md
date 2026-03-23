# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Worktrace — "The operating system for AI-assisted development." A VS Code/Cursor extension that tracks coding sessions, runs safety monitoring on AI-generated code, and generates structured Markdown summaries. Works offline with deterministic analysis; optionally enhanced with AI summaries via a backend powered by Google Vertex AI (Gemini).

## Architecture

Three independent components with separate dependency trees:

- **Extension** (`Extension/src/`) — Thin VS Code UI client. Delegates all business logic (session lifecycle, analysis, safety, auth) to the agent daemon via HTTP. Provides VS Code-native UI: status bar, notifications, quick picks, text viewers, and URI handler for auth callbacks. Auto-starts the agent on activation.
- **Backend** (`Backend/`) — Express server with Firebase Auth, Firestore for user/plan/usage data, and Vertex AI for summary generation. Starts in degraded mode (503 on auth/session routes) if Firebase service account is missing.
- **CLI + Agent** (`CLI/`) — npm workspaces monorepo containing `@worktrace/agent` (local daemon on port 9315) and `worktrace` CLI (terminal client). The agent owns session lifecycle, analysis, safety, memory, and context. The CLI is a thin HTTP client with Matrix-themed terminal UX.

### Extension Module Structure

| Module | Purpose |
| --- | --- |
| `Extension/src/extension.ts` | Entry point — activate/deactivate, 9 command registrations, URI handler for auth callbacks |
| `Extension/src/agent-client.ts` | HTTP client to agent daemon — `ensureAgent()`, typed GET/POST/PATCH helpers, fire-and-forget POST |
| `Extension/src/types.ts` | Agent response interfaces (SessionStatus, AuthStatus, SafetyCheckResponse, etc.) |
| `Extension/src/workspace.ts` | VS Code workspace utility functions |

Key data flow: Extension activates → `ensureAgent()` spawns daemon if needed → `POST /session/start` → agent's chokidar watches file events → `POST /session/end` triggers full pipeline in agent → summary opened in editor.

## Build & Run Commands

### Extension
```bash
cd extension
npm install          # Install extension dependencies
npm run compile      # TypeScript compile (tsc -p .)
npm run watch        # Watch mode (tsc -w -p .)
npm run package      # Package as .vsix (vsce package)
```
Test locally: Open `extension/` in VS Code/Cursor and press `F5` to launch Extension Development Host.

### Backend
```bash
cd backend
npm install          # Install backend dependencies
npm run dev          # Dev server with auto-reload (ts-node-dev)
npm run build        # TypeScript compile
npm run start        # Run compiled JS (node dist/index.js)
```

### CLI + Agent
```bash
cd CLI
npm install          # Install workspace dependencies
npm run build --workspaces  # Build agent + CLI
node packages/cli/dist/index.js start  # Run CLI locally
```

### Docker
```bash
cd backend
docker compose up    # Runs backend on port 3000 and mounts .env plus secrets/
```

## Agent Routes

Local daemon on `127.0.0.1:9315`:
- `GET /health` — agent health check
- `POST /session/start` — start session tracking for a workspace
- `POST /session/end` — end session, run full pipeline (delta → analysis → safety → render)
- `POST /session/note` — add note to active session
- `GET /session/status` — current session status
- `GET /context` — generate continuity context for a workspace
- `GET /history` — search past sessions
- `POST /safety/check` — run safety scan on uncommitted changes
- `POST /auth/login` — OAuth login flow (CLI: full browser flow; Extension: returns auth URL with scheme param)
- `POST /auth/callback` — receives auth tokens from extension URI handler
- `POST /auth/logout` — clear stored credentials
- `GET /auth/status` — current auth status (includes email, userId, displayName)
- `POST /card/generate` — generate shareable session card
- `PATCH /profile` — update display name

## Backend Environment

Requires `backend/.env` with Firebase and Vertex AI credentials (see `backend/.env.example`). Service account keys go in `backend/secrets/`. Critical env vars: `FIREBASE_SERVICE_ACCOUNT_PATH`, `VERTEX_PROJECT_ID`, `GOOGLE_APPLICATION_CREDENTIALS`.

## Backend Route Structure

All routes under `/api/`:
- `/api/config` — public, returns server status and feature flags
- `/api/auth` — serves Google Sign-In HTML page, guarded by Firebase readiness
- `/api/session` — `POST /summarize` accepts enriched session payload, verifies auth, checks usage quota, calls Vertex AI
- `/api/user` — user profile management
- `/api/card` — shareable session card generation (uses `sharp` for image processing)

Auth middleware (`backend/src/middleware/auth.ts`) verifies Firebase ID tokens on protected routes.

## Extension Commands

All commands use `worktrace.*` namespace:
- `worktrace.endSession` — End session and generate summary
- `worktrace.addSessionNote` — Add a note to current session
- `worktrace.signIn` / `worktrace.signOut` — Google auth
- `worktrace.setDisplayName` — Set display name for cards
- `worktrace.generateCard` — Generate shareable session card
- `worktrace.runSafetyCheck` — Run safety scan on uncommitted changes

- `worktrace.showContext` — Show continuity context for current workspace
- `worktrace.searchHistory` — Search past session history

Configuration: `worktrace.agentPath` (path to agent server.js), `worktrace.safetyMonitor` (enable/disable safety monitoring)

## Usage/Plan System

Firestore `users/{uid}` stores plan tier and monthly usage. Limits: free (50/month), pro (500/month), enterprise (5000/month). Auto-resets on month boundary. Usage service (`backend/src/services/usage.ts`) checks and increments counters.
