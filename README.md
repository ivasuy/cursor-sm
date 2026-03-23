# Worktrace

"The operating system for AI-assisted development." Session tracking, safety monitoring, and proof of work for AI-assisted coding.

## Architecture

| Path | Role |
| --- | --- |
| `CLI/packages/agent/` | Local daemon (port 9315) — single source of truth for session lifecycle, analysis, safety, memory, context, and credentials |
| `CLI/packages/cli/` | Terminal client — Matrix-themed UX, thin HTTP client to agent |
| `Extension/` | VS Code / Cursor extension — thin UI client, delegates all logic to the agent via HTTP |
| `Backend/` | Optional backend for Google sign-in, AI summaries/context, usage tracking, and shareable cards |

## Quick Start

### Agent + CLI

```bash
cd CLI
npm install
npm run build --workspaces
sudo npm link                          # optional: makes `worktrace` available globally
worktrace start                        # starts agent daemon + begins session
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

```bash
cd Backend
npm install
cp .env.example .env
npm run dev
```

## Docs

- [Extension README](Extension/README.md)
- [Setup Guide](Docs/SETUP.md)
- [Architecture](Docs/ARCHITECTURE.md)
- [Feature Overview](Docs/OVERVIEW.md)
- [Docker Backend Guide](Docs/DOCKER.md)
- [Product Roadmap](PRODUCT.md)

License information for the packaged extension lives in [Extension/LICENSE](Extension/LICENSE).
