import boxen from 'boxen';
import { renderProgressBar } from './progress-bar.js';
import { palette } from './colors.js';
import type { ProviderDescriptor, UsageSnapshot, QuotaBar } from '../types.js';

export interface QuotaCardInput {
  descriptor: ProviderDescriptor;
  snapshot: UsageSnapshot | null;
  color?: boolean;
  compact?: boolean;
}

export function renderQuotaCard(input: QuotaCardInput): string {
  const p = palette(input.color !== false);
  const { descriptor, snapshot } = input;

  const title = `${descriptor.branding.icon}  ${p.bold(descriptor.metadata.displayName)}  ${p.dim(descriptor.metadata.vendor)}`;

  if (!snapshot) {
    return boxen(`${title}\n${p.dim('  not configured')}`, {
      padding: { top: 0, bottom: 0, left: 1, right: 1 },
      borderStyle: 'round',
      borderColor: 'gray',
    });
  }

  const lines: string[] = [title];

  // Identity row
  if (snapshot.identity) {
    const idParts: string[] = [];
    if (snapshot.identity.email) idParts.push(snapshot.identity.email);
    if (snapshot.identity.plan) idParts.push(p.cyan(snapshot.identity.plan));
    if (idParts.length) lines.push(p.dim('  ') + idParts.join('  ·  '));
  }
  lines.push('');

  // Render quota bars in the order: session → weekly → secondary
  // Skip bars that are identical to already-rendered ones (same used+cap)
  const rendered = new Set<string>();

  function renderBar(bar: QuotaBar | undefined): boolean {
    if (!bar) return false;
    const key = `${bar.used}|${bar.cap}`;
    if (rendered.has(key)) return false;
    rendered.add(key);

    const resetsAt = toEpochMs(bar.resetsAt);
    const resetLabel = resetsAt ? `resets ${formatRelative(resetsAt)}` : undefined;
    const barLabel = bar.label ?? (bar === snapshot?.session ? 'session' : bar === snapshot?.weekly ? 'quota' : 'usage');
    const pctDisplay = bar.cap === 100
      ? `${bar.used.toFixed(1)}%`
      : undefined; // handled by progress bar for non-% bars

    const isPercentBar = bar.cap === 100;

    lines.push(p.dim(`  ${barLabel.padEnd(18)}`));
    lines.push('  ' + renderProgressBar({
      used: bar.used,
      limit: bar.cap,
      width: 28,
      color: input.color,
      suffix: resetLabel,
      isPercent: isPercentBar,
    }));
    return true;
  }

  renderBar(snapshot.session);
  renderBar(snapshot.weekly);
  renderBar(snapshot.secondary);

  // Extra usage bar (acceptance rate etc.)
  if (snapshot.extraUsage) {
    const eu = snapshot.extraUsage;
    lines.push('');
    lines.push(p.dim(`  ${eu.label.padEnd(18)}`));
    lines.push('  ' + renderProgressBar({ used: eu.used, limit: eu.cap > 0 ? eu.cap : eu.used, width: 28, color: input.color, unit: eu.unit === '%' ? undefined : eu.unit, isPercent: eu.unit === '%' }));
  }

  // Token breakdown
  if (typeof snapshot.inputTokens === 'number' || typeof snapshot.outputTokens === 'number') {
    const inTok = snapshot.inputTokens ?? 0;
    const outTok = snapshot.outputTokens ?? 0;
    lines.push('');
    lines.push(
      p.dim('  tokens            ') +
      p.white(`${formatTokens(inTok + outTok)} total  `) +
      p.gray(`↑${formatTokens(inTok)} in  ↓${formatTokens(outTok)} out`),
    );
  }

  // Session count
  if (typeof snapshot.sessionCount === 'number' && snapshot.sessionCount > 0) {
    lines.push(p.dim('  sessions          ') + p.white(`${snapshot.sessionCount}`) + p.dim(' today'));
  }

  // Total 30d token volume
  if (snapshot.cost?.totalTokens && snapshot.cost.totalTokens > 0) {
    const todayTok = snapshot.cost.todayTokens;
    const todayLabel = todayTok && todayTok > 0 ? `  ${p.dim('today')} ${p.gray(formatTokens(todayTok))}` : '';
    lines.push(p.dim('  tokens/30d        ') + p.white(formatTokens(snapshot.cost.totalTokens)) + todayLabel);
  }

  // Cost
  const hasCostData = snapshot.cost
    ? (snapshot.cost.today > 0 || snapshot.cost.last30d > 0)
    : typeof snapshot.costUSD === 'number' && snapshot.costUSD > 0;

  if (hasCostData) {
    lines.push('');
    if (snapshot.cost && (snapshot.cost.today > 0 || snapshot.cost.last30d > 0)) {
      const todayStr = snapshot.cost.today > 0 ? `$${snapshot.cost.today.toFixed(4)}` : p.dim('—');
      const last30dStr = snapshot.cost.last30d > 0 ? `$${snapshot.cost.last30d.toFixed(2)}` : p.dim('—');
      lines.push(p.dim('  cost              ') + p.white(todayStr) + p.dim(' today    ') + p.gray(last30dStr) + p.dim(' /30d'));
    } else if (typeof snapshot.costUSD === 'number') {
      lines.push(p.dim('  cost              ') + p.white(`$${snapshot.costUSD.toFixed(4)}`));
    }
  }

  if (typeof snapshot.creditsRemainingUSD === 'number') {
    lines.push(p.dim('  credits remaining ') + p.green(`$${snapshot.creditsRemainingUSD.toFixed(2)}`));
  }

  // Model breakdown
  if (snapshot.modelBreakdown && snapshot.modelBreakdown.length > 0 && !input.compact) {
    lines.push('');
    lines.push(p.dim('  models'));
    for (const m of snapshot.modelBreakdown.slice(0, 5)) {
      const tokStr = formatTokens(m.tokens).padEnd(9);
      const costStr = m.costUSD > 0 ? `  ~$${m.costUSD.toFixed(2)}` : '';
      lines.push(p.dim('    · ') + m.model.padEnd(22) + p.white(tokStr) + p.dim(costStr));
    }
  }

  // Last updated
  const updatedAt = toEpochMs(snapshot.updatedAt);
  if (updatedAt) {
    lines.push('');
    lines.push(p.dim(`  updated ${formatUpdatedAt(updatedAt)}`));
  }

  return boxen(lines.join('\n'), {
    padding: { top: 0, bottom: 0, left: 1, right: 2 },
    borderStyle: 'round',
    borderColor: statusBorderColor(snapshot),
  });
}

function statusBorderColor(snapshot: UsageSnapshot): string {
  const primary = snapshot.weekly ?? snapshot.session ?? snapshot.secondary ?? null;
  if (!primary || primary.cap <= 0) return 'cyan';
  const ratio = primary.used / primary.cap;
  if (ratio >= 0.9) return 'red';
  if (ratio >= 0.75) return 'yellow';
  return 'cyan';
}

function formatTokens(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
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

function formatUpdatedAt(ms: number): string {
  const delta = Date.now() - ms;
  if (delta < 60_000) return 'just now';
  if (delta < 3600_000) return `${Math.round(delta / 60_000)}m ago`;
  return new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function toEpochMs(value: unknown): number | null {
  if (!value) return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  const ts = Date.parse(String(value));
  return Number.isNaN(ts) ? null : ts;
}
