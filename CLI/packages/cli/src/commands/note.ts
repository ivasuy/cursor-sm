import { Command } from 'commander';
import { agentPost } from '../agent-client.js';
import { success, isJson, jsonOut, g } from '../output.js';

export const noteCommand = new Command('note')
  .description('Add note to active session')
  .argument('<message>', 'Note text')
  .action(async (message: string) => {
    const cwd = process.cwd();
    const data = await agentPost<{ notes: string[] }>('/session/note', { workspacePath: cwd, note: message });

    if (isJson()) { jsonOut(data); return; }
    success(`note added. ${g(String(data.notes.length))} notes in this session.`);
  });
