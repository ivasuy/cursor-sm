export type {
  ProviderFetchStrategy,
  FetchContext,
  FetchKind,
  FetchAttempt,
  FetchAttemptStatus,
  ProviderFetchOutcome,
  UsageSnapshot,
  QuotaBar,
  QuotaUnit,
  ExtraUsageBar,
  ProviderIdentity,
  UsageCostSummary,
  Logger,
  HostAPIs,
} from './types.js';

export { AllStrategiesFailedError, TimeoutError } from './types.js';

import type { ProviderFetchStrategy, StrategyPipeline, FetchContext } from './types.js';

export function linearPipeline(strategies: ProviderFetchStrategy[]): StrategyPipeline {
  return {
    resolveStrategies(_ctx: FetchContext): ProviderFetchStrategy[] {
      return [...strategies];
    },
  };
}
