import { Command } from 'commander';
import { agentGet, agentPost, agentPatch } from '../agent-client.js';
import { table, box, spinner, personality, isJson, jsonOut, g, w, r, d, white, info, banner } from '../output.js';
import { pickMessage } from '../messages.js';

interface QuotaWindow {
  label: string;
  used: number | null;
  limit: number | null;
  remaining: number | null;
  unit: string;
  resetAt: string | null;
}

interface ProviderUsage {
  provider: string;
  displayName: string;
  plan: string | null;
  quotaUsed: number | null;
  quotaLimit: number | null;
  quotaRemaining: number | null;
  quotaUnit: string;
  secondary: QuotaWindow | null;
  tertiary: QuotaWindow | null;
  credits: { balance: number | null; unlimited: boolean; currency: string } | null;
  resetAt: string | null;
  resetWindow: string | null;
  costUsd: number | null;
  status: string;
  lastFetched: string;
  error: string | null;
}

interface AdapterInfo {
  id: string;
  displayName: string;
  capabilities: {
    canFetchQuota: boolean;
    canFetchCost: boolean;
    canFetchPlan: boolean;
    canFetchResetWindow: boolean;
    requiresBrowser: boolean;
    requiresCli: boolean;
    platformSupport: string;
    missingDependencies: string[];
  };
}

// ── Formatting helpers ──────────────────────────────────────────────────

function statusIcon(status: string): string {
  if (status === 'ok') return g('●');
  if (status === 'warning') return w('●');
  if (status === 'exhausted') return r('●');
  if (status === 'error') return r('✗');
  return d('○');
}

function statusLabel(status: string): string {
  if (status === 'ok') return g('ok');
  if (status === 'warning') return w('warning');
  if (status === 'exhausted') return r('exhausted');
  if (status === 'error') return r('error');
  return d('unknown');
}

function quotaBar(used: number | null, limit: number | null, width = 16): string {
  if (used === null || limit === null || limit === 0) return d('—');
  const pct = Math.min(used / limit, 1);
  const filled = Math.round(pct * width);
  const bar = '█'.repeat(filled) + '░'.repeat(width - filled);
  const colorFn = pct >= 1 ? r : pct >= 0.8 ? w : g;
  return colorFn(bar);
}

function quotaPct(used: number | null, limit: number | null): string {
  if (used === null || limit === null || limit === 0) return '';
  const pct = Math.round((used / limit) * 100);
  const colorFn = pct >= 100 ? r : pct >= 80 ? w : g;
  return colorFn(`${pct}%`);
}

function quotaNumbers(used: number | null, limit: number | null, unit: string): string {
  if (used === null && limit === null) return d('no data');
  if (used !== null && limit !== null) return white(`${used}`) + d('/') + white(`${limit}`) + d(` ${unit}`);
  if (used !== null) return white(`${used}`) + d(` ${unit} used`);
  return d('—');
}

function resetLabel(resetAt: string | null, resetWindow: string | null): string {
  if (!resetAt && !resetWindow) return d('—');
  if (resetAt) {
    const diff = new Date(resetAt).getTime() - Date.now();
    if (diff <= 0) return w('reset due');
    const h = Math.floor(diff / 3_600_000);
    const m = Math.floor((diff % 3_600_000) / 60_000);
    if (h > 48) return info(`${Math.floor(h / 24)}d`) + d(` (${resetWindow || ''})`);
    if (h > 0) return info(`${h}h ${m}m`) + d(` (${resetWindow || ''})`);
    return info(`${m}m`) + d(` (${resetWindow || ''})`);
  }
  return d(resetWindow || '');
}

function timeSince(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return d(`${s}s ago`);
  const m = Math.floor(s / 60);
  if (m < 60) return d(`${m}m ago`);
  const h = Math.floor(m / 60);
  return d(`${h}h ago`);
}

// ── Provider detail card ────────────────────────────────────────────────

