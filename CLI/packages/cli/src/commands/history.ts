import { Command } from 'commander';
import { agentGet } from '../agent-client.js';
import { table, personality, isJson, jsonOut, d } from '../output.js';
import { historyMessages, pickMessage } from '../messages.js';

interface StoredSession {
  id: string;
  startTime: string;
  endTime: string;
  branch: string | null;
  sessionMode: string;
  filesTouched: string[];
  linesAdded?: number;
  linesRemoved?: number;
}

function formatDurationShort(start: string, end: string): string {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m`;
}

export const historyCommand = new Command('history')
  .description('Browse past sessions')
  .option('-q, --query <search>', 'Search by keyword')
  .option('-l, --limit <n>', 'Max results', '10')
  .action(async (opts) => {
    const cwd = process.cwd();
    const params = new URLSearchParams({ workspace: cwd, limit: opts.limit });
    if (opts.query) params.set('query', opts.query);
    const data = await agentGet<{ sessions: StoredSession[] }>(`/history?${params}`);

    if (isJson()) { jsonOut(data); return; }

    if (data.sessions.length === 0) {
      console.log(d('the archive is empty. start your first session.'));
      return;
    }

    const headers = ['#', 'Date', 'Duration', 'Branch', 'Mode', 'Files', '+/-'];
    const rows = data.sessions.map((s, i) => [
      String(i + 1),
      s.startTime.split('T')[0],
      formatDurationShort(s.startTime, s.endTime),
      s.branch || 'detached',
      s.sessionMode || '-',
      String(s.filesTouched.length),
      `+${s.linesAdded || 0}/-${s.linesRemoved || 0}`,
    ]);

    table(headers, rows);
    const pool = historyMessages(data.sessions.length);
    await personality(pickMessage(pool));
  });
