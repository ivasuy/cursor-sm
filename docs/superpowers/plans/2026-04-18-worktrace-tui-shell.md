# Worktrace TUI Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current multi-command human-facing CLI with a single keyboard-only full-screen TUI shell launched by `worktrace`, while preserving the existing agent/provider extraction logic unchanged.

**Architecture:** Keep `cli/packages/cli` as a thin client over the existing agent HTTP routes, but replace the `commander` subcommand router with a `neo-blessed` shell that owns boot flow, navigation, module switching, and JSON inspection. Model navigation, boot timing, and per-module selection as pure reducer/view-model logic so the TUI chrome can be tested without depending on terminal rendering or touching the agent package.

**Tech Stack:** TypeScript, Node 18+, `neo-blessed` for the TUI, `clipboardy` for `Copy JSON`, `tsx --test` with Node test runner for pure state/view-model tests, existing `fetch` + agent HTTP routes.

---

## File Structure

### Existing files to modify

- `cli/packages/cli/package.json`
  Add TUI/runtime dependencies, add `test` script, and remove no-longer-needed renderer-only dependencies after cutover.
- `cli/packages/cli/src/index.ts`
  Replace `commander` subcommands with a default shell launcher plus `--help` and `--version`.
- `cli/README.md`
  Rewrite usage examples to document `worktrace` as a shell app rather than a command collection.

### Existing files to delete after cutover

- `cli/packages/cli/src/commands/features.ts`
- `cli/packages/cli/src/commands/files.ts`
- `cli/packages/cli/src/commands/pace.ts`
- `cli/packages/cli/src/commands/providers.ts`
- `cli/packages/cli/src/commands/report.ts`
- `cli/packages/cli/src/commands/repos.ts`
- `cli/packages/cli/src/commands/usage.ts`
- `cli/packages/cli/src/commands/watch.ts`
- `cli/packages/cli/src/commands/worktrees.ts`
- `cli/packages/cli/src/output.ts`
- `cli/packages/cli/src/render/colors.ts`
- `cli/packages/cli/src/render/progress-bar.ts`
- `cli/packages/cli/src/render/quota-card.ts`
- `cli/packages/cli/src/render/table.ts`

### New files to create

- `cli/packages/cli/src/tui/types.ts`
  Shell-specific app state, module ids, focus regions, JSON inspector state, and boot phase types.
- `cli/packages/cli/src/tui/actions.ts`
  Typed actions for navigation, boot completion, refresh, JSON inspector open/close, and watch toggles.
- `cli/packages/cli/src/tui/reducer.ts`
  Pure reducer for shell state transitions.
- `cli/packages/cli/src/tui/reducer.test.ts`
  Reducer tests covering module changes, region focus, selection, and JSON inspector state.
- `cli/packages/cli/src/tui/boot-sequence.ts`
  Pure boot-line timeline generator and scan-reveal timing helpers.
- `cli/packages/cli/src/tui/boot-sequence.test.ts`
  Tests for 1–2 second boot budget and deterministic boot frame generation.
- `cli/packages/cli/src/tui/data-client.ts`
  Thin wrappers around existing agent routes for report/providers/watch payloads; no provider logic.
- `cli/packages/cli/src/tui/view-models.ts`
  Converts current API payloads into module-friendly row/detail view models.
- `cli/packages/cli/src/tui/view-models.test.ts`
  Tests for folding `usage` into `providers`, command deck summary generation, and JSON payload selection.
- `cli/packages/cli/src/tui/keymap.ts`
  Keyboard mapping from raw keys to reducer actions.
- `cli/packages/cli/src/tui/keymap.test.ts`
  Tests for `j/k`, arrows, `enter`, `esc`, `/`, `i`, and `q`.
- `cli/packages/cli/src/tui/theme.ts`
  Central color and border tokens for the graphite + signal-green visual system.
- `cli/packages/cli/src/tui/widgets.ts`
  Small view helpers for status strips, tables, inspectors, progress meters, and empty states.
- `cli/packages/cli/src/tui/app.ts`
  `neo-blessed` shell bootstrap, layout construction, event loop, and periodic refresh orchestration.
- `cli/packages/cli/src/tui/run.ts`
  Public `runTui()` entrypoint called from `src/index.ts`.

