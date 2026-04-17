import type { ProviderDescriptor, ProviderId, FetchContext, HostAPIs } from './types.js';
import { ALL_PROVIDER_IDS } from './types.js';

const loaders: Record<ProviderId, () => Promise<{ default: ProviderDescriptor }>> = {
  claude:  () => import('../claude/descriptor.js'),
  cursor:  () => import('../cursor/descriptor.js'),
  codex:   () => import('../codex/descriptor.js'),
};

const cache = new Map<ProviderId, ProviderDescriptor>();

const PIPELINE_PROBE_CTX = {
  timeout: 1,
  cacheTTL: 1,
  logger: { info() {}, warn() {}, error() {}, debug() {} },
  hosts: {} as FetchContext['hosts'],
} as FetchContext;

export async function loadAll(): Promise<ProviderDescriptor[]> {
  const out: ProviderDescriptor[] = [];
  for (const id of ALL_PROVIDER_IDS) {
    const d = await getById(id);
    if (d) out.push(d);
  }
  return out;
}

export async function getById(id: ProviderId): Promise<ProviderDescriptor | null> {
  if (cache.has(id)) return cache.get(id)!;
  const loader = loaders[id];
  if (!loader) return null;
  const mod = await loader();
  cache.set(id, mod.default);
  return mod.default;
}

export async function getInstalled(): Promise<ProviderDescriptor[]> {
  const all = await loadAll();
  return all.filter((d) => d.capabilities.quotaBar);
}

export function hasLivePlan(descriptor: ProviderDescriptor): boolean {
  try {
    const strategies = descriptor.fetchPlan.pipeline.resolveStrategies(PIPELINE_PROBE_CTX);
    return strategies.length > 0;
  } catch {
    return false;
  }
}

export async function probeAvailability(
  descriptor: ProviderDescriptor,
  hosts: HostAPIs,
): Promise<boolean> {
  if (!hasLivePlan(descriptor)) return false;
  const ctx: FetchContext = {
    timeout: 5_000,
    cacheTTL: 0,
    logger: { info() {}, warn() {}, error() {}, debug() {} },
    hosts,
  };
  const strategies = descriptor.fetchPlan.pipeline.resolveStrategies(ctx);
  for (const s of strategies) {
    try {
      if (await s.isAvailable(ctx)) return true;
    } catch {
      continue;
    }
  }
  return false;
}
