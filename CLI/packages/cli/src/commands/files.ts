import { ensureAgent, agentGet } from '../agent-client.js';
import Table from 'cli-table3';
import { renderFileTable } from '../render/table.js';
import { printJson, printSection } from '../output.js';
import type { FileSummary } from '../types.js';

export interface FilesOptions {
  path?: string;
  since?: string;
  until?: string;
  limit?: string;
  json?: boolean;
}

export async function runFiles(opts: FilesOptions): Promise<void> {
  await ensureAgent();
  const q = new URLSearchParams();
  if (opts.since) q.set('since', opts.since);
  if (opts.until) q.set('until', opts.until);

  if (opts.path) {
    q.set('path', opts.path);
    const qs = q.toString();
    const data = await agentGet<{ path: string; history: Array<{ changed_at: number; event_type: string; provider: string | null; branch: string; worktree_id: number; }> }>(`/files/detail${qs ? `?${qs}` : ''}`);
    if (opts.json) {
      printJson(data);
      return;
    }
    printSection(`File ${data.path}`);
    const table = new Table({
      head: ['Changed At', 'Event', 'Provider', 'Branch', 'Worktree'],
      style: { head: [], border: [] },
    });
    for (const row of data.history) {
      table.push([
        new Date(row.changed_at).toLocaleString(),
        row.event_type,
        row.provider ?? '—',
        row.branch,
        String(row.worktree_id),
      ]);
    }
    console.log(table.toString());
    return;
  }

  if (opts.limit) q.set('limit', opts.limit);
  const qs = q.toString();
  const data = await agentGet<{ files: FileSummary[] }>(`/files${qs ? `?${qs}` : ''}`);
  if (opts.json) {
    printJson(data);
    return;
  }
  printSection('Files');
  console.log(renderFileTable(data.files));
}