## Task 1: Add Test and TUI Scaffolding

**Files:**
- Modify: `cli/packages/cli/package.json`
- Test: `cli/packages/cli/src/tui/reducer.test.ts`
- Test: `cli/packages/cli/src/tui/boot-sequence.test.ts`

- [ ] **Step 1: Add the TUI/runtime and test dependencies**

```json
{
  "scripts": {
    "build": "tsc",
    "dev": "tsc -w",
    "test": "tsx --test src/**/*.test.ts"
  },
  "dependencies": {
    "@worktrace/agent": "*",
    "chalk": "^5.4.1",
    "clipboardy": "^4.0.0",
    "commander": "^13.1.0",
    "neo-blessed": "^0.2.0"
  },
  "devDependencies": {
    "@types/blessed": "^0.1.25",
    "@types/node": "^22.0.0",
    "tsx": "^4.19.2",
    "typescript": "^5.7.0"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `cd cli && npm install --workspace packages/cli`
Expected: install completes and `neo-blessed`, `clipboardy`, and `tsx` are added to the CLI workspace lockfile.

- [ ] **Step 3: Write the failing reducer shell-state test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from './types.js';
import { reducer } from './reducer.js';

test('MOVE_MODULE advances selection inside the command rail', () => {
  const initial = createInitialState();
  const next = reducer(initial, { type: 'MOVE_MODULE', delta: 1 });
  assert.equal(next.activeModule, 'providers');
  assert.equal(next.focusRegion, 'nav');
});
```

- [ ] **Step 4: Write the failing boot-sequence timing test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBootFrames } from './boot-sequence.js';

test('boot sequence stays within the approved cinematic window', () => {
  const frames = buildBootFrames();
  const totalDuration = frames.reduce((sum, frame) => sum + frame.durationMs, 0);
  assert.ok(totalDuration >= 1000);
  assert.ok(totalDuration <= 2000);
});
```

- [ ] **Step 5: Run the tests to verify they fail**

Run: `cd cli/packages/cli && npm test`
Expected: FAIL with module-not-found or export-not-found errors for `./types.js` and `./boot-sequence.js`.

- [ ] **Step 6: Commit the scaffolding setup**

```bash
git add cli/packages/cli/package.json cli/package-lock.json cli/packages/cli/src/tui/reducer.test.ts cli/packages/cli/src/tui/boot-sequence.test.ts
git commit -m "test(cli): add TUI shell scaffolding"
```

## Task 2: Build Pure Shell State and Boot Logic

**Files:**
- Create: `cli/packages/cli/src/tui/types.ts`
- Create: `cli/packages/cli/src/tui/actions.ts`
- Create: `cli/packages/cli/src/tui/reducer.ts`
- Create: `cli/packages/cli/src/tui/boot-sequence.ts`
- Test: `cli/packages/cli/src/tui/reducer.test.ts`
- Test: `cli/packages/cli/src/tui/boot-sequence.test.ts`

- [ ] **Step 1: Define shell types and initial state**

```ts
export type ModuleId =
  | 'deck'
  | 'providers'
  | 'repos'
  | 'worktrees'
  | 'features'
  | 'files'
  | 'pace'
  | 'watch'
  | 'report';

export type FocusRegion = 'nav' | 'content' | 'inspector' | 'footer';

export interface JsonInspectorState {
  open: boolean;
  title: string;
  payload: string;
}

export interface AppState {
  bootComplete: boolean;
  bootFrameIndex: number;
  activeModule: ModuleId;
  focusRegion: FocusRegion;
  selectedIndexByModule: Record<ModuleId, number>;
  jsonInspector: JsonInspectorState;
  statusMessage: string;
}

export function createInitialState(): AppState {
  return {
    bootComplete: false,
    bootFrameIndex: 0,
    activeModule: 'deck',
    focusRegion: 'nav',
    selectedIndexByModule: {
      deck: 0,
      providers: 0,
      repos: 0,
      worktrees: 0,
      features: 0,
      files: 0,
      pace: 0,
      watch: 0,
      report: 0,
    },
    jsonInspector: { open: false, title: '', payload: '' },
    statusMessage: 'booting shell',
  };
}
```

- [ ] **Step 2: Define reducer actions**

```ts
import type { ModuleId } from './types.js';