function renderProviderCard(p: ProviderUsage): string {
  const lines: string[] = [];
  const pad = '  ';

  // Header line
  lines.push(`${pad}${statusIcon(p.status)} ${g(p.displayName)}  ${d('·')}  ${statusLabel(p.status)}  ${d('·')}  ${timeSince(p.lastFetched)}`);
  lines.push('');

  if (p.error) {
    lines.push(`${pad}${r('error:')} ${r(p.error)}`);
    return lines.join('\n');
  }

  // Plan row
  if (p.plan) {
    lines.push(`${pad}${d('plan')}         ${white(p.plan)}`);
  }

  // Primary quota
  if (p.quotaUsed !== null || p.quotaLimit !== null) {
    lines.push(`${pad}${d('quota')}        ${quotaBar(p.quotaUsed, p.quotaLimit)}  ${quotaPct(p.quotaUsed, p.quotaLimit)}`);
    lines.push(`${pad}             ${quotaNumbers(p.quotaUsed, p.quotaLimit, p.quotaUnit)}`);
    if (p.quotaRemaining !== null) {
      lines.push(`${pad}${d('remaining')}    ${g(String(p.quotaRemaining))} ${d(p.quotaUnit)}`);
    }
  } else {
    lines.push(`${pad}${d('quota')}        ${d('no data available')}`);
  }

  // Secondary quota (Opus, Chat, Weekly, 5h rate, etc.)
  if (p.secondary) {
    lines.push('');
    lines.push(`${pad}${d(p.secondary.label)}`);
    if (p.secondary.used !== null || p.secondary.limit !== null) {
      lines.push(`${pad}             ${quotaBar(p.secondary.used, p.secondary.limit)}  ${quotaPct(p.secondary.used, p.secondary.limit)}`);
      lines.push(`${pad}             ${quotaNumbers(p.secondary.used, p.secondary.limit, p.secondary.unit)}`);
    }
    if (p.secondary.resetAt) {
      lines.push(`${pad}             ${d('resets')} ${resetLabel(p.secondary.resetAt, null)}`);
    }
  }

  // Tertiary quota (e.g. Opus weekly)
  if (p.tertiary) {
    lines.push('');
    lines.push(`${pad}${d(p.tertiary.label)}`);
    if (p.tertiary.used !== null || p.tertiary.limit !== null) {
      lines.push(`${pad}             ${quotaBar(p.tertiary.used, p.tertiary.limit)}  ${quotaPct(p.tertiary.used, p.tertiary.limit)}`);
      lines.push(`${pad}             ${quotaNumbers(p.tertiary.used, p.tertiary.limit, p.tertiary.unit)}`);
    }
    if (p.tertiary.resetAt) {
      lines.push(`${pad}             ${d('resets')} ${resetLabel(p.tertiary.resetAt, null)}`);
    }
  }

  // Credits
  if (p.credits) {
    lines.push('');
    if (p.credits.unlimited) {
      lines.push(`${pad}${d('credits')}      ${g('unlimited')}`);
    } else if (p.credits.balance !== null) {
      const bal = Number(p.credits.balance);
      lines.push(`${pad}${d('credits')}      ${g(p.credits.currency + bal.toFixed(2))} ${d('remaining')}`);
    }
  }

  // Cost
  if (p.costUsd !== null) {
    lines.push('');
    lines.push(`${pad}${d('cost')}         ${w('$' + p.costUsd.toFixed(2))}`);
  }

  // Reset
  const reset = resetLabel(p.resetAt, p.resetWindow);
  if (reset !== d('—')) {
    lines.push(`${pad}${d('resets in')}    ${reset}`);
  }

  return lines.join('\n');
}

// ── Summary stats ───────────────────────────────────────────────────────

