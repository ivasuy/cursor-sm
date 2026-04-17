import { ensureAgent, agentGet } from '../agent-client.js';
import { renderQuotaCard } from '../render/quota-card.js';
import { printJson, printSection } from '../output.js';
import type { ProviderDetailResponse, ProvidersListResponse } from '../types.js';

export interface ProvidersOptions { id?: string; json?: boolean; refresh?: boolean; }

export async function runProviders(opts: ProvidersOptions): Promise<void> {
  await ensureAgent();
  const suffix = opts.refresh ? '?refresh=1' : '';

  if (opts.id) {
    const data = await agentGet<ProviderDetailResponse>(`/providers/${encodeURIComponent(opts.id)}${suffix}`);
    if (opts.json) {
      printJson(data);
      return;
    }
    console.log(renderQuotaCard({ descriptor: data.descriptor, snapshot: data.snapshot }));
    return;
  }

  const list = await agentGet<ProvidersListResponse>(`/providers${suffix}`);
  if (opts.json) {
    printJson(list);
    return;
  }

  const details = await Promise.all(list.providers.map((provider) =>
    agentGet<ProviderDetailResponse>(`/providers/${encodeURIComponent(provider.id)}${suffix}`)
      .catch((err) => ({
        descriptor: {
          id: provider.id,
          metadata: {
            displayName: provider.displayName,
            vendor: provider.vendor,
            category: provider.category,
            website: '',
          },
          branding: { icon: '•', accentColor: '#999999' },
        },
        snapshot: null,
        status: 'error' as const,
        error: err instanceof Error ? err.message : String(err),
      }))
  ));

  printSection('Providers');
  for (const detail of details) {
    console.log(renderQuotaCard({
      descriptor: detail.descriptor,
      snapshot: detail.snapshot,
    }));
  }
}
