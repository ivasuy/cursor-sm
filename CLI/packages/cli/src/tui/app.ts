import blessed from 'neo-blessed';
import { buildBootFrames } from './boot-sequence.js';
import { addWorkspace, loadShellData, removeWorkspace } from './data-client.js';
import { mapKeyToAction } from './keymap.js';
import { reducer } from './reducer.js';
import { theme } from './theme.js';
import { createInitialState, type ModuleId } from './types.js';
import {
  buildCommandDeck,
  buildFeaturesModule,
  buildFilesModule,
  buildProvidersModule,
  buildReposModule,
  buildSimpleListModule,
  buildWatchModule,
  buildWorktreesModule,
  type ModuleRow,
} from './view-models.js';
import {
  formatMeter,
  formatFooterShortcuts,
  formatNavItem,
  formatSectionHeading,
} from './widgets.js';

interface ShellModuleData {
  title: string;
  rows: ModuleRow[];
  emptyMessage: string;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toModuleRows(title: string, rows: ModuleRow[], emptyMessage: string): ShellModuleData {
  return { title, rows, emptyMessage };
}

export async function createApp(): Promise<void> {
  const screen = blessed.screen({
    smartCSR: true,
    title: 'worktrace',
    fullUnicode: true,
  });
  screen.key(['C-c'], () => process.exit(0));

  let state = createInitialState();
  let detailOpen = false;

  const top = blessed.box({
    top: 0,
    left: 0,
    width: '100%',
    height: 1,
    tags: true,
    style: { fg: theme.shell.foreground, bg: theme.shell.background },
  });
  const nav = blessed.list({
    top: 1,
    left: 0,
    width: 24,
    bottom: 1,
    tags: true,
    keys: false,
    mouse: false,
    border: { type: 'line' },
    style: {
      fg: theme.shell.foreground,
      bg: theme.shell.background,
      border: { fg: theme.shell.border },
      selected: { fg: theme.shell.accent, bg: theme.shell.background },
    },
  });
  const main = blessed.box({
    top: 1,
    left: 24,
    right: 0,
    bottom: 1,
    tags: true,
    scrollable: true,
    alwaysScroll: true,
    border: { type: 'line' },
    style: {
      fg: theme.shell.foreground,
      bg: theme.shell.background,
      border: { fg: theme.shell.border },
    },
    padding: {
      left: 1,
      right: 1,
      top: 0,
      bottom: 0,
    },
  });
  const footer = blessed.box({
    bottom: 0,
    left: 0,
    width: '100%',
    height: 1,
    tags: true,
    style: { fg: theme.shell.muted, bg: theme.shell.background },
  });

  screen.append(top);
  screen.append(nav);
  screen.append(main);
  screen.append(footer);

  const shellDataPromise = loadShellData().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    state = reducer(state, { type: 'SET_STATUS', message: `load failed: ${message}` });
    return null;
  });

  top.setContent('{bold}WORKTRACE{/bold}  booting shell');
  footer.setContent('{green-fg}system{/green-fg}  calibrating command deck');

  for (const frame of buildBootFrames()) {
    main.setContent(
      frame.lines
        .map((line, index) =>
          index === frame.lines.length - 1 ? `{green-fg}${line}{/green-fg}` : `{gray-fg}${line}{/gray-fg}`,
        )
        .join('\n'),
    );
    state = reducer(state, { type: 'BOOT_TICK' });
    screen.render();
    await delay(frame.durationMs);
  }

  const shellData = await shellDataPromise;
  const report = shellData?.report ?? {
    fetchedAt: Date.now(),
    range: { since: Date.now(), until: Date.now() },
    providers: [],
    repos: [],
    worktrees: [],
    features: [],
    files: [],
    pace: [],
  };
  const watched = shellData?.watched ?? [];
  const providersModule = buildProvidersModule(shellData?.providers ?? [], report.pace);
  const deck = buildCommandDeck(report);

  const modules: Record<ModuleId, ShellModuleData> = {
    deck: toModuleRows(
      'Command Deck',
      deck.cards.map((card) => ({
        id: card.label,
        title: card.label,
        subtitle: card.value,
        stats: [],
        bars: [],
        details: deck.highlights,
      })),
      'No overview signals yet.',
    ),
    providers: toModuleRows(
      'Providers',
      providersModule.rows,
      'No provider surfaces detected.',
    ),
    repos: toModuleRows(
      'Repos',
      buildReposModule(report.repos).rows,
      'No tracked repos.',
    ),
    worktrees: toModuleRows(
      'Worktrees',
      buildWorktreesModule(report.worktrees).rows,
      'No tracked worktrees.',
    ),
    features: toModuleRows(
      'Features',
      buildFeaturesModule(report.features).rows,
      'No feature summaries yet.',
    ),
    files: toModuleRows(
      'Files',
      buildFilesModule(report.files).rows,
      'No file history yet.',
    ),
    watch: toModuleRows(
      'Watch',
      buildWatchModule(watched).rows,
      'No watched workspaces. Press enter on "+ add workspace" to start tracking.',
    ),
    report: toModuleRows(
      'Report',
      buildSimpleListModule('report', [
        {
          id: 'report',
          title: 'current range',
          subtitle: `${new Date(report.range.since).toLocaleString()} -> ${new Date(report.range.until).toLocaleString()}`,
          stats: [
            `${report.providers.length} providers`,
            `${report.repos.length} repos`,
            `${report.worktrees.length} worktrees`,
          ],
          bars: [],
          details: deck.highlights,
        },
      ]).rows,
      'No report payload available.',
    ),
  };

  const moduleOrder: ModuleId[] = [
    'deck',
    'providers',
    'repos',
    'worktrees',
    'features',
    'files',
    'watch',
    'report',
  ];

  function currentModuleData(): ShellModuleData {
    return modules[state.activeModule];
  }

  function currentRow(): ModuleRow | null {
    const moduleData = currentModuleData();
    if (moduleData.rows.length === 0) return null;
    const index = state.selectedIndexByModule[state.activeModule];
    return moduleData.rows[Math.min(index, moduleData.rows.length - 1)] ?? null;
  }

  function renderNav(): void {
    nav.setItems(
      moduleOrder.map((label) => formatNavItem(label, label === state.activeModule)),
    );
  }

  async function renderMainWithScan(content: string): Promise<void> {
    const lines = content.split('\n');
    const rendered: string[] = [];
    for (const line of lines) {
      rendered.push(line);
      main.setContent(rendered.join('\n'));
      screen.render();
      await delay(18);
    }
  }

  function renderModuleContent(): string {
    const moduleData = currentModuleData();
    const row = currentRow();
    if (detailOpen && row) {
      return [
        formatSectionHeading(moduleData.title),
        '',
        `{green-fg}${row.title}{/green-fg}`,
        row.subtitle,
        '',
        ...row.stats.map((stat) => `{gray-fg}${stat}{/gray-fg}`),
        ...(row.stats.length ? [''] : []),
        ...row.bars.map((bar) => formatMeter(bar.label, bar.ratio, bar.valueText)),
        ...(row.bars.length ? [''] : []),
        ...row.details.map((detail) => `  ${detail}`),
      ].join('\n');
    }

    if (moduleData.rows.length === 0) {
      return [
        formatSectionHeading(moduleData.title),
        '',
        `{gray-fg}${moduleData.emptyMessage}{/gray-fg}`,
      ].join('\n');
    }

    return [
      formatSectionHeading(moduleData.title),
      '',
      ...moduleData.rows.map((rowData, index) =>
        index === state.selectedIndexByModule[state.activeModule]
          ? `{green-fg}> ${rowData.title}{/green-fg}\n  {gray-fg}${rowData.subtitle}{/gray-fg}\n  ${rowData.stats.join(' | ')}`
          : `  ${rowData.title}\n  {gray-fg}${rowData.subtitle}{/gray-fg}\n  ${rowData.stats.join(' | ')}`,
      ),
    ].join('\n');
  }

  function renderChrome(): void {
    top.setContent(`{bold}WORKTRACE{/bold}  {green-fg}${state.activeModule}{/green-fg}  {gray-fg}${state.statusMessage}{/gray-fg}`);
    footer.setContent(formatFooterShortcuts(state.activeModule));
    renderNav();
    main.setContent(renderModuleContent());
    screen.render();
  }

  async function promptAddWorkspace(): Promise<void> {
    const prompt = blessed.prompt({
      parent: screen,
      border: 'line',
      height: 7,
      width: '60%',
      top: 'center',
      left: 'center',
      label: ' add workspace — enter path ',
      tags: true,
    });
    prompt.input('path to git repo:', process.cwd(), async (_err: unknown, value: string | null) => {
      if (!value?.trim()) {
        renderChrome();
        return;
      }
      try {
        await addWorkspace(value.trim());
        const refreshed = await loadShellData();
        modules.watch = toModuleRows(
          'Watch',
          buildWatchModule(refreshed.watched).rows,
          'No watched workspaces.',
        );
        state = reducer(state, { type: 'SET_STATUS', message: `watching ${value.trim()}` });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        state = reducer(state, { type: 'SET_STATUS', message: `add workspace failed: ${message}` });
      }
      renderChrome();
    });
  }

  async function removeSelectedWorkspace(): Promise<void> {
    const row = currentRow();
    if (!row || !row.id.startsWith('repo:')) return;
    const repoRow = modules.watch.rows.find((r) => r.id === row.id);
    if (!repoRow) return;
    const path = repoRow.subtitle;
    try {
      await removeWorkspace(path);
      const refreshed = await loadShellData();
      modules.watch = toModuleRows(
        'Watch',
        buildWatchModule(refreshed.watched).rows,
        'No watched workspaces.',
      );
      state = reducer(state, { type: 'SET_STATUS', message: `removed ${path}` });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      state = reducer(state, { type: 'SET_STATUS', message: `remove failed: ${message}` });
    }
    renderChrome();
  }

  state = reducer(state, { type: 'BOOT_COMPLETE' });
  await renderMainWithScan(renderModuleContent());
  renderChrome();

  screen.on('keypress', async (_ch: string, key: { full?: string; name?: string }) => {
    const keyName = key.full ?? key.name ?? '';

    // Watch module: d removes selected workspace repo
    if (keyName === 'd' && state.activeModule === 'watch') {
      const row = currentRow();
      if (row?.id.startsWith('repo:')) {
        await removeSelectedWorkspace();
        return;
      }
    }

    // r anywhere refreshes data
    if (keyName === 'r') {
      state = reducer(state, { type: 'SET_STATUS', message: 'refreshing...' });
      renderChrome();
      try {
        const refreshed = await loadShellData();
        modules.watch = toModuleRows(
          'Watch',
          buildWatchModule(refreshed.watched).rows,
          'No watched workspaces.',
        );
        modules.repos = toModuleRows('Repos', buildReposModule(refreshed.report.repos).rows, 'No tracked repos.');
        modules.worktrees = toModuleRows('Worktrees', buildWorktreesModule(refreshed.report.worktrees).rows, 'No tracked worktrees.');
        modules.providers = toModuleRows('Providers', buildProvidersModule(refreshed.providers, refreshed.report.pace).rows, 'No provider surfaces detected.');
        state = reducer(state, { type: 'SET_STATUS', message: 'refreshed' });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        state = reducer(state, { type: 'SET_STATUS', message: `refresh failed: ${message}` });
      }
      renderChrome();
      return;
    }

    const action = mapKeyToAction(keyName);
    if (!action) return;

    if (action.type === 'QUIT') {
      screen.destroy();
      process.exit(0);
    }

    if (action.type === 'MOVE_MODULE') {
      state = reducer(state, action);
      detailOpen = false;
      renderChrome();
      return;
    }

    if (action.type === 'MOVE_SELECTION') {
      const moduleData = currentModuleData();
      state = reducer(state, {
        type: 'MOVE_SELECTION',
        module: state.activeModule,
        delta: action.delta,
        max: moduleData.rows.length,
      });
      renderChrome();
      return;
    }

    if (action.type === 'DRILL_IN') {
      if (state.activeModule === 'watch') {
        const row = currentRow();
        if (row?.id === 'action:add') {
          await promptAddWorkspace();
        } else {
          detailOpen = true;
        }
      } else {
        detailOpen = true;
      }
      renderChrome();
      return;
    }


    if (action.type === 'BACK') {
      detailOpen = false;
      renderChrome();
      return;
    }

    if (action.type === 'SEARCH') {
      const prompt = blessed.prompt({
        parent: screen,
        border: 'line',
        height: 7,
        width: '50%',
        top: 'center',
        left: 'center',
        label: ' jump to module ',
        tags: true,
      });
      prompt.input('module', '', (_err: unknown, value: string | null) => {
        if (!value) {
          renderChrome();
          return;
        }
        const match = moduleOrder.find((moduleId) => moduleId.startsWith(value.toLowerCase()));
        if (match) {
          while (state.activeModule !== match) {
            const currentIndex = moduleOrder.indexOf(state.activeModule);
            const targetIndex = moduleOrder.indexOf(match);
            state = reducer(state, {
              type: 'MOVE_MODULE',
              delta: currentIndex < targetIndex ? 1 : -1,
            });
          }
          detailOpen = false;
        }
        renderChrome();
      });
      return;
    }

  });
}