function renderSummary(providers: ProviderUsage[]): string {
  const active = providers.filter(p => p.status !== 'error' && p.status !== 'unknown');
  const ok = providers.filter(p => p.status === 'ok');
  const warnings = providers.filter(p => p.status === 'warning');
  const exhausted = providers.filter(p => p.status === 'exhausted');
  const errors = providers.filter(p => p.status === 'error');
  const totalCost = providers.reduce((sum, p) => sum + (p.costUsd || 0), 0);

  const parts: string[] = [];
  parts.push(`  ${white(String(providers.length))} ${d('providers tracked')}`);
  parts.push(`  ${g(String(ok.length))} ${d('healthy')}  ${warnings.length ? w(String(warnings.length)) + d(' warning') : ''}  ${exhausted.length ? r(String(exhausted.length)) + d(' exhausted') : ''}  ${errors.length ? r(String(errors.length)) + d(' error') : ''}`);
  if (totalCost > 0) {
    parts.push(`  ${d('total cost this period:')} ${w('$' + totalCost.toFixed(2))}`);
  }
  return parts.join('\n');
}

// ── Main command ────────────────────────────────────────────────────────

export const usageCommand = new Command('usage')
  .description('Show AI provider usage breakdown — quotas, costs, and limits')
  .argument('[provider]', 'Show detailed breakdown for one provider')
  .option('--refresh', 'Force re-fetch from all providers')
  .option('--all', 'Show all providers including disabled ones')
  .action(async (provider?: string, opts?: { refresh?: boolean; all?: boolean }) => {

    // ── Single provider detail ──────────────────────────────────────
    if (provider) {
      const s = spinner(`fetching ${provider} usage`);
      const data = opts?.refresh
        ? await agentPost<ProviderUsage>(`/usage/refresh/${provider}`)
        : await agentGet<ProviderUsage>(`/usage/${provider}`);
      s.stop();

      if (isJson()) { jsonOut(data); return; }

      console.log('');
      box(renderProviderCard(data), { title: ` ${data.displayName.toUpperCase()} ` });
      return;
    }

    // ── Full breakdown: all active providers ────────────────────────
    const s = spinner(opts?.refresh ? 'refreshing all providers' : 'loading provider usage');
    const result = opts?.refresh
      ? await agentPost<{ providers: ProviderUsage[] }>('/usage/refresh')
      : await agentGet<{ providers: ProviderUsage[] }>('/usage');
    s.stop();

    if (isJson()) { jsonOut(result); return; }

    const providers = result.providers;
    if (!providers.length) {
      console.log('');
      console.log(d('  no providers enabled.'));
      console.log(d('  run ') + g('worktrace usage detect') + d(' to find installed providers.'));
      console.log(d('  run ') + g('worktrace usage enable <provider>') + d(' to turn one on.'));
      return;
    }

    // Banner
    banner();
    console.log(info('  PROVIDER USAGE BREAKDOWN'));
    console.log(d('  ' + '─'.repeat(30)));
    console.log('');

    // Summary card
    box(renderSummary(providers), { title: ' SUMMARY ' });
    console.log('');

    // Individual provider cards
    for (const p of providers) {
      if (p.status === 'unknown' && !p.error && !opts?.all) continue; // skip empty unknowns unless --all
      box(renderProviderCard(p), { title: ` ${p.displayName.toUpperCase()} ` });
      console.log('');
    }

    // Quick table for at-a-glance
    console.log(info('  QUICK VIEW'));
    console.log('');
    table(
      ['', 'Provider', 'Usage', 'Remaining', 'Plan', 'Reset', 'Cost'],
      providers.map(p => [
        statusIcon(p.status),
        white(p.displayName),
        p.quotaUsed !== null && p.quotaLimit !== null
          ? `${p.quotaUsed}/${p.quotaLimit}`
          : p.error ? r('err') : d('—'),
        p.quotaRemaining !== null ? g(String(p.quotaRemaining)) : d('—'),
        p.plan || d('—'),
        resetLabel(p.resetAt, p.resetWindow),
        p.costUsd !== null ? w('$' + p.costUsd.toFixed(2))
          : p.credits && p.credits.balance !== null ? g(p.credits.currency + Number(p.credits.balance).toFixed(2))
          : p.credits?.unlimited ? g('unlimited')
          : d('—'),
      ]),
    );

    // Alerts
    const exhausted = providers.filter(p => p.status === 'exhausted');
    const warnings = providers.filter(p => p.status === 'warning');
    if (exhausted.length) {
      console.log('');
      console.log(r(`  ▲ EXHAUSTED: ${exhausted.map(p => p.displayName).join(', ')}`));
    }
    if (warnings.length) {
      console.log(w(`  ▲ NEAR LIMIT: ${warnings.map(p => p.displayName).join(', ')}`));
    }

    console.log('');
    await personality(pickMessage([
      'your tokens are showing.',
      'rate limits wait for no one.',
      'the meters are always running.',
      'every request has a price.',
      'know your limits before they know you.',
    ]));
  });

