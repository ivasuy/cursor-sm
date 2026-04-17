import { ensureAgent, agentGet } from '../agent-client.js';
import Table from 'cli-table3';
import { renderFeatureTable } from '../render/table.js';
import { printJson, printSection } from '../output.js';
import type { FeatureSummary } from '../types.js';

export interface FeaturesOptions {
  branch?: string;
  since?: string;
  until?: string;
  json?: boolean;
}

export async function runFeatures(opts: FeaturesOptions): Promise<void> {
  await ensureAgent();
  if (opts.branch) {
    const q = new URLSearchParams();
    if (opts.since) q.set('since', opts.since);
    if (opts.until) q.set('until', opts.until);
    const qs = q.toString();
    const data = await agentGet<{ branch: string; files: Array<{ file_path: string; event_type: string; changed_at: number; provider: string | null; worktree_id: number; }> }>(
      `/features/${encodeURIComponent(opts.branch)}${qs ? `?${qs}` : ''}`
    );
    if (opts.json) {
      printJson(data);
      return;
    }
    printSection(`Feature ${data.branch}`);
    const table = new Table({
      head: ['File', 'Event', 'Provider', 'Changed At'],
      style: { head: [], border: [] },
      wordWrap: true,
    });
    for (const row of data.files) {
      table.push([
        row.file_path,
        row.event_type,
        row.provider ?? '—',
        new Date(row.changed_at).toLocaleString(),
      ]);
    }
    console.log(table.toString());
    return;
  }

  const q = new URLSearchParams();
  if (opts.since) q.set('since', opts.since);
  if (opts.until) q.set('until', opts.until);
  const qs = q.toString();
  const data = await agentGet<{ features: FeatureSummary[] }>(`/features${qs ? `?${qs}` : ''}`);
  if (opts.json) {
    printJson(data);
    return;
  }
  printSection('Features');
  console.log(renderFeatureTable(data.features));
}
