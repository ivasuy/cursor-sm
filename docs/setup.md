# Worktrace Setup

This guide covers the current setup that exists in the repo today:

- the local agent daemon (single source of truth)
- the VS Code / Cursor extension (thin UI client)
- the CLI (terminal client)
- the optional backend used for auth, AI summaries, AI context, and cards

## System Shape

| Component | Required | Role |
| --- | --- | --- |
| Agent (`CLI/packages/agent/`) | Yes | Local daemon on port 9315 — session lifecycle, analysis, safety, memory, context, credentials |
| Extension (`Extension/src/`) | Optional | Thin VS Code UI client — delegates all logic to agent via HTTP |
| CLI (`CLI/packages/cli/`) | Optional | Thin terminal client — delegates all logic to agent via HTTP |
| Backend (`Backend/`) | No | Google auth, AI summaries, AI project context, cards, usage tracking |

The agent works offline. The backend is only needed for signed-in / AI features. Use either the extension or CLI (or both) as your client.

## Agent + CLI Setup

### Prerequisites

- Node.js 18+

### Install and run

```bash
cd CLI
npm install
npm run build --workspaces
```

The agent daemon starts automatically when the extension activates or when you run any CLI command. To start it manually:

```bash
node packages/agent/dist/server.js
```

To use the CLI globally:

```bash
cd CLI
sudo npm link
worktrace start
```

## Extension Setup

### Prerequisites

- Node.js 18+
- VS Code 1.85+ or Cursor

### Install and run

```bash
cd Extension
npm install
npm run compile
npm run package
```

- `npm run package` produces `worktrace-0.2.0.vsix` inside `Extension/`.
- Open `Extension/` in VS Code / Cursor and press `F5` to launch the Extension Development Host.
- The extension auto-starts the agent daemon on activation.

### Extension configuration

Open settings and search for `worktrace`.

| Setting | Default | Description |
| --- | --- | --- |
| `worktrace.agentPath` | `""` | Path to agent `server.js`. Leave empty for auto-detection. |
| `worktrace.safetyMonitor` | `true` | Enable the safety scan UX |

### Extension commands

| Command | Purpose |
| --- | --- |
| `Worktrace: End Session & Generate Summary` | Write a summary and update `sessions/context.md` |
| `Worktrace: Add Session Note` | Add explicit intent or blocker notes |
| `Worktrace: Sign In with Google` | Enable backend-powered features |
| `Worktrace: Sign Out` | Remove stored auth |
| `Worktrace: Set Display Name` | Sync display name for cards |
| `Worktrace: Generate Shareable Card` | Generate a card for a chosen date |
| `Worktrace: Run Safety Check` | Scan current diff for basic issues |
| `Worktrace: Show Session Context` | Open and copy project context |
| `Worktrace: Search Session History` | Search local session memory |

### Workspace output

```text
sessions/
  session-YYYY-MM-DD_HH-MM-SS.md
  context.md
  card-YYYY-MM-DD.png

.worktrace/
  sessions.json
```

## Backend Setup

### Prerequisites

- Node.js 18+
- Firebase project with Google auth and Firestore
- GCP project with Vertex AI enabled
- Firebase Admin SDK service account
- Vertex AI / GCP service account

### Install and run

```bash
cd backend
npm install
cp .env.example .env
mkdir -p secrets
```

Place these files in `backend/secrets/`:

- `cursor.json` for Firebase Admin SDK
- `service.json` for Vertex AI / GCP access

Start the backend:

```bash
cd backend
npm run dev
```

Verify health:

```bash
curl http://localhost:3000/health
curl http://localhost:3000/api/config
```

### Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `FIREBASE_API_KEY` | Yes | Firebase Web API key for the auth page |
| `FIREBASE_AUTH_DOMAIN` | Yes | Firebase auth domain |
| `FIREBASE_PROJECT_ID` | Yes | Firebase project ID |
| `FIREBASE_APP_ID` | Yes | Firebase app ID |
| `FIREBASE_SERVICE_ACCOUNT_PATH` | Yes | Firebase Admin SDK JSON path; default is `./secrets/cursor.json` |
| `VERTEX_PROJECT_ID` | Yes | GCP project hosting Vertex AI |
| `VERTEX_LOCATION` | No | Vertex AI region; defaults to `us-central1` if unset |
| `VERTEX_MODEL_NAME` | No | Vertex model; defaults to `gemini-2.5-flash` if unset |
| `GOOGLE_APPLICATION_CREDENTIALS` | Yes | Vertex service account JSON path; default is `./secrets/service.json` |
| `PORT` | No | Backend port; default `3000` |
| `CORS_ORIGIN` | No | Allowed origin; default `*` |
| `EXTENSION_URI_SCHEME` | No | Present in `.env.example`, but the current auth flow derives the URI scheme from the extension request query rather than reading this value directly |

### What the backend adds

When configured and the user is signed in, the backend provides:

- Google sign-in
- AI-generated session summaries
- AI-generated project context
- usage quota enforcement
- user profile storage
- shareable card generation and streak data

If Firebase credentials are missing, the backend still serves `/health` and `/api/config`, but Firebase-backed routes return `503`.

## Deployment Notes

### VSIX packaging

```bash
cd extension
npm run package
code --install-extension worktrace-0.2.0.vsix
```

### Cloud Run backend

```bash
cd backend
npm run build
gcloud run deploy worktrace-backend --source .
```

After deployment, set the `WORKTRACE_BACKEND_URL` environment variable to your deployed backend URL (defaults to `http://localhost:3000`).

### Docker

For local containerized backend setup, see [docker.md](docker.md).
