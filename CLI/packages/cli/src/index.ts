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
