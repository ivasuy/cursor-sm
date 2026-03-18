import { Command } from 'commander';
import { agentPost } from '../agent-client.js';
import { matrixRain, banner, box, personality, isJson, jsonOut, warn, g, white, d } from '../output.js';
import { startMessages, pickMessage } from '../messages.js';

export const startCommand = new Command('start')
  .description('Start tracking a session')
  .action(async () => {
    const cwd = process.cwd();

    let data: { sessionId: string; startTime: string; branch: string | null };
    try {
      data = await agentPost<{ sessionId: string; startTime: string; branch: string | null }>('/session/start', { workspacePath: cwd });
    } catch (err: any) {
      if (err.message?.toLowerCase().includes('already active')) {
        if (isJson()) { jsonOut({ error: 'Session already active', workspacePath: cwd }); process.exit(1); }
        warn('session already active for this workspace.');
        warn(`run ${g('worktrace status')} to check or ${g('worktrace end')} to finish it.`);
        return;
      }
      throw err;
    }

    if (isJson()) { jsonOut(data); return; }

    await matrixRain(500);
    banner();

    const msg = pickMessage(startMessages);
    const content = [
      `   ${white(msg)}`,
      '',
      `   ${d('session:')}  ${g(data.sessionId)}`,
      `   ${d('branch:')}   ${g(data.branch || 'detached')}`,
      `   ${d('watching:')} ${g(cwd)}`,
      `   ${d('started:')}  ${g(new Date(data.startTime).toLocaleTimeString())}`,
    ].join('\n');

    box(content);
    await personality('every keystroke is being recorded.');
  });
