# Cursor Session Tracker

A VS Code / Cursor extension that tracks your coding sessions and generates structured summaries — locally with deterministic analysis, or enhanced with AI via a backend powered by Google Vertex AI.

> **Language-agnostic:** Works with any project — TypeScript, Go, Java, Python, Rust, Solidity, Spring Boot, Next.js, and more.

## Architecture

The system is split into two independent pieces:

| Component | Description |
|-----------|-------------|
| **Extension** (`src/`) | VS Code extension that tracks file events, computes diffs, and generates deterministic session summaries |
| **Backend** (`backend/`) | Express server handling Google Auth, Firestore user/plan storage, and Vertex AI summary generation |

The extension works fully offline. The backend is optional — it enriches summaries with AI when the user is signed in.

See [architecture.md](architecture.md) for the full system design and [overview.md](overview.md) for feature details.

## Quick Start: Extension

### Prerequisites

- Node.js 18+
- VS Code 1.85+ or Cursor

### Install & Run

```bash
# Install dependencies
npm install

# Compile
npm run compile

# Package as VSIX (optional)
npm run package
```

To test locally, press `F5` in VS Code/Cursor to launch the Extension Development Host.

### Configuration

Open VS Code settings and search for `cursorSessionTracker`:

| Setting | Default | Description |
|---------|---------|-------------|
| `cursorSessionTracker.backendUrl` | `http://localhost:3000` | Backend API URL for AI summaries |
| `cursorSessionTracker.firebaseApiKey` | `""` | Firebase Web API key for token refresh (auto-configured when backend is reachable) |
| `cursorSessionTracker.displayName` | `""` | Your display name shown on shareable session cards |

### Usage

1. Open any project — tracking starts automatically
2. Code as usual — the extension tracks file creates, saves, deletes, and diffs
3. Optionally add notes: **Command Palette → "Add Session Note"**
4. End session: **Command Palette → "End Session & Generate Summary"**
5. A `.cursor-sessions/session-YYYY-MM-DD_HH-MM-SS.md` file is created and opened

## Quick Start: Backend

### Prerequisites

- Node.js 18+
- A Firebase project with Authentication (Google provider) and Firestore enabled
- A GCP project with Vertex AI API enabled
- A service account JSON key with Vertex AI and Firestore permissions

### Install & Run

```bash
cd backend

# Install dependencies
npm install

# Copy and fill in environment variables
cp .env.example .env
# Edit .env with your Firebase and Vertex AI credentials

# Place your GCP service account key in the secrets folder
cp /path/to/your-service-account.json ./secrets/vertex-service-account.json

# Run in development
npm run dev
```

The server starts at `http://localhost:3000`. Test connectivity:

```bash
curl http://localhost:3000/api/config
# {"status":"ok","version":"0.1.0","features":{"summarize":true,"auth":true,"usage":true}}
```

### Configuration Reference

All environment variables (defined in `backend/.env.example`):

| Variable | Required | Description |
|----------|----------|-------------|
| `FIREBASE_API_KEY` | Yes | Firebase Web API key (for client auth page) |
| `FIREBASE_AUTH_DOMAIN` | Yes | Firebase auth domain (e.g. `project.firebaseapp.com`) |
| `FIREBASE_PROJECT_ID` | Yes | Firebase project ID (used by both client auth page and Admin SDK) |
| `FIREBASE_APP_ID` | Yes | Firebase app ID (for client auth page) |
| `FIREBASE_SERVICE_ACCOUNT_PATH` | Yes | Path to Firebase service account JSON (default: `./secrets/cursor.json`) |
| `VERTEX_PROJECT_ID` | Yes | GCP project ID hosting Vertex AI (can differ from Firebase project) |
| `VERTEX_LOCATION` | No | Vertex AI region (default: `us-central1`) |
| `VERTEX_MODEL_NAME` | No | Model ID (default: `gemini-2.5-flash`) |
| `GOOGLE_APPLICATION_CREDENTIALS` | Yes | Path to Vertex AI service account JSON (default: `./secrets/vertex-service-account.json`) |
| `PORT` | No | Server port (default: `3000`) |
| `CORS_ORIGIN` | No | Allowed CORS origin (default: `*`) |
| `EXTENSION_URI_SCHEME` | No | VS Code URI scheme for auth callback |

## Deployment

### Backend (Cloud Run)

```bash
cd backend
npm run build

# Deploy to Cloud Run (example)
gcloud run deploy cursor-session-backend \
  --source . \
  --set-env-vars "VERTEX_PROJECT_ID=your-project,VERTEX_LOCATION=us-central1,FIREBASE_PROJECT_ID=your-project" \
  --allow-unauthenticated
```

Mount the service account key as a secret volume or set `GOOGLE_APPLICATION_CREDENTIALS` to the mounted path. Update `CORS_ORIGIN` to your production domain.

### Firestore Rules

```bash
cd backend
firebase deploy --only firestore:rules
```

### Extension (VSIX)

```bash
npm run package
# Produces cursor-session-tracker-0.1.0.vsix
# Install via: code --install-extension cursor-session-tracker-0.1.0.vsix
```

Update `cursorSessionTracker.backendUrl` in VS Code settings to point to your deployed backend URL.

## License

MIT
