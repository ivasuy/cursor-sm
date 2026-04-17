import { ensureAgent, agentGet } from '../agent-client.js';
import { renderQuotaCard } from '../render/quota-card.js';
import { palette } from '../render/colors.js';
import { printJson, printSection } from '../output.js';
import type { ProviderDetailResponse, ProvidersListResponse } from '../types.js';

export interface UsageOptions { refresh?: boolean; json?: boolean; }

export async function runUsage(opts: UsageOptions): Promise<void> {
  await ensureAgent();
  const p = palette(true);
  const suffix = opts.refresh ? '?refresh=1' : '';

  // Get list of available providers
  const list = await agentGet<ProvidersListResponse>(`/providers${suffix}`);
  const liveProviders = list.providers.filter((pr) => (pr as { available?: boolean }).available !== false);

  if (opts.json) {
    const details = await Promise.all(liveProviders.map((pr) =>
      agentGet<ProviderDetailResponse>(`/providers/${encodeURIComponent(pr.id)}${suffix}`).catch((e) => ({
        descriptor: { id: pr.id, metadata: { displayName: pr.displayName, vendor: pr.vendor, category: pr.category, website: '' }, branding: { icon: '•', accentColor: '#999' } },
        snapshot: null,
        status: 'error' as const,
        error: String(e),
      })),
    ));
    printJson({ fetchedAt: Date.now(), providers: details });
    return;
  }

  if (liveProviders.length === 0) {
    printSection('Usage');
    console.log(p.dim('  No providers configured'));
    console.log(p.dim('  Install Claude Code, Cursor, or Codex CLI and restart the agent'));
    return;
  }

  // Fetch detail for each available provider in parallel
  const details = await Promise.all(liveProviders.map((pr) =>
    agentGet<ProviderDetailResponse>(`/providers/${encodeURIComponent(pr.id)}${suffix}`)
      .catch((err) => ({
        descriptor: {
          id: pr.id,
          metadata: { displayName: pr.displayName, vendor: pr.vendor, category: pr.category, website: '' },
          branding: { icon: '•', accentColor: '#999999' },
        },
        snapshot: null,
        status: 'error' as const,
        error: err instanceof Error ? err.message : String(err),
      })),
  ));

  printSection('Usage');
  for (const detail of details) {
    console.log(renderQuotaCard({
      descriptor: detail.descriptor,
      snapshot: detail.snapshot,
      color: true,
    }));
  }

  // Summary footer
  const withData = details.filter((d) => d.snapshot);
  if (withData.length > 0) {
    const totalCost30d = withData.reduce((acc, d) => acc + (d.snapshot?.cost?.last30d ?? d.snapshot?.costUSD ?? 0), 0);
    if (totalCost30d > 0) {
      console.log(p.dim(`  total estimated cost last 30d: `) + p.white(`$${totalCost30d.toFixed(2)}`));
    }
    const totalTokens = withData.reduce((acc, d) => acc + (d.snapshot?.cost?.totalTokens ?? 0), 0);
    if (totalTokens > 0) {
      console.log(p.dim(`  total tokens (30d):             `) + p.white(formatTokens(totalTokens)));
    }
  }
}

function formatTokens(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
