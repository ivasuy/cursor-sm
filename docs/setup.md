# Worktrace Setup

This guide covers the current setup that exists in the repo today:

- the VS Code / Cursor extension
- the optional backend used for auth, AI summaries, AI context, and cards

It does not cover the future `worktrace-agent`, CLI, dashboard, or provider usage collectors because those are not implemented yet.

## System Shape

| Component | Required | Role |
| --- | --- | --- |
| Extension (`extension/src/`) | Yes | Local tracking, deterministic summaries, local memory, safety scan, history search |
| Backend (`backend/`) | No | Google auth, AI summaries, AI project context, cards, usage tracking |

The extension works offline. The backend is only needed for signed-in / AI features.

## Extension Setup

### Prerequisites

- Node.js 18+
- VS Code 1.85+ or Cursor

### Install and run

```bash
cd extension
npm install
npm run compile
npm run package
```

- `npm run package` produces `worktrace-0.2.0.vsix` inside `extension/`.
- Open `extension/` in VS Code / Cursor and press `F5` to launch the Extension Development Host.

### Extension configuration

Open settings and search for `worktrace`.

| Setting | Default | Description |
| --- | --- | --- |
| `worktrace.backendUrl` | `http://localhost:3000` | Backend API URL for auth, AI summaries, AI context, and cards |
| `worktrace.firebaseApiKey` | `""` | Firebase Web API key used for token refresh |
| `worktrace.displayName` | `""` | Name shown on shareable cards |
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

After deployment, set `worktrace.backendUrl` in editor settings to your deployed backend URL.

### Docker

For local containerized backend setup, see [docker.md](docker.md).
