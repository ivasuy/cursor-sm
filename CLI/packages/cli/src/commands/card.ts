import { Command } from 'commander';
import { agentPost } from '../agent-client.js';
import { spinner, success, personality, isJson, jsonOut, g } from '../output.js';
import { cardMessages, pickMessage } from '../messages.js';

export const cardCommand = new Command('card')
  .description('Generate shareable session card')
  .option('--date <YYYY-MM-DD>', 'Card date (defaults to today)')
  .action(async (opts) => {
    const cwd = process.cwd();

    if (isJson()) {
      const data = await agentPost<{ cardPath: string }>('/card/generate', { workspacePath: cwd, date: opts.date });
      jsonOut(data);
      return;
    }

    const s = spinner('generating session card...');
    const data = await agentPost<{ cardPath: string }>('/card/generate', { workspacePath: cwd, date: opts.date });
    s.stop();

    success(`card saved to ${g(data.cardPath)}`);
    await personality(pickMessage(cardMessages));
  });
