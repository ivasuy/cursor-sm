import { ensureAgent, agentGet } from '../agent-client.js';
import { renderWorktreeTable } from '../render/table.js';
import { printJson, printSection } from '../output.js';
import type { WorktreeSummary } from '../types.js';

export interface WorktreesOptions {
  since?: string;
  until?: string;
  json?: boolean;
}

export async function runWorktrees(opts: WorktreesOptions): Promise<void> {
  await ensureAgent();
  const q = new URLSearchParams();
  if (opts.since) q.set('since', opts.since);
  if (opts.until) q.set('until', opts.until);
  const qs = q.toString();
  const data = await agentGet<{ worktrees: WorktreeSummary[] }>(`/worktrees${qs ? `?${qs}` : ''}`);
  if (opts.json) {
    printJson(data);
    return;
  }
  printSection('Worktrees');
  console.log(renderWorktreeTable(data.worktrees));
}
