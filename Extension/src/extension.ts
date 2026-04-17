import * as vscode from 'vscode';
import { agentDelete, agentGet, agentPost, ensureAgent } from './agent-client';
import { createStatusBar } from './status-bar';
import { currentWorkspacePath } from './workspace';
import type { PaceResponse, ProviderDetailResponse, ProviderListResponse, ProviderListRow, ProviderSnapshot } from './types';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  try {
    await ensureAgent(context);
  } catch (err) {
    vscode.window.showErrorMessage(`Worktrace agent failed to start: ${errorMessage(err)}`);
    return;
  }

  createStatusBar(context);

  context.subscriptions.push(

    // ----- showUsage: full webview panel with all provider quota cards -----
    vscode.commands.registerCommand('worktrace.showUsage', async () => {
      await runSafeCommand(async () => {
        const list = await agentGet<ProviderListResponse>('/providers');
        const available = list.providers.filter((p) => p.available !== false && p.live);
        if (available.length === 0) {
          vscode.window.showInformationMessage('No providers configured.');
          return;
        }
        const details = await Promise.all(
          available.map((p) => agentGet<ProviderDetailResponse>(`/providers/${encodeURIComponent(p.id)}`).catch(() => null)),
        );
        const panel = vscode.window.createWebviewPanel(
          'worktrace.usage',
          'Worktrace — Usage',
          vscode.ViewColumn.One,
          { enableScripts: false },
        );
        panel.webview.html = buildUsageHtml(details.filter((d): d is ProviderDetailResponse => d !== null));
      });
    }),

    // ----- showProviders: quick-pick → provider detail webview -----
    vscode.commands.registerCommand('worktrace.showProviders', async () => {
      await runSafeCommand(async () => {
        const list = await agentGet<ProviderListResponse>('/providers');
        const picks = list.providers
          .filter((p) => p.available !== false && p.live)
          .map((p) => toProviderQuickPick(p));
        if (picks.length === 0) {
          vscode.window.showInformationMessage('No live providers found.');
          return;
        }
        const pick = await vscode.window.showQuickPick(picks, { placeHolder: 'Select a provider' });
        if (!pick) return;
        const detail = await agentGet<ProviderDetailResponse>(`/providers/${encodeURIComponent(pick.id)}`);
        const panel = vscode.window.createWebviewPanel(
          'worktrace.provider',
          `Worktrace — ${detail.descriptor.metadata.displayName}`,
          vscode.ViewColumn.One,
          { enableScripts: false },
        );
        panel.webview.html = buildUsageHtml([detail]);
      });
    }),

    // ----- showPace: notification with pace summary -----
    vscode.commands.registerCommand('worktrace.showPace', async () => {
      await runSafeCommand(async () => {
        const pace = await agentGet<PaceResponse>('/pace');
        if (pace.providers.length === 0) {
          vscode.window.showInformationMessage('No live providers found.');
          return;
        }
        const lines = pace.providers.map((row) => {
          if (!row.pace || !row.quota) return `${row.icon} ${row.displayName}: no data`;
          const delta = row.pace.paceDelta;
          const sign = delta >= 0 ? '+' : '';
          return `${row.icon} ${row.displayName}  ${row.pace.actualPct.toFixed(0)}% used  pace ${sign}${delta.toFixed(1)}%  [${row.pace.status}]`;
        });
        vscode.window.showInformationMessage(lines.join('\n'));
      });
    }),

    // ----- watchRepo / unwatchRepo -----
    vscode.commands.registerCommand('worktrace.watchRepo', async () => {
      await runSafeCommand(async () => {
        const ws = currentWorkspacePath();
        if (!ws) { vscode.window.showWarningMessage('No workspace open.'); return; }
        await agentPost('/watch', { path: ws });
        vscode.window.showInformationMessage(`Watching ${ws}`);
      });
    }),

    vscode.commands.registerCommand('worktrace.unwatchRepo', async () => {
      await runSafeCommand(async () => {
        const ws = currentWorkspacePath();
        if (!ws) { vscode.window.showWarningMessage('No workspace open.'); return; }
        await agentDelete(`/watch?path=${encodeURIComponent(ws)}`);
        vscode.window.showInformationMessage(`Stopped watching ${ws}`);
      });
    }),

    // ----- showReport: full JSON in editor -----
    vscode.commands.registerCommand('worktrace.showReport', async () => {
      await runSafeCommand(async () => {
        const report = await agentGet<unknown>('/report?period=7d');
        await openJsonDocument(report);
      });
    }),

    // ----- refreshAll -----
    vscode.commands.registerCommand('worktrace.refreshAll', async () => {
      await runSafeCommand(async () => {
        await agentGet('/usage?refresh=1');
        vscode.window.showInformationMessage('Provider snapshots refreshed.');
      });
    }),
  );
}

export function deactivate(): void { /* agent remains detached */ }

