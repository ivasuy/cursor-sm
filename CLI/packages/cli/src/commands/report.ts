import { ensureAgent, agentGet } from '../agent-client.js';
import { renderQuotaCard } from '../render/quota-card.js';
import { renderRepoTable, renderWorktreeTable, renderFeatureTable, renderFileTable } from '../render/table.js';
import { printJson, printSection, printTitle } from '../output.js';
import type { ReportResponse } from '../types.js';

export interface ReportOptions { json?: boolean; period?: string; }

export async function runReport(opts: ReportOptions): Promise<void> {
  await ensureAgent();
  const q = opts.period ? `?period=${encodeURIComponent(opts.period)}` : '';
  const data = await agentGet<ReportResponse>(`/report${q}`);
  if (opts.json) {
    printJson(data);
    return;
  }

  const since = new Date(data.range.since).toLocaleString();
  const until = new Date(data.range.until).toLocaleString();
  printTitle(`Worktrace Report (${since} -> ${until})`);

  printSection('Providers');
  if (data.providers.length === 0) {
    console.log('No provider data');
  } else {
    for (const provider of data.providers) {
      console.log(renderQuotaCard({
        descriptor: provider.descriptor,
        snapshot: provider.snapshot,
      }));
    }
  }

  printSection('Repos');
  console.log(renderRepoTable(data.repos));

  printSection('Worktrees');
  console.log(renderWorktreeTable(data.worktrees));

  printSection('Features');
  console.log(renderFeatureTable(data.features));

  printSection('Files');
  console.log(renderFileTable(data.files));
}
