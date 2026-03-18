#!/usr/bin/env node
import { Command } from 'commander';
import { startCommand } from './commands/start.js';
import { endCommand } from './commands/end.js';
import { statusCommand } from './commands/status.js';
import { contextCommand } from './commands/context.js';
import { historyCommand } from './commands/history.js';
import { checkCommand } from './commands/check.js';
import { noteCommand } from './commands/note.js';
import { loginCommand } from './commands/login.js';
import { cardCommand } from './commands/card.js';

const program = new Command();

program
  .name('worktrace')
  .description('the operating system for AI-assisted dev')
  .version('0.1.0')
  .option('--no-color', 'Disable colors and animations')
  .option('--json', 'Output as JSON (no effects)');

program.addCommand(startCommand);
program.addCommand(endCommand);
program.addCommand(statusCommand);
program.addCommand(contextCommand);
program.addCommand(historyCommand);
program.addCommand(checkCommand);
program.addCommand(noteCommand);
program.addCommand(loginCommand);
program.addCommand(cardCommand);

program.parse();
