import { Command } from 'commander';
import { agentPost } from '../agent-client.js';
import { matrixRain, banner, box, personality, isJson, jsonOut, g, white, d } from '../output.js';
import { startMessages, pickMessage } from '../messages.js';

export const startCommand = new Command('start')
  .description('Start tracking a session')
  .action(async () => {
    const cwd = process.cwd();
    const data = await agentPost<{ sessionId: string; startTime: string; branch: string | null }>('/session/start', { workspacePath: cwd });

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
