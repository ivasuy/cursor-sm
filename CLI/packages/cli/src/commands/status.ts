import { Command } from 'commander';
import { agentGet } from '../agent-client.js';
import { box, personality, isJson, jsonOut, g, d, white } from '../output.js';
import { statusMessages, pickMessage } from '../messages.js';

interface StatusResponse {
  active: boolean;
  sessionId?: string;
  duration?: number;
  filesTouched?: number;
  totalSaves?: number;
  branch?: string;
  events?: number;
  notes?: number;
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m ${String(sec).padStart(2, '0')}s`;
}

export const statusCommand = new Command('status')
  .description('Show current session stats')
  .action(async () => {
    const cwd = process.cwd();
    const data = await agentGet<StatusResponse>(`/session/status?workspace=${encodeURIComponent(cwd)}`);

    if (isJson()) { jsonOut(data); return; }

    if (!data.active) {
      console.log(d('no active session. run ') + g('worktrace start') + d('.'));
      return;
    }

    const content = [
      `  ${d('duration')}    ${g(formatDuration(data.duration || 0))}`,
      `  ${d('branch')}      ${g(data.branch || 'detached')}`,
      `  ${d('files')}       ${g(String(data.filesTouched))} ${d('touched')}`,
      `  ${d('saves')}       ${g(String(data.totalSaves))} ${d('total')}`,
      `  ${d('events')}      ${g(String(data.events))} ${d('captured')}`,
    ].join('\n');

    box(content, { title: 'SESSION ACTIVE', borderColor: 'green' });
    await personality(pickMessage(statusMessages));
  });
