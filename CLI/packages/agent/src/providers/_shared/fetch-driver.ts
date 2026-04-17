import { AllStrategiesFailedError, type HostAPIs, type Logger, type ProviderDescriptor, type UsageSnapshot } from './types.js';
import type { SnapshotCache } from './cache.js';
import { runPipeline } from './fetch-pipeline.js';

const STALE_FALLBACK_TTL_MS = 5 * 60_000;

export interface FetchDriverConfig {
  cache: SnapshotCache;
  hosts: HostAPIs;
  logger?: Logger;
  timeoutMs?: number;
}

export interface FetchOptions {
  force?: boolean;
}

export interface FetchDriver {
  fetch(descriptor: ProviderDescriptor, opts?: FetchOptions): Promise<UsageSnapshot>;
}

function nullLogger(): Logger {
  return { info() {}, warn() {}, error() {}, debug() {} };
}

export function createFetchDriver(cfg: FetchDriverConfig): FetchDriver {
  const logger = cfg.logger ?? cfg.hosts.logger ?? nullLogger();
  const timeoutMs = cfg.timeoutMs ?? 10_000;

  return {
    async fetch(descriptor, opts = {}) {
      if (!opts.force) {
        const cached = cfg.cache.get(descriptor.id, descriptor.fetchPlan.cacheMaxAgeMs);
        if (cached) return cached;
      }

      try {
        const out = await runPipeline(descriptor, {
          timeout: timeoutMs,
          cacheTTL: descriptor.fetchPlan.cacheMaxAgeMs,
          logger,
          hosts: cfg.hosts,
        });
        cfg.cache.set(descriptor.id, out.snapshot);
        return out.snapshot;
      } catch (err) {
        if (err instanceof AllStrategiesFailedError) {
          const stale = cfg.cache.get(descriptor.id, STALE_FALLBACK_TTL_MS);
          if (stale) {
            logger.warn('using stale provider snapshot after strategy failures', {
              providerId: descriptor.id,
              attempts: err.attempts.map((a) => ({ id: a.id, status: a.status })),
            });
            return stale;
          }
        }
        throw err;
      }
    },
  };
}