export type Action =
  | { type: 'BOOT_TICK' }
  | { type: 'BOOT_COMPLETE' }
  | { type: 'MOVE_MODULE'; delta: 1 | -1 }
  | { type: 'FOCUS_REGION'; region: 'nav' | 'content' | 'inspector' | 'footer' }
  | { type: 'MOVE_SELECTION'; module: ModuleId; delta: 1 | -1; max: number }
  | { type: 'OPEN_JSON'; title: string; payload: string }
  | { type: 'CLOSE_JSON' }
  | { type: 'SET_STATUS'; message: string };
```

- [ ] **Step 3: Implement the reducer**

```ts
import type { Action } from './actions.js';
import type { AppState, ModuleId } from './types.js';

const MODULE_ORDER: ModuleId[] = ['deck', 'providers', 'repos', 'worktrees', 'features', 'files', 'pace', 'watch', 'report'];

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'BOOT_TICK':
      return { ...state, bootFrameIndex: state.bootFrameIndex + 1 };
    case 'BOOT_COMPLETE':
      return { ...state, bootComplete: true, statusMessage: 'command deck online' };
    case 'MOVE_MODULE': {
      const current = MODULE_ORDER.indexOf(state.activeModule);
      const nextIndex = Math.max(0, Math.min(MODULE_ORDER.length - 1, current + action.delta));
      return { ...state, activeModule: MODULE_ORDER[nextIndex], focusRegion: 'nav' };
    }
    case 'FOCUS_REGION':
      return { ...state, focusRegion: action.region };
    case 'MOVE_SELECTION': {
      const current = state.selectedIndexByModule[action.module];
      const next = Math.max(0, Math.min(Math.max(action.max - 1, 0), current + action.delta));
      return {
        ...state,
        selectedIndexByModule: {
          ...state.selectedIndexByModule,
          [action.module]: next,
        },
      };
    }
    case 'OPEN_JSON':
      return {
        ...state,
        jsonInspector: { open: true, title: action.title, payload: action.payload },
        focusRegion: 'inspector',
      };
    case 'CLOSE_JSON':
      return { ...state, jsonInspector: { open: false, title: '', payload: '' }, focusRegion: 'content' };
    case 'SET_STATUS':
      return { ...state, statusMessage: action.message };
    default:
      return state;
  }
}
```

- [ ] **Step 4: Implement the pure boot sequence**

```ts
export interface BootFrame {
  lines: string[];
  durationMs: number;
  revealPercent: number;
}

const BOOT_LINES = [
  'loading module registry',
  'binding provider surfaces',
  'hydrating cached snapshots',
  'restoring tracked repos',
  'arming command deck',
];

export function buildBootFrames(): BootFrame[] {
  return BOOT_LINES.map((line, index) => ({
    lines: BOOT_LINES.slice(0, index + 1),
    durationMs: 250,
    revealPercent: Math.round(((index + 1) / BOOT_LINES.length) * 100),
  }));
}
```

- [ ] **Step 5: Update the tests to import the new modules**

```ts
import { createInitialState } from './types.js';
import { reducer } from './reducer.js';
import { buildBootFrames } from './boot-sequence.js';
```

- [ ] **Step 6: Run the pure-state tests**

Run: `cd cli/packages/cli && npm test`
Expected: PASS for the reducer and boot-sequence tests.

- [ ] **Step 7: Commit the pure shell model**

```bash
git add cli/packages/cli/src/tui/types.ts cli/packages/cli/src/tui/actions.ts cli/packages/cli/src/tui/reducer.ts cli/packages/cli/src/tui/boot-sequence.ts cli/packages/cli/src/tui/reducer.test.ts cli/packages/cli/src/tui/boot-sequence.test.ts
git commit -m "feat(cli): add shell state and boot model"
```

## Task 3: Add Data Adapters and Module View Models

**Files:**
- Create: `cli/packages/cli/src/tui/data-client.ts`
- Create: `cli/packages/cli/src/tui/view-models.ts`
- Test: `cli/packages/cli/src/tui/view-models.test.ts`

- [ ] **Step 1: Write the failing view-model tests for command deck and providers**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCommandDeck, buildProvidersModule } from './view-models.js';

test('buildCommandDeck produces balanced overview cards from report payload', () => {
  const deck = buildCommandDeck({
    fetchedAt: 1,
    range: { since: 1, until: 2 },
    providers: [],
    repos: [{ repoId: 1, name: 'cursor-sm', path: '/repo', perProvider: [] }],
    worktrees: [],
    features: [],
    files: [],
    pace: [],
  });

  assert.equal(deck.cards[0].label, 'tracked repos');
  assert.equal(deck.cards[0].value, '1');
});

test('buildProvidersModule exposes text-first rows and JSON payloads', () => {
  const moduleView = buildProvidersModule([
    {
      descriptor: {
        id: 'claude',
        metadata: { displayName: 'Claude Code', vendor: 'Anthropic', category: 'assistant', website: '' },
        branding: { icon: 'X', accentColor: '#00ff00' },
      },
      snapshot: null,
      status: 'error',
      error: 'not configured',
    },
  ]);

  assert.equal(moduleView.rows[0].title, 'Claude Code');
  assert.match(moduleView.rows[0].json, /"id": "claude"/);
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `cd cli/packages/cli && npm test`
Expected: FAIL because `buildCommandDeck` and `buildProvidersModule` do not exist yet.

- [ ] **Step 3: Add a typed data client that reuses the existing agent surfaces**

```ts
import { ensureAgent, agentGet, agentPost, agentDelete } from '../agent-client.js';
import type { ProvidersListResponse, ProviderDetailResponse, ReportResponse } from '../types.js';

