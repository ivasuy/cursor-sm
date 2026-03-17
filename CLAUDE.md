# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Worktrace — "The operating system for AI-assisted development." A VS Code/Cursor extension that tracks coding sessions, runs safety monitoring on AI-generated code, and generates structured Markdown summaries. Works offline with deterministic analysis; optionally enhanced with AI summaries via a backend powered by Google Vertex AI (Gemini).

## Architecture

Two independent components with separate dependency trees:

- **Extension** (`src/`) — Multi-file VS Code extension. Tracks file events, computes git diffs, runs deterministic session analysis, safety monitoring, and renders Markdown summaries. Works fully offline. When signed in, sends enriched session data to the backend for AI-powered summaries.
- **Backend** (`backend/`) — Express server with Firebase Auth, Firestore for user/plan/usage data, and Vertex AI for summary generation. Starts in degraded mode (503 on auth/session routes) if Firebase service account is missing.

### Extension Module Structure

| Module | Purpose |
| --- | --- |
| `src/extension.ts` | Entry point — activate/deactivate, command registration, event listeners |
| `src/types.ts` | All shared TypeScript types |
| `src/constants.ts` | Constants, excluded file patterns |
| `src/session-manager.ts` | `SessionManager` class — per-workspace session state |
| `src/analysis.ts` | Session analysis — mode detection, friction, confidence, work intent |
| `src/delta-builder.ts` | Builds structured session delta from events + git diff |
| `src/git.ts` | Git operations — diff, branch |
| `src/file-utils.ts` | File classification, content reading, affected file search |
| `src/renderer.ts` | Markdown summary rendering |
| `src/safety-monitor.ts` | Safety scanning — secrets, unsafe code, scope creep detection |
| `src/auth.ts` | Auth flow, backend communication |
| `src/workspace.ts` | VS Code workspace utility functions |

Key data flow: Extension collects file events → `buildSessionDelta()` reads full file content + git diff → `analyzeSession()` runs deterministic analysis → `runSafetyCheck()` scans for issues → `renderSessionMemory()` produces local summary → optionally replaced by AI summary from backend.

## Build & Run Commands

### Extension
```bash
npm install          # Install extension dependencies
npm run compile      # TypeScript compile (tsc -p .)
npm run watch        # Watch mode (tsc -w -p .)
npm run package      # Package as .vsix (vsce package)
```
Test locally: Press `F5` in VS Code/Cursor to launch Extension Development Host.

### Backend
```bash
cd backend
npm install          # Install backend dependencies
npm run dev          # Dev server with auto-reload (ts-node-dev)
npm run build        # TypeScript compile
npm run start        # Run compiled JS (node dist/index.js)
```

### Docker
```bash
docker-compose up    # Runs backend on port 3000, mounts backend/.env and backend/secrets/
```

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

Configuration namespace: `worktrace.*` (backendUrl, firebaseApiKey, displayName, safetyMonitor)

## Usage/Plan System

Firestore `users/{uid}` stores plan tier and monthly usage. Limits: free (50/month), pro (500/month), enterprise (5000/month). Auto-resets on month boundary. Usage service (`backend/src/services/usage.ts`) checks and increments counters.
