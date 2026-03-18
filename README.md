# Worktrace

This repository is now split into two top-level apps:

| Path | Role |
| --- | --- |
| `Extension/` | VS Code / Cursor extension for local session tracking, summaries, continuity, and safety checks |
| `Backend/` | Optional backend for Google sign-in, AI summaries/context, usage tracking, and shareable cards |

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
