import { ensureAgent, agentGet } from '../agent-client.js';
import { renderRepoTable } from '../render/table.js';
import { printJson, printSection } from '../output.js';
import type { RepoSummary } from '../types.js';

export interface ReposOptions {
  since?: string;
  until?: string;
  json?: boolean;
}

export async function runRepos(opts: ReposOptions): Promise<void> {
  await ensureAgent();
  const q = new URLSearchParams();
  if (opts.since) q.set('since', opts.since);
  if (opts.until) q.set('until', opts.until);
  const qs = q.toString();
  const data = await agentGet<{ repos: RepoSummary[] }>(`/repos${qs ? `?${qs}` : ''}`);
  if (opts.json) {
    printJson(data);
    return;
  }
  printSection('Repos');
  console.log(renderRepoTable(data.repos));
}
