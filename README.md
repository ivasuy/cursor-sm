# Worktrace Report

Worktrace is a local-first monorepo for tracking AI tooling usage by repo, worktree, branch, and file activity.

It runs as:
- a local daemon (`cli/packages/agent`) with SQLite storage
- a terminal client (`cli/packages/cli`)
- a VS Code/Cursor extension (`extension`)

## Monorepo Layout

| Path | Purpose |
| --- | --- |
| `cli/packages/agent` | HTTP daemon on `127.0.0.1:9315`, provider fetch pipelines, attribution engine, report routes |
| `cli/packages/cli` | `worktrace` command, human-readable rendering, JSON mode |
| `extension` | VS Code extension with status bar and report commands |
| `docs` | specs, implementation plan, usage and operations docs |

## Quick Start

### 1) Build the monorepo

```bash
cd cli
npm install
npm run build --workspaces
```

### 2) Start the agent

```bash
node packages/agent/dist/server.js
```

### 3) Use the CLI (new shell)

```bash
cd cli
node packages/cli/dist/index.js watch
node packages/cli/dist/index.js providers
node packages/cli/dist/index.js pace
node packages/cli/dist/index.js report --period 7d
```

## Core Commands

- `worktrace watch` / `worktrace watch --stop`
- `worktrace providers [id]`
- `worktrace usage`
- `worktrace repos`
- `worktrace worktrees`
- `worktrace features [branch]`
- `worktrace files [path]`
- `worktrace pace`
- `worktrace report --period 7d|30d|all`

Use `--json` on any command for raw output.

## Configuration

| Env Var | Default | Description |
| --- | --- | --- |
| `WORKTRACE_AGENT_PORT` | `9315` | Agent port for CLI + extension |
| `WORKTRACE_AGENT_PATH` | auto | CLI override for agent `server.js` path |
| `WORKTRACE_DATA_DIR` | `~/.worktrace` | SQLite and runtime data directory |
| `GEMINI_API_KEY` | unset | Enables live Gemini usage fetch strategy |
| `ANTHROPIC_API_KEY` | unset | Claude API-key fallback strategy |

## Documentation

- [Architecture](ARCHITECTURE.md)
- [CLI Guide](cli/README.md)
- [Extension Guide](extension/README.md)