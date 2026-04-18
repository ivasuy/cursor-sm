# Worktrace

Local-first AI usage tracker — monitors Claude Code, Cursor, and Codex CLI usage by repo, worktree, branch, and file.

Runs as:
- a local daemon (`cli/packages/agent`) on `127.0.0.1:9315`
- an interactive TUI (`cli/packages/cli`)
- a VS Code/Cursor extension (`extension`)

See [ARCHITECTURE.md](ARCHITECTURE.md) for file-level breakdown and data model.

---

## Monorepo Layout

| Path | Purpose |
|---|---|
| `cli/packages/agent` | HTTP daemon, provider fetch pipelines, attribution engine |
| `cli/packages/cli` | `worktrace` full-screen TUI operator console |
| `extension` | VS Code/Cursor extension with status bar and commands |
| `docs` | specs and implementation plans |

---

## Supported Providers

| Provider | Data Source |
|---|---|
| Claude Code | `~/.claude/metrics/costs.jsonl` |
| Cursor | `~/Library/.../Cursor/User/globalStorage/state.vscdb` |
| Codex CLI | `~/.codex/state_5.sqlite` |

Providers are detected automatically. Only installed/configured providers appear.

---

## Setup

### 1. Install dependencies

```bash
cd cli && npm install
```

### 2. Build

```bash
npm run build --workspaces
# → packages/agent/dist/
# → packages/cli/dist/
```

### 3. Start the agent

```bash
node packages/agent/dist/server.js
```

### 4. Launch the TUI (new shell)

```bash
node packages/cli/dist/index.js
```

### Optional: global install

```bash
cd cli/packages/cli && npm link
worktrace
```

---

## Extension Setup

```bash
cd extension
npm install
npm run compile
```

Open `extension/` in VS Code and press `F5` to launch the Extension Development Host.

**VS Code setting** — override agent path when auto-resolution fails:

```json
{
  "worktrace.agentPath": "/absolute/path/to/cli/packages/agent/dist/server.js"
}
```

**Commands:**

- `Worktrace: Show Providers`
- `Worktrace: Watch Workspace`
- `Worktrace: Stop Watching Workspace`
- `Worktrace: Show Pace`
- `Worktrace: Show Report`
- `Worktrace: Refresh Provider Data`

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `WORKTRACE_AGENT_PORT` | `9315` | Agent listen port |
| `WORKTRACE_AGENT_PATH` | auto | Override agent `server.js` path |
| `WORKTRACE_DATA_DIR` | `~/.worktrace` | SQLite and runtime data directory |
| `WORKTRACE_DEBUG` | unset | Enable debug logs |
| `ANTHROPIC_API_KEY` | unset | Claude API-key fallback strategy |

---

## TUI Keyboard Controls

| Key | Action |
|---|---|
| `j/k` or `↑↓` | Move within current module |
| `h/l` or `←→` | Switch modules |
| `enter` | Drill into selected item |
| `i` | View selected item as JSON |
| `Ctrl+y` | Copy current JSON payload |
| `/` | Jump to a module |
| `q` | Quit |
