import * as vscode from 'vscode';
import { agentGet } from './agent-client';
import type { PaceResponse, PaceProvider, ProviderDetailResponse, ProviderListResponse } from './types';

const CYCLE_MS = 15_000;

/** Format a percent quota bar as "label  XX%" */
function fmtPct(used: number, label: string): string {
  return `${label} ${used.toFixed(0)}%`;
}

/** Format a non-percent bar as "label  used/cap unit" */
function fmtBar(used: number, cap: number, unit: string, label?: string): string {
  const u = unit === 'requests' ? 'req' : unit === 'tokens' ? 'tok' : unit;
  const prefix = label ? `${label} ` : '';
  return `${prefix}${formatNum(used)}/${formatNum(cap)} ${u}`;
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function formatRelative(targetMs: number): string {
  const delta = targetMs - Date.now();
  if (delta <= 0) return 'soon';
  const h = delta / 3_600_000;
  const d = h / 24;
  if (h < 1) return `${Math.round(delta / 60000)}m`;
  if (h < 24) return `${h.toFixed(1)}h`;
  if (d < 7) return `${Math.round(d)}d`;
  return new Date(targetMs).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Build the status bar text for one provider row */
function buildStatusText(row: PaceProvider, snap: ProviderDetailResponse | null): string {
  const icon = row.icon;
  const name = row.displayName;

  if (!snap?.snapshot) {
    if (!row.quota) return `${icon} ${name}: —`;
    const pct = row.pace?.actualPct.toFixed(0) ?? '?';
    return `${icon} ${name} ${pct}%`;
  }

  const s = snap.snapshot;

  // Cursor: show auto% and API% from labeled bars
  if (row.id === 'cursor') {
    const total = s.weekly;
    const auto  = s.session;
    const api   = s.secondary;
    const parts: string[] = [];
    if (total) parts.push(`${total.used.toFixed(0)}% total`);
    if (auto)  parts.push(`${auto.used.toFixed(0)}% auto`);
    if (api)   parts.push(`${api.used.toFixed(0)}% api`);
    return `${icon} ${name}  ${parts.join('  ·  ')}`;
  }

  // Codex / Claude: show 5h and weekly
  if (row.id === 'codex' || row.id === 'claude') {
    const fiveH  = s.session;
    const weekly = s.weekly;
    const parts: string[] = [];
    if (fiveH)  parts.push(`${fiveH.used.toFixed(0)}% 5h`);
    if (weekly) parts.push(`${weekly.used.toFixed(0)}% weekly`);
    if (parts.length > 0) return `${icon} ${name}  ${parts.join('  ·  ')}`;
  }

  // Fallback: use pace data
  if (row.quota) {
    const pct = row.pace?.actualPct.toFixed(0) ?? '?';
    return `${icon} ${name} ${pct}%`;
  }

  return `${icon} ${name}: —`;
}

/** Build the tooltip for one provider */
function buildTooltip(row: PaceProvider, snap: ProviderDetailResponse | null): string {
  const lines: string[] = [row.displayName];
  const s = snap?.snapshot;

  if (!s) {
    lines.push(row.error ?? 'No data');
    return lines.join('\n');
  }

  // Identity
  if (s.identity?.email) lines.push(s.identity.email);
  if (s.identity?.plan)  lines.push(s.identity.plan);
  lines.push('');

  // All quota bars
  for (const bar of [s.session, s.weekly, s.secondary]) {
    if (!bar) continue;
    const lbl = bar.label ?? 'quota';
    const resetsAt = typeof bar.resetsAt === 'number' ? bar.resetsAt : Date.parse(String(bar.resetsAt));
    const reset = formatRelative(resetsAt);
    if (bar.cap === 100) {
      lines.push(`${lbl}: ${bar.used.toFixed(1)}%  (resets ${reset})`);
    } else {
      lines.push(`${lbl}: ${bar.used}/${bar.cap} ${bar.unit}  (resets ${reset})`);
    }
  }

  // Cost / tokens
  if (s.cost?.totalTokens) lines.push(`\ntokens/30d: ${formatNum(s.cost.totalTokens)}`);
  if (s.cost && (s.cost.today > 0 || s.cost.last30d > 0)) {
    if (s.cost.today > 0)  lines.push(`cost today: $${s.cost.today.toFixed(4)}`);
    if (s.cost.last30d > 0) lines.push(`cost /30d:  $${s.cost.last30d.toFixed(2)}`);
  }

  // Pace
  if (row.pace) {
    const delta = row.pace.paceDelta;
    const sign = delta >= 0 ? '+' : '';
    lines.push(`\npace: ${sign}${delta.toFixed(1)}%  (${row.pace.status})`);
  }

  const updatedMs = typeof s.updatedAt === 'number' ? s.updatedAt : Date.parse(String(s.updatedAt));
  if (updatedMs) lines.push(`updated: ${formatRelative(updatedMs)} ago`);

  return lines.join('\n');
}

export function createStatusBar(context: vscode.ExtensionContext): vscode.StatusBarItem {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  item.command = 'worktrace.showUsage';
  item.show();
  context.subscriptions.push(item);

  // Cache of detail snapshots per provider, refreshed alongside pace
  const detailCache = new Map<string, ProviderDetailResponse>();
  let cycleIndex = 0;

  const tick = async () => {
    try {
      const pace = await agentGet<PaceResponse>('/pace');
      if (pace.providers.length === 0) {
        item.text = '$(pulse) Worktrace';
        item.tooltip = 'No live providers found';
        item.color = undefined;
        return;
      }

      // Refresh detail for all providers (fire in background, update cache)
      for (const row of pace.providers) {
        agentGet<ProviderDetailResponse>(`/providers/${encodeURIComponent(row.id)}`)
          .then((d) => { detailCache.set(row.id, d); })
          .catch(() => { /* keep stale */ });
      }

      const row = pace.providers[cycleIndex % pace.providers.length];
      cycleIndex++;

      const snap = detailCache.get(row.id) ?? null;
      item.text = buildStatusText(row, snap);
      item.tooltip = new vscode.MarkdownString(
        buildTooltip(row, snap).split('\n').map((l) => `${l}  `).join('\n'),
        true,
      );

      item.color =
        row.pace?.status === 'critical' ? new vscode.ThemeColor('errorForeground') :
        row.pace?.status === 'warning'  ? new vscode.ThemeColor('editorWarning.foreground') :
        undefined;

    } catch (err) {
      item.text = '$(warning) Worktrace';
      item.tooltip = err instanceof Error ? err.message : String(err);
      item.color = new vscode.ThemeColor('errorForeground');
    }
  };

  const timer = setInterval(() => { void tick(); }, CYCLE_MS);
  context.subscriptions.push({ dispose: () => clearInterval(timer) });
  void tick();
  return item;
}