export async function loadShellData(period = '7d'): Promise<{
  report: ReportResponse;
  providers: ProviderDetailResponse[];
}> {
  await ensureAgent();
  const report = await agentGet<ReportResponse>(`/report?period=${encodeURIComponent(period)}`);
  const list = await agentGet<ProvidersListResponse>('/providers');
  const providers = await Promise.all(
    list.providers.map((provider) => agentGet<ProviderDetailResponse>(`/providers/${encodeURIComponent(provider.id)}`)),
  );
  return { report, providers };
}

export async function startWatching(path: string): Promise<unknown> {
  await ensureAgent();
  return agentPost('/watch', { path });
}

export async function stopWatching(path: string): Promise<unknown> {
  await ensureAgent();
  return agentDelete(`/watch?path=${encodeURIComponent(path)}`);
}
```

- [ ] **Step 4: Build the shell view-model mappers**

```ts
import type { ProviderDetailResponse, ReportResponse } from '../types.js';

export function buildCommandDeck(report: ReportResponse) {
  return {
    cards: [
      { label: 'tracked repos', value: String(report.repos.length) },
      { label: 'worktrees', value: String(report.worktrees.length) },
      { label: 'provider surfaces', value: String(report.providers.length) },
      { label: 'pace signals', value: String(report.pace.length) },
    ],
  };
}

export function buildProvidersModule(providers: ProviderDetailResponse[]) {
  return {
    rows: providers.map((provider) => ({
      id: provider.descriptor.id,
      title: provider.descriptor.metadata.displayName,
      subtitle: provider.snapshot?.identity?.plan ?? provider.status,
      json: JSON.stringify(provider, null, 2),
    })),
  };
}

export function buildSimpleListModule<T extends { json: string }>(
  title: string,
  rows: T[],
): { title: string; rows: T[] } {
  return { title, rows };
}
```

- [ ] **Step 5: Run the view-model tests**

Run: `cd cli/packages/cli && npm test`
Expected: PASS for the new command-deck and providers view-model tests.

- [ ] **Step 6: Commit the shell data layer**

```bash
git add cli/packages/cli/src/tui/data-client.ts cli/packages/cli/src/tui/view-models.ts cli/packages/cli/src/tui/view-models.test.ts
git commit -m "feat(cli): add TUI data adapters and view models"
```

## Task 4: Build Keymap, Theme, and TUI Layout

**Files:**
- Create: `cli/packages/cli/src/tui/keymap.ts`
- Create: `cli/packages/cli/src/tui/keymap.test.ts`
- Create: `cli/packages/cli/src/tui/theme.ts`
- Create: `cli/packages/cli/src/tui/widgets.ts`
- Create: `cli/packages/cli/src/tui/app.ts`

- [ ] **Step 1: Write the failing keymap tests**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { mapKeyToAction } from './keymap.js';

test('j and down arrow move selection forward', () => {
  assert.deepEqual(mapKeyToAction('j'), { type: 'MOVE_SELECTION', delta: 1 });
  assert.deepEqual(mapKeyToAction('down'), { type: 'MOVE_SELECTION', delta: 1 });
});

test('q maps to quit', () => {
  assert.deepEqual(mapKeyToAction('q'), { type: 'QUIT' });
});

test('/ opens shell search and i opens JSON inspector', () => {
  assert.deepEqual(mapKeyToAction('/'), { type: 'SEARCH' });
  assert.deepEqual(mapKeyToAction('i'), { type: 'OPEN_JSON' });
});
```

