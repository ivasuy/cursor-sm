export type {
  ProviderDescriptor,
  ProviderMetadata,
  ProviderBranding,
  ProviderCapabilities,
  ProviderCLIConfig,
  ProviderFetchPlan,
  StrategyPipeline,
} from './types.js';

import type { ProviderDescriptor } from './types.js';

export function isProviderDescriptor(value: unknown): value is ProviderDescriptor {
  if (!value || typeof value !== 'object') return false;
  const d = value as Partial<ProviderDescriptor>;
  return typeof d.id === 'string' && !!d.metadata && !!d.branding
      && !!d.capabilities && !!d.fetchPlan && !!d.cli;
}

export function describeProvider(d: ProviderDescriptor): string {
  return `${d.metadata.displayName} [${d.id}]`;
}
