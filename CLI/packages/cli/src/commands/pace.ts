import { ensureAgent, agentGet } from '../agent-client.js';
import { renderProgressBar } from '../render/progress-bar.js';
import { palette } from '../render/colors.js';
import { printJson, printSection } from '../output.js';
import type { PaceResponse, PaceStatus } from '../types.js';

export interface PaceOptions { json?: boolean; }

export async function runPace(opts: PaceOptions): Promise<void> {
  await ensureAgent();
  const data = await agentGet<PaceResponse>('/pace');
  if (opts.json) {
    printJson(data);
    return;
  }

  const p = palette(true);
  printSection('Pace');
  if (data.providers.length === 0) {
    console.log(p.dim('  No live providers configured'));
    return;
  }

  for (const row of data.providers) {
    const status = row.pace?.status ?? 'on-track';
    const statusLabel = formatStatusLabel(status, p);

    if (!row.pace || !row.quota) {
      console.log(`\n  ${row.icon}  ${p.bold(row.displayName.padEnd(18))}  ${statusLabel}  ${p.dim(row.error ?? 'no quota data')}`);
      continue;
    }

    const { actualPct, expectedPct, paceDelta, burnRatePerMs, runwayMs, etaAt } = row.pace;
    const { used, limit, unit, resetsAt } = row.quota;

    // Main progress bar
    const unitShort = unit === 'requests' ? 'req' : unit === 'tokens' ? 'tok' : unit;
    const bar = renderProgressBar({
      used,
      limit,
      width: 24,
      color: true,
    });

    // Pace delta indicator
    const deltaSign = paceDelta >= 0 ? '+' : '';
    const deltaColored = paceDelta > 15 ? p.red(`${deltaSign}${paceDelta.toFixed(1)}%`)
      : paceDelta > 5 ? p.yellow(`${deltaSign}${paceDelta.toFixed(1)}%`)
      : p.green(`${deltaSign}${paceDelta.toFixed(1)}%`);

    // Burn rate
    const burnPerHour = burnRatePerMs * 60 * 60 * 1000;
    const burnLabel = burnPerHour > 0
      ? p.dim(`${formatBurnRate(burnPerHour, unit)}/h`)
      : '';

    // Runway / ETA
    const runwayLabel = formatRunway(runwayMs, etaAt, resetsAt, p);

    // Expected vs actual
    const vsLabel = p.dim(`exp ${expectedPct.toFixed(0)}%  act ${actualPct.toFixed(0)}%`);

    // Reset timer
    const resetLabel = resetsAt ? p.dim(`resets ${formatRelative(resetsAt)}`) : '';

    console.log('');
    console.log(`  ${row.icon}  ${p.bold(row.displayName.padEnd(18))}  ${statusLabel}`);
    console.log(`       ${bar}`);
    console.log(`       ${p.dim(`${formatNumber(used)}/${formatNumber(limit)} ${unitShort}`)}  ·  ${vsLabel}  ·  pace ${deltaColored}`);
    if (burnLabel || runwayLabel || resetLabel) {
      const extras = [burnLabel, runwayLabel, resetLabel].filter(Boolean).join('  ·  ');
      console.log(`       ${extras}`);
    }
  }
  console.log('');
}

function formatStatusLabel(status: PaceStatus, p: ReturnType<typeof palette>): string {
  const label = status.toUpperCase().padEnd(9);
  if (status === 'critical') return p.red(label);
  if (status === 'warning') return p.yellow(label);
  if (status === 'ahead') return p.cyan(label);
  return p.green(label);
}

function formatBurnRate(perHour: number, unit: string): string {
  if (unit === 'tokens') return formatTokens(perHour);
  if (Number.isInteger(perHour)) return String(Math.round(perHour));
  return perHour.toFixed(1);
}

function formatRunway(runwayMs: number | null, etaAt: number | null, resetsAt: number, p: ReturnType<typeof palette>): string {
  if (!runwayMs || !etaAt) return '';
  const now = Date.now();
  const resetDelta = resetsAt - now;

  if (etaAt <= resetsAt) {
    // Will exhaust before reset
    const delta = etaAt - now;
    if (delta <= 0) return p.red('quota exhausted');
    return p.yellow(`exhausts ${formatAbsDate(etaAt)}`);
  }
  // Will survive until reset
  const runwayDays = runwayMs / (24 * 60 * 60 * 1000);
  return p.green(`runway ${runwayDays.toFixed(1)}d`);
}

function formatAbsDate(ms: number): string {
  const d = new Date(ms);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return `today ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatRelative(targetMs: number): string {
  const delta = targetMs - Date.now();
  if (delta <= 0) return 'soon';
  const hours = delta / (60 * 60 * 1000);
  const days = hours / 24;
  if (hours < 1) return `${Math.round(delta / 60000)}m`;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  if (days < 7) return `${Math.round(days)}d`;
  const d = new Date(targetMs);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatNumber(n: number): string {
  return Number.isInteger(n) ? n.toLocaleString() : n.toFixed(2);
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}