- [ ] **Step 2: Implement the keymap**

```ts
export function mapKeyToAction(name: string):
  | { type: 'MOVE_SELECTION'; delta: 1 | -1 }
  | { type: 'MOVE_MODULE'; delta: 1 | -1 }
  | { type: 'FOCUS_NEXT' }
  | { type: 'FOCUS_PREV' }
  | { type: 'DRILL_IN' }
  | { type: 'BACK' }
  | { type: 'SEARCH' }
  | { type: 'OPEN_JSON' }
  | { type: 'CLOSE_JSON' }
  | { type: 'QUIT' }
  | null {
  switch (name) {
    case 'j':
    case 'down':
      return { type: 'MOVE_SELECTION', delta: 1 };
    case 'k':
    case 'up':
      return { type: 'MOVE_SELECTION', delta: -1 };
    case 'l':
    case 'right':
      return { type: 'MOVE_MODULE', delta: 1 };
    case 'h':
    case 'left':
      return { type: 'MOVE_MODULE', delta: -1 };
    case 'enter':
      return { type: 'DRILL_IN' };
    case 'escape':
      return { type: 'BACK' };
    case '/':
      return { type: 'SEARCH' };
    case 'i':
      return { type: 'OPEN_JSON' };
    case 'q':
      return { type: 'QUIT' };
    default:
      return null;
  }
}
```

- [ ] **Step 3: Define the shared theme**

```ts
export const theme = {
  shell: {
    background: '#070a08',
    foreground: '#d7f4e2',
    muted: '#7e8d84',
    accent: '#71e0a2',
    border: '#1c3326',
  },
};
```

- [ ] **Step 4: Add focused widgets for the frame**

```ts
export function formatFooterShortcuts(): string {
  return 'j/k move  h/l modules  enter drill  i json  ^y copy  esc back  / search  q quit';
}

export function formatNavItem(label: string, active: boolean): string {
  return active ? `> ${label}` : `  ${label}`;
}
```

- [ ] **Step 5: Build the `neo-blessed` shell**

```ts
import blessed from 'neo-blessed';
import { buildBootFrames } from './boot-sequence.js';
import { createInitialState } from './types.js';
import { reducer } from './reducer.js';
import { loadShellData } from './data-client.js';
import { buildCommandDeck, buildProvidersModule } from './view-models.js';
import { formatFooterShortcuts, formatNavItem } from './widgets.js';
import { theme } from './theme.js';

export async function createApp(): Promise<void> {
  const screen = blessed.screen({ smartCSR: true, title: 'worktrace' });
  let state = createInitialState();

  const top = blessed.box({ top: 0, left: 0, width: '100%', height: 1, tags: true });
  const nav = blessed.list({ top: 1, left: 0, width: 22, bottom: 1, keys: false, mouse: false });
  const main = blessed.box({ top: 1, left: 22, right: 0, bottom: 1, tags: true, scrollable: true });
  const footer = blessed.box({ bottom: 0, left: 0, width: '100%', height: 1, tags: true });

  screen.append(top);
  screen.append(nav);
  screen.append(main);
  screen.append(footer);

  const frames = buildBootFrames();
  for (const frame of frames) {
    main.setContent(frame.lines.join('\n'));
    screen.render();
    await new Promise((resolve) => setTimeout(resolve, frame.durationMs));
  }

  const shellData = await loadShellData();
  const deck = buildCommandDeck(shellData.report);
  const providers = buildProvidersModule(shellData.providers);

  function renderCurrentModule(): void {
    switch (state.activeModule) {
      case 'deck':
        main.setContent([
          'Command Deck',
          '',
          ...deck.cards.map((card) => `${card.label.padEnd(18)} ${card.value}`),
        ].join('\n'));
        break;
      case 'providers':
        main.setContent([
          'Providers',
          '',
          ...providers.rows.map((row) => `${row.title}  ${row.subtitle}`),
        ].join('\n'));
        break;
      default:
        main.setContent(`${state.activeModule}\n\nModule renderer wired through the same shell frame using the shared list/detail pattern.`);
        break;
    }
  }

  state = reducer(state, { type: 'BOOT_COMPLETE' });
  top.setContent('{bold}WORKTRACE{/bold}  command deck');
  nav.setItems(['deck', 'providers', 'repos', 'worktrees', 'features', 'files', 'pace', 'watch', 'report'].map((label) => formatNavItem(label, label === state.activeModule)));
  footer.setContent(formatFooterShortcuts());
  renderCurrentModule();
  screen.render();
}
```

