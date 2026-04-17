#!/usr/bin/env node
import { Command } from 'commander';
import { runRepos } from './commands/repos.js';
import { runWorktrees } from './commands/worktrees.js';
import { runProviders } from './commands/providers.js';
import { runFeatures } from './commands/features.js';
import { runFiles } from './commands/files.js';
import { runPace } from './commands/pace.js';
import { runWatch } from './commands/watch.js';
import { runUsage } from './commands/usage.js';
import { runReport } from './commands/report.js';

const program = new Command();

program
  .name('worktrace')
  .description('Worktrace Report -- per-repo, per-worktree AI spend tracker')
  .version('0.1.0-dev')
  .option('--json', 'machine-readable output (bypass renderers)')
  .option('--refresh', 'force refresh cached provider snapshots')
  .option('--period <window>', 'time window: 7d | 30d | all', '7d');

program
  .command('repos').description('Repo usage summaries')
  .option('--since <epoch-ms>', 'start of query window (epoch ms)')
  .option('--until <epoch-ms>', 'end of query window (epoch ms)')
  .action(async (opts: { since?: string; until?: string }) =>
    runRepos({ since: opts.since, until: opts.until, json: program.opts().json }));

program
  .command('worktrees').description('Worktree usage summaries')
  .option('--since <epoch-ms>', 'start of query window (epoch ms)')
  .option('--until <epoch-ms>', 'end of query window (epoch ms)')
  .action(async (opts: { since?: string; until?: string }) =>
    runWorktrees({ since: opts.since, until: opts.until, json: program.opts().json }));

program
  .command('providers [id]').description('List installed providers, or show detail for <id>')
  .action(async (id: string | undefined) =>
    runProviders({ id, json: program.opts().json, refresh: Boolean(program.opts().refresh) }));

program
  .command('features [branch]').description('Feature summaries or branch detail')
  .option('--since <epoch-ms>', 'start of query window (epoch ms)')
  .option('--until <epoch-ms>', 'end of query window (epoch ms)')
  .action(async (branch: string | undefined, opts: { since?: string; until?: string }) =>
    runFeatures({ branch, since: opts.since, until: opts.until, json: program.opts().json }));

program
  .command('files [path]').description('File summaries or path history')
  .option('--since <epoch-ms>', 'start of query window (epoch ms)')
  .option('--until <epoch-ms>', 'end of query window (epoch ms)')
  .option('--limit <n>', 'max rows for summary view')
  .action(async (path: string | undefined, opts: { since?: string; until?: string; limit?: string }) =>
    runFiles({
      path,
      since: opts.since,
      until: opts.until,
      limit: opts.limit,
      json: program.opts().json,
    }));

program
  .command('pace').description('Pace dashboard across all providers')
  .action(async () => runPace({ json: program.opts().json }));

program
  .command('watch').description('Register the current directory as a tracked repo')
  .option('--stop', 'stop watching this directory')
  .action(async (opts: { stop?: boolean }) =>
    runWatch({ stop: opts.stop, json: program.opts().json }));

program
  .command('usage').description('Provider-level usage (backward-compat view)')
  .action(async () =>
    runUsage({ refresh: Boolean(program.opts().refresh), json: program.opts().json }));

program
  .command('report').description('Full roll-up -- repos -> worktrees -> providers -> pace')
  .action(async () =>
    runReport({ json: program.opts().json, period: program.opts().period }));

program.parseAsync(process.argv).catch((err) => {
  console.error(err);
  process.exit(1);
});
