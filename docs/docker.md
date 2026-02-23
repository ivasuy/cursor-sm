# Running the Backend with Docker

This guide explains how to run the Cursor Session Tracker backend using Docker and Docker Compose. The setup **automatically injects** your `.env` file and secret JSON files at container startup—no manual env var entry or build-time secrets required.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/)
- [Docker Compose](https://docs.docker.com/compose/install/)

## One-Time Setup

Before running the container, ensure these files exist on your host. They are **not** baked into the image; they are mounted/injected at runtime.

### 1. Create `backend/.env`

Copy the example and fill in your values:

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env` and set:

| Variable | Description |
|----------|-------------|
| `FIREBASE_API_KEY` | Firebase Web API key |
| `FIREBASE_AUTH_DOMAIN` | Firebase auth domain |
| `FIREBASE_PROJECT_ID` | Firebase project ID |
| `FIREBASE_APP_ID` | Firebase app ID |
| `FIREBASE_SERVICE_ACCOUNT_PATH` | `./secrets/cursor.json` (default) |
| `VERTEX_PROJECT_ID` | GCP project for Vertex AI |
| `VERTEX_LOCATION` | e.g. `us-central1` |
| `VERTEX_MODEL_NAME` | e.g. `gemini-2.5-flash` |
| `GOOGLE_APPLICATION_CREDENTIALS` | `./secrets/service.json` (default) |
| `PORT` | `3000` (default) |
| `CORS_ORIGIN` | `*` or your domain |
| `EXTENSION_URI_SCHEME` | `vscode://local.cursor-session-tracker` |

### 2. Add Secret JSON Files

Place your service account keys in `backend/secrets/`:

```
backend/secrets/
├── cursor.json    # Firebase Admin SDK service account
└── service.json   # Vertex AI / GCP service account
```

- **cursor.json**: Download from Firebase Console → Project Settings → Service Accounts.
- **service.json**: Create in GCP Console for the project that hosts Vertex AI.

## How Automatic Injection Works

- **`.env`**: Docker Compose uses `env_file: ./backend/.env` to load all variables into the container at startup. No need to pass env vars manually.
- **`cursor.json` & `service.json`**: The `secrets/` directory is mounted as a read-only volume into `/app/secrets` inside the container. The paths in `.env` (`./secrets/cursor.json`, `./secrets/service.json`) resolve correctly at runtime.

## Running the Backend

From the project root:

```bash
# Build and start
docker compose up -d

# View logs
docker compose logs -f backend

# Stop
docker compose down
```

The backend will be available at `http://localhost:3000`.

## Verify It's Working

```bash
# Health check
curl http://localhost:3000/health

# Config (public)
curl http://localhost:3000/api/config
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `503` on `/api/auth` or `/api/session` | Ensure `backend/secrets/cursor.json` exists and is valid. |
| Vertex AI errors | Ensure `backend/secrets/service.json` exists and the service account has Vertex AI permissions. |
| Env vars not applied | Confirm `backend/.env` exists and `env_file` in `docker-compose.yml` points to it. |
| Port 3000 in use | Change the host port in `docker-compose.yml` (e.g. `"3001:3000"`). |

## Security Notes

- `.env` and `secrets/` are gitignored. Never commit them.
- The image does **not** contain `.env` or secret files; they are only available at runtime via mounts and `env_file`.
- Use `CORS_ORIGIN` to restrict origins in production.