- [ ] **Step 6: Run the keymap tests**

Run: `cd cli/packages/cli && npm test`
Expected: PASS for keymap plus the earlier reducer/boot/view-model suites.

- [ ] **Step 7: Commit the TUI frame**

```bash
git add cli/packages/cli/src/tui/keymap.ts cli/packages/cli/src/tui/keymap.test.ts cli/packages/cli/src/tui/theme.ts cli/packages/cli/src/tui/widgets.ts cli/packages/cli/src/tui/app.ts
git commit -m "feat(cli): add TUI frame and keymap"
```

## Task 5: Wire the Shell into the Entrypoint and Add JSON/Clipboard Actions

**Files:**
- Create: `cli/packages/cli/src/tui/run.ts`
- Modify: `cli/packages/cli/src/index.ts`
- Modify: `cli/packages/cli/src/tui/app.ts`

- [ ] **Step 1: Write the shell entrypoint wrapper**

```ts
import { createApp } from './app.js';

export async function runTui(): Promise<void> {
  await createApp();
}
```

- [ ] **Step 2: Replace the old subcommand router in `src/index.ts`**

```ts
#!/usr/bin/env node
import { Command } from 'commander';
import { runTui } from './tui/run.js';

const program = new Command();

program
  .name('worktrace')
  .description('Worktrace operator console')
  .version('0.1.0-dev')
  .allowUnknownOption(false)
  .action(async () => runTui());

program.parseAsync(process.argv).catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 3: Add in-app JSON view and clipboard copy**

```ts
import clipboard from 'clipboardy';

function openJsonInspector(main: blessed.Widgets.BoxElement, title: string, payload: string): void {
  main.setContent(`${title}\n\n${payload}`);
}

async function copyJson(payload: string, footer: blessed.Widgets.BoxElement): Promise<void> {
  await clipboard.write(payload);
  footer.setContent('copied JSON payload');
}
```

- [ ] **Step 4: Bind keys for JSON inspector behavior**

```ts
screen.key(['enter'], () => {
  state = reducer(state, { type: 'FOCUS_REGION', region: 'content' });
  renderCurrentModule();
  screen.render();
});

screen.key(['i'], () => {
  const payload = currentSelection?.json ?? '{}';
  openJsonInspector(main, currentSelection?.title ?? 'JSON', payload);
});

