# Worktrace Extension

VS Code/Cursor extension client for the local Worktrace agent.

## Features

- status bar provider pace rotation
- provider quick-pick and detail view
- watch/unwatch workspace commands
- pace and report JSON viewers
- refresh command for provider snapshots

## Development

```bash
cd extension
npm install
npm run compile
```

Open `extension/` in VS Code and press `F5` to run the Extension Development Host.

## Required Setting

`worktrace.agentPath` can point to the agent entrypoint when auto-resolution is not enough:

```json
{
  "worktrace.agentPath": "/absolute/path/to/cli/packages/agent/dist/server.js"
}
```

## Commands

- `Worktrace: Show Providers`
- `Worktrace: Watch Workspace`
- `Worktrace: Stop Watching Workspace`
- `Worktrace: Show Pace`
- `Worktrace: Show Report`
- `Worktrace: Refresh Provider Data`
