import Table from 'cli-table3';
import { palette } from './colors.js';
import type { FeatureSummary, FileSummary, ProviderAmount, RepoSummary, WorktreeSummary } from '../types.js';

export function renderRepoTable(rows: RepoSummary[], color = true): string {
  const p = palette(color);
  const table = new Table({
    head: [p.bold('Repo'), p.bold('Path'), p.bold('Usage')],
    style: { head: [], border: [] },
    wordWrap: true,
  });
  for (const row of rows) {
    table.push([p.cyan(row.name), p.dim(row.path), formatBreakdown(row.perProvider)]);
  }
  return table.toString();
}

export function renderWorktreeTable(rows: WorktreeSummary[], color = true): string {
  const p = palette(color);
  const table = new Table({
    head: [p.bold('Worktree'), p.bold('Branch'), p.bold('Usage')],
    style: { head: [], border: [] },
    wordWrap: true,
  });
  for (const row of rows) {
    table.push([
      p.cyan(row.path),
      row.branch ?? 'HEAD',
      formatBreakdown(row.perProvider),
    ]);
  }
  return table.toString();
}

export function renderFeatureTable(rows: FeatureSummary[], color = true): string {
  const p = palette(color);
  const table = new Table({
    head: [p.bold('Branch'), p.bold('Path'), p.bold('Usage')],
    style: { head: [], border: [] },
    wordWrap: true,
  });
  for (const row of rows) {
    table.push([p.cyan(row.branch), p.dim(row.path), formatBreakdown(row.perProvider)]);
  }
  return table.toString();
}

export function renderFileTable(rows: FileSummary[], color = true): string {
  const p = palette(color);
  const table = new Table({
    head: [p.bold('File'), p.bold('Events'), p.bold('Branch')],
    style: { head: [], border: [] },
    wordWrap: true,
  });
  for (const row of rows) {
    table.push([p.dim(row.path), String(row.eventCount), row.branch]);
  }
  return table.toString();
}

function formatBreakdown(entries: ProviderAmount[]): string {
  if (entries.length === 0) return '—';
  return entries.map((entry) => `${entry.provider}:${formatUnit(entry.amount, entry.unit)}`).join('  ');
}

function formatUnit(amount: number, unit: string): string {
  if (unit === 'credits') return `$${amount.toFixed(2)}`;
  if (unit === 'requests') return `${Math.round(amount)}req`;
  if (unit === 'tokens') return `${Math.round(amount)}tok`;
  if (unit === 'messages') return `${Math.round(amount)}msg`;
  return `${amount.toFixed(2)} ${unit}`;
}