// ── Subcommand: detect ──────────────────────────────────────────────────

usageCommand
  .command('detect')
  .description('Auto-detect installed AI providers on this machine')
  .action(async () => {
    const s = spinner('scanning for AI providers');
    const result = await agentPost<{ detected: string[] }>('/usage/detect');
    s.stop();

    if (isJson()) { jsonOut(result); return; }

    if (!result.detected.length) {
      console.log(d('  no providers detected on this machine.'));
      return;
    }

    console.log('');
    console.log(g(`  found ${result.detected.length} provider(s):`));
    console.log('');
    for (const id of result.detected) {
      console.log(`    ${g('●')} ${white(id)}`);
    }
    console.log('');
    console.log(d('  enable with: ') + g(`worktrace usage enable <provider>`));
    console.log('');
  });

// ── Subcommand: enable ──────────────────────────────────────────────────

usageCommand
  .command('enable <provider>')
  .description('Enable tracking for a provider')
  .option('--api-key <key>', 'Set API key for the provider')
  .action(async (provider: string, opts: { apiKey?: string }) => {
    const patch: Record<string, unknown> = { enabled: true };
    if (opts.apiKey) patch.apiKey = opts.apiKey;

    await agentPatch<unknown>('/usage/config', {
      providers: { [provider]: patch },
    });

    if (isJson()) { jsonOut({ provider, enabled: true }); return; }

    console.log(g('+ ') + white(`${provider} tracking enabled`));
    if (opts.apiKey) console.log(d('  api key saved'));
  });

// ── Subcommand: disable ─────────────────────────────────────────────────

usageCommand
  .command('disable <provider>')
  .description('Disable tracking for a provider')
  .action(async (provider: string) => {
    await agentPatch<unknown>('/usage/config', {
      providers: { [provider]: { enabled: false } },
    });

    if (isJson()) { jsonOut({ provider, enabled: false }); return; }

    console.log(w('- ') + white(`${provider} tracking disabled`));
  });

// ── Subcommand: providers ───────────────────────────────────────────────

usageCommand
  .command('providers')
  .description('List all supported providers with their capabilities')
  .action(async () => {
    const result = await agentGet<{
      config: { providers: Record<string, { enabled: boolean }> };
      adapters: AdapterInfo[];
    }>('/usage/config');

    if (isJson()) { jsonOut(result); return; }

    console.log('');
    console.log(info('  ALL SUPPORTED PROVIDERS'));
    console.log(d('  ' + '─'.repeat(30)));
    console.log('');

    table(
      ['', 'Provider', 'Enabled', 'Platform', 'Quota', 'Cost', 'Plan', 'Auth'],
      result.adapters.map(a => {
        const enabled = result.config.providers[a.id]?.enabled;
        const cap = a.capabilities;
        return [
          enabled ? g('●') : d('○'),
          white(a.displayName),
          enabled ? g('yes') : d('no'),
          cap.platformSupport === 'full' ? g('full') : cap.platformSupport === 'partial' ? w('partial') : r('none'),
          cap.canFetchQuota ? g('✓') : d('—'),
          cap.canFetchCost ? g('✓') : d('—'),
          cap.canFetchPlan ? g('✓') : d('—'),
          cap.requiresBrowser ? w('cookie') : cap.requiresCli ? info('cli') : g('api/file'),
        ];
      }),
    );

    console.log('');
    console.log(d('  enable:  ') + g('worktrace usage enable <provider>'));
    console.log(d('  disable: ') + g('worktrace usage disable <provider>'));
    console.log(d('  detect:  ') + g('worktrace usage detect'));
    console.log('');
  });