screen.key(['C-y'], async () => {
  const payload = currentSelection?.json ?? '{}';
  await copyJson(payload, footer);
  screen.render();
});
```

- [ ] **Step 5: Build and manually smoke-test the new entrypoint**

Run: `cd cli && npm run build --workspace packages/cli`
Expected: TypeScript build passes and `dist/index.js` is regenerated without importing any deleted command files.

Run: `cd cli && node packages/cli/dist/index.js`
Expected: a full-screen shell opens, shows the boot stream, then reveals the command deck.

- [ ] **Step 6: Commit the shell cutover**

```bash
git add cli/packages/cli/src/index.ts cli/packages/cli/src/tui/run.ts cli/packages/cli/src/tui/app.ts
git commit -m "feat(cli): launch worktrace as TUI shell"
```

## Task 6: Remove Legacy Renderers and Update Docs

**Files:**
- Delete: `cli/packages/cli/src/commands/features.ts`
- Delete: `cli/packages/cli/src/commands/files.ts`
- Delete: `cli/packages/cli/src/commands/pace.ts`
- Delete: `cli/packages/cli/src/commands/providers.ts`
- Delete: `cli/packages/cli/src/commands/report.ts`
- Delete: `cli/packages/cli/src/commands/repos.ts`
- Delete: `cli/packages/cli/src/commands/usage.ts`
- Delete: `cli/packages/cli/src/commands/watch.ts`
- Delete: `cli/packages/cli/src/commands/worktrees.ts`
- Delete: `cli/packages/cli/src/output.ts`
- Delete: `cli/packages/cli/src/render/colors.ts`
- Delete: `cli/packages/cli/src/render/progress-bar.ts`
- Delete: `cli/packages/cli/src/render/quota-card.ts`
- Delete: `cli/packages/cli/src/render/table.ts`
- Modify: `cli/README.md`
- Modify: `README.md`

- [ ] **Step 1: Delete the legacy command and renderer files once the shell build passes**

Run: `rm cli/packages/cli/src/commands/*.ts cli/packages/cli/src/output.ts cli/packages/cli/src/render/*.ts`
Expected: only the new `src/tui/*` shell and shared client/types remain in the CLI package.

- [ ] **Step 2: Update `cli/README.md` usage examples**

```md
## Run CLI (without global install)

```bash
node packages/cli/dist/index.js
```

The shell boots into the Worktrace command deck. Use the keyboard to move between modules:

- `j/k` or arrows to move
- `h/l` to switch modules
- `enter` to drill into the selected view
- `i` to inspect JSON
- `Ctrl+y` to copy JSON
- `q` to quit
```

- [ ] **Step 3: Update the root `README.md` quick-start examples**

```md
### 3) Use the CLI (new shell)

```bash
cd cli
node packages/cli/dist/index.js
```

Worktrace now opens as a full-screen operator console. Provider, repo, worktree, file, watch, and report views are navigated inside the shell.
```

- [ ] **Step 4: Run the full CLI test/build suite**

Run: `cd cli/packages/cli && npm test`
Expected: PASS for reducer, boot-sequence, view-model, and keymap tests.

Run: `cd cli && npm run build --workspace packages/cli`
Expected: PASS with no imports remaining from `src/commands/*` or `src/render/*`.

- [ ] **Step 5: Commit the cleanup and docs**

```bash
git add cli/packages/cli/src cli/README.md README.md
git commit -m "refactor(cli): remove legacy commands after TUI cutover"
```

## Task 7: Manual QA and Ship Readiness

**Files:**
- Test: `cli/packages/cli/src/tui/*.test.ts`
- Modify: `docs/superpowers/plans/2026-04-18-worktrace-tui-shell.md`

- [ ] **Step 1: Manual QA on a normal terminal size**

Run: `cd cli && node packages/cli/dist/index.js`
Expected:
- boot sequence runs for about 1–2 seconds
- scan reveal lands in the command deck
- left rail navigation is readable
- no provider icons dominate the screen
- balanced density feels readable at a glance

- [ ] **Step 2: Manual QA on a narrow terminal**

Run: resize the terminal to roughly `100x30` and launch `node packages/cli/dist/index.js`
Expected:
- shell still renders without crashing
- nav and content do not overlap
- footer shortcuts remain readable

- [ ] **Step 3: Manual QA of in-app JSON actions**

Run: open the shell, move to `providers`, press `enter`, then `Ctrl+y`
Expected:
- selected provider JSON opens in-app
- clipboard copy succeeds
- footer confirms the copy action

- [ ] **Step 4: Record any follow-up polish items directly below this task**

```md
- [ ] Polish follow-up 1: tighten boot-line spacing if the scan reveal feels slow.
- [ ] Polish follow-up 2: trim any module that still feels too crowded on first paint.
- [ ] Polish follow-up 3: verify `watch` messaging is operationally clear inside the shell.
```

- [ ] **Step 5: Commit the verified QA pass**

```bash
git add docs/superpowers/plans/2026-04-18-worktrace-tui-shell.md
git commit -m "test(cli): verify TUI shell QA pass"
```