// ---------------------------------------------------------------------------
// HTML webview builder
// ---------------------------------------------------------------------------

function buildUsageHtml(details: ProviderDetailResponse[]): string {
  const cards = details.map((d) => buildProviderCard(d)).join('\n');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Worktrace Usage</title>
<style>
  :root {
    --bg: #1e1e2e;
    --card: #2a2a3e;
    --border: #3a3a5c;
    --text: #cdd6f4;
    --dim: #7f849c;
    --cyan: #89dceb;
    --green: #a6e3a1;
    --yellow: #f9e2af;
    --red: #f38ba8;
    --blue: #89b4fa;
    --mauve: #cba6f7;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg); color: var(--text); font-family: 'Segoe UI', system-ui, monospace; padding: 20px; }
  h1 { font-size: 18px; color: var(--cyan); margin-bottom: 20px; letter-spacing: 0.05em; }
  .cards { display: flex; flex-direction: column; gap: 16px; max-width: 640px; }
  .card { background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 18px 20px; }
  .card-header { display: flex; align-items: baseline; gap: 10px; margin-bottom: 12px; }
  .card-icon { font-size: 20px; }
  .card-name { font-size: 16px; font-weight: 600; color: var(--text); }
  .card-vendor { font-size: 12px; color: var(--dim); }
  .identity { font-size: 12px; color: var(--dim); margin-bottom: 14px; }
  .identity .plan { color: var(--cyan); margin-left: 8px; }
  .bar-block { margin-bottom: 12px; }
  .bar-label { font-size: 11px; color: var(--dim); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 5px; }
  .bar-row { display: flex; align-items: center; gap: 10px; }
  .bar-track { flex: 1; height: 8px; background: #313147; border-radius: 4px; overflow: hidden; }
  .bar-fill { height: 100%; border-radius: 4px; transition: width 0.4s ease; }
  .bar-fill.green  { background: var(--green); }
  .bar-fill.yellow { background: var(--yellow); }
  .bar-fill.red    { background: var(--red); }
  .bar-value { font-size: 13px; font-weight: 500; min-width: 52px; text-align: right; }
  .bar-reset { font-size: 11px; color: var(--dim); margin-left: 6px; }
  .divider { height: 1px; background: var(--border); margin: 12px 0; }
  .meta-grid { display: grid; grid-template-columns: auto 1fr; gap: 3px 16px; font-size: 12px; }
  .meta-key { color: var(--dim); }
  .meta-val { color: var(--text); font-weight: 500; }
  .models { margin-top: 10px; }
  .models-title { font-size: 11px; color: var(--dim); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 6px; }
  .model-row { display: flex; justify-content: space-between; font-size: 12px; padding: 2px 0; }
  .model-name { color: var(--text); }
  .model-tokens { color: var(--blue); }
  .updated { font-size: 11px; color: var(--dim); margin-top: 14px; }
  .no-data { color: var(--dim); font-size: 13px; padding: 8px 0; }
</style>
</head>
<body>
<h1>⠿ Worktrace — Usage</h1>
<div class="cards">${cards}</div>
<script>
  // Auto-refresh handled by re-opening the command
</script>
</body>
</html>`;
}

function buildProviderCard(d: ProviderDetailResponse): string {
  const desc = d.descriptor;
  const s = d.snapshot;

  const header = `
    <div class="card-header">
      <span class="card-icon">${desc.branding.icon}</span>
      <span class="card-name">${esc(desc.metadata.displayName)}</span>
      <span class="card-vendor">${esc(desc.metadata.vendor)}</span>
    </div>`;

  if (!s) {
    return `<div class="card">${header}<p class="no-data">Not configured</p></div>`;
  }

  const identity = s.identity ? (() => {
    const parts: string[] = [];
    if (s.identity?.email) parts.push(`<span>${esc(s.identity.email)}</span>`);
    if (s.identity?.plan)  parts.push(`<span class="plan">${esc(s.identity.plan)}</span>`);
    return parts.length ? `<div class="identity">${parts.join('')}</div>` : '';
  })() : '';

  const bars = [s.session, s.weekly, s.secondary]
    .filter((b): b is typeof s.session & {} => !!b)
    .filter((b, i, arr) => arr.findIndex((x) => x!.used === b!.used && x!.cap === b!.cap) === i)
    .map((bar) => buildBarHtml(bar!))
    .join('');

  const metaRows: string[] = [];
  if (typeof s.inputTokens === 'number' || typeof s.outputTokens === 'number') {
    const tot = (s.inputTokens ?? 0) + (s.outputTokens ?? 0);
    metaRows.push(`<span class="meta-key">tokens today</span><span class="meta-val">${fmtTok(tot)} total  (↑${fmtTok(s.inputTokens ?? 0)} in / ↓${fmtTok(s.outputTokens ?? 0)} out)</span>`);
  }
  if (s.cost?.totalTokens) {
    metaRows.push(`<span class="meta-key">tokens /30d</span><span class="meta-val">${fmtTok(s.cost.totalTokens)}${s.cost.todayTokens ? `  today ${fmtTok(s.cost.todayTokens)}` : ''}</span>`);
  }
  if (typeof s.sessionCount === 'number' && s.sessionCount > 0) {
    metaRows.push(`<span class="meta-key">sessions</span><span class="meta-val">${s.sessionCount} today</span>`);
  }
  if (s.cost && (s.cost.today > 0 || s.cost.last30d > 0)) {
    if (s.cost.today > 0)   metaRows.push(`<span class="meta-key">cost today</span><span class="meta-val">$${s.cost.today.toFixed(4)}</span>`);
    if (s.cost.last30d > 0) metaRows.push(`<span class="meta-key">cost /30d</span><span class="meta-val">$${s.cost.last30d.toFixed(2)}</span>`);
  }
  if (typeof s.creditsRemainingUSD === 'number') {
    metaRows.push(`<span class="meta-key">credits remaining</span><span class="meta-val">$${s.creditsRemainingUSD.toFixed(2)}</span>`);
  }

  const meta = metaRows.length ? `<div class="divider"></div><div class="meta-grid">${metaRows.join('')}</div>` : '';

  const models = (s.modelBreakdown && s.modelBreakdown.length > 0) ? `
    <div class="models">
      <div class="models-title">Models</div>
      ${s.modelBreakdown.slice(0, 5).map((m) => `
        <div class="model-row">
          <span class="model-name">${esc(m.model)}</span>
          <span class="model-tokens">${fmtTok(m.tokens)}</span>
        </div>`).join('')}
    </div>` : '';

  const updatedMs = typeof s.updatedAt === 'number' ? s.updatedAt : Date.parse(String(s.updatedAt));
  const updated = updatedMs ? `<div class="updated">updated ${fmtRelative(updatedMs)}</div>` : '';

  return `<div class="card">${header}${identity}${bars}${meta}${models}${updated}</div>`;
}

function buildBarHtml(bar: { used: number; cap: number; unit: string; resetsAt: string | number; label?: string }): string {
  const ratio = Math.min(1, bar.cap > 0 ? bar.used / bar.cap : 0);
  const colorClass = ratio >= 0.9 ? 'red' : ratio >= 0.75 ? 'yellow' : 'green';
  const pct = `${(ratio * 100).toFixed(0)}%`;
  const label = bar.label ?? 'quota';
  const isPercent = bar.cap === 100;

  const resetsMs = typeof bar.resetsAt === 'number' ? bar.resetsAt : Date.parse(String(bar.resetsAt));
  const resetStr = resetsMs ? `resets ${fmtRelative(resetsMs)}` : '';

  const valueStr = isPercent
    ? `${bar.used.toFixed(1)}%`
    : `${fmtNum(bar.used)}/${fmtNum(bar.cap)} ${bar.unit}`;

  return `
    <div class="bar-block">
      <div class="bar-label">${esc(label)}</div>
      <div class="bar-row">
        <div class="bar-track">
          <div class="bar-fill ${colorClass}" style="width:${pct}"></div>
        </div>
        <span class="bar-value" style="color:var(--${colorClass === 'green' ? 'green' : colorClass === 'yellow' ? 'yellow' : 'red'})">${valueStr}</span>
        ${resetStr ? `<span class="bar-reset">${esc(resetStr)}</span>` : ''}
      </div>
    </div>`;
}

function fmtTok(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function fmtNum(n: number): string {
  return Number.isInteger(n) ? n.toLocaleString() : n.toFixed(1);
}

function fmtRelative(targetMs: number): string {
  const delta = targetMs - Date.now();
  if (Math.abs(delta) < 60_000) return 'just now';
  if (delta < 0) {
    const ago = -delta;
    if (ago < 3_600_000) return `${Math.round(ago / 60_000)}m ago`;
    return `${(ago / 3_600_000).toFixed(1)}h ago`;
  }
  const h = delta / 3_600_000;
  const d = h / 24;
  if (h < 1) return `in ${Math.round(delta / 60_000)}m`;
  if (h < 24) return `in ${h.toFixed(1)}h`;
  if (d < 7) return `in ${Math.round(d)}d`;
  return new Date(targetMs).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toProviderQuickPick(provider: ProviderListRow): vscode.QuickPickItem & { id: string } {
  return {
    id: provider.id,
    label: provider.displayName,
    description: provider.id,
    detail: `${provider.vendor} · ${provider.category}`,
  };
}

async function openJsonDocument(payload: unknown): Promise<void> {
  const doc = await vscode.workspace.openTextDocument({ language: 'json', content: JSON.stringify(payload, null, 2) });
  await vscode.window.showTextDocument(doc, { preview: true });
}

async function runSafeCommand(fn: () => Promise<void>): Promise<void> {
  try { await fn(); } catch (err) { vscode.window.showErrorMessage(errorMessage(err)); }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
