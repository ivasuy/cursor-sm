import { Command } from 'commander';
import { agentGet } from '../agent-client.js';
import { isJson, jsonOut } from '../output.js';

export const contextCommand = new Command('context')
  .description('Print project context (stdout, pipeable)')
  .action(async () => {
    const cwd = process.cwd();
    const data = await agentGet<{ context: string | null }>(`/context?workspace=${encodeURIComponent(cwd)}`);

    if (isJson()) { jsonOut(data); return; }

    if (data.context) {
      process.stdout.write(data.context);
    } else {
      console.log('No project context yet. End a session first.');
    }
  });
