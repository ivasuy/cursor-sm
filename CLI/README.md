# Worktrace CLI Monorepo

This directory is the npm-workspaces monorepo for the agent and terminal CLI.

## Workspaces

- `packages/agent` — local daemon, provider fetch engine, and report service
- `packages/cli` — `worktrace` command and renderers

## Supported Providers (v0.1)

| Provider | Data source |
|---|---|
| Claude Code | `~/.claude/metrics/costs.jsonl` |
| Cursor | `~/Library/.../Cursor/User/globalStorage/state.vscdb` |
| Codex CLI | `~/.codex/state_5.sqlite` |

Providers are detected automatically. Only installed/configured providers appear in output.

## Setup

```bash
cd cli
npm install
```

## Build

```bash
npm run build --workspaces
```

## Run Agent

```bash
node packages/agent/dist/server.js
```

## Run CLI (without global install)

```bash
node packages/cli/dist/index.js pace
node packages/cli/dist/index.js providers
node packages/cli/dist/index.js usage
```

## Optional Global Link

```bash
cd packages/cli
npm link
worktrace pace
worktrace report --period 7d
```

## Environment

| Variable | Purpose |
|---|---|
| `WORKTRACE_AGENT_PORT` | Agent port (default: 9315) |
| `WORKTRACE_AGENT_PATH` | Agent binary path |
| `WORKTRACE_DATA_DIR` | SQLite data directory (default: `~/.worktrace`) |
| `WORKTRACE_DEBUG` | Set to any value to enable debug logs |
| `ANTHROPIC_API_KEY` | Claude API fallback (optional) |
