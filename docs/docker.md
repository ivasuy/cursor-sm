# Running the Worktrace Backend with Docker

This guide only covers the optional backend. The extension itself does not need Docker and still works offline without the backend.

## Prerequisites

- Docker
- Docker Compose

## One-Time Setup

### 1. Create `.env`

```bash
cd backend
cp .env.example .env
```

Fill in the Firebase and Vertex AI values required by your environment.

Important defaults used by the backend:

- `FIREBASE_SERVICE_ACCOUNT_PATH=./secrets/cursor.json`
- `GOOGLE_APPLICATION_CREDENTIALS=./secrets/service.json`

`EXTENSION_URI_SCHEME` still exists in `.env.example`, but the current auth flow derives the URI scheme from the extension request query rather than reading that value directly.

### 2. Add secret files

```text
backend/secrets/
  cursor.json
  service.json
```

- `cursor.json` is the Firebase Admin SDK service account.
- `service.json` is the GCP / Vertex AI service account.

## How the Compose Setup Works

- `backend/docker-compose.yml` builds the backend image from `backend/Dockerfile`.
- `env_file: ./.env` injects runtime environment variables.
- `./secrets:/app/secrets:ro` mounts the secret JSON files read-only.
- The backend listens on `http://localhost:3000`.

## Start and Stop

From `backend/`:

```bash
cd backend
docker compose up -d
docker compose logs -f backend
docker compose down
```

If you want to run it from the repo root instead, use:

```bash
docker compose -f backend/docker-compose.yml up -d
docker compose -f backend/docker-compose.yml logs -f backend
docker compose -f backend/docker-compose.yml down
```

## Verify the Backend

```bash
curl http://localhost:3000/health
curl http://localhost:3000/api/config
```

Expected behavior:

- `/health` works even in degraded mode
- `/api/config` works without Firebase Admin credentials
- `/api/auth`, `/api/session`, `/api/user`, and `/api/card` return `503` if Firebase Admin is not configured

## Troubleshooting

| Issue | Fix |
| --- | --- |
| `503` from Firebase-backed routes | Confirm `backend/secrets/cursor.json` exists and matches `FIREBASE_SERVICE_ACCOUNT_PATH` |
| Vertex generation errors | Confirm `backend/secrets/service.json` exists and has Vertex AI access |
| Wrong env values in container | Confirm `backend/.env` exists and either run `docker compose` from `backend/` or pass `-f backend/docker-compose.yml` from the repo root |
| Port 3000 is busy | Change the host port mapping in `backend/docker-compose.yml` |

## Security Notes

- Keep `backend/.env` and `backend/secrets/` out of git.
- Do not bake service-account files into images.
- Restrict `CORS_ORIGIN` in production instead of leaving `*`.
