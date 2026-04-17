import { getAppContext } from './app-context.js';
import { loadAll, hasLivePlan, probeAvailability } from '../providers/_shared/registry.js';
import { reconcileProvider } from './reconcile.js';
import type { QuotaBar, UsageSnapshot } from '../providers/_shared/types.js';
import { AllStrategiesFailedError } from '../providers/_shared/types.js';

const DAY_MS = 24 * 60 * 60 * 1000;
let timer: NodeJS.Timeout | null = null;

function pickPrimaryQuota(snapshot: UsageSnapshot): QuotaBar | null {
  return snapshot.weekly ?? snapshot.session ?? snapshot.secondary ?? null;
}

export function startReconcileLoop(): void {
  if (timer) return;
  const tick = async (): Promise<void> => {
    await reconcileAllProviders();
  };
  void tick();
  timer = setInterval(() => {
    void tick();
  }, DAY_MS);
}

export function stopReconcileLoop(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}

export async function reconcileAllProviders(): Promise<void> {
  const ctx = getAppContext();
  const descriptors = await loadAll();
  const now = Date.now();
  const periodStart = now - (30 * DAY_MS);

  for (const descriptor of descriptors) {
    if (!hasLivePlan(descriptor)) continue;
    const available = await probeAvailability(descriptor, ctx.hosts);
    if (!available) continue;
    try {
      const snapshot = await ctx.fetchDriver.fetch(descriptor, { force: true });
      const primary = pickPrimaryQuota(snapshot);
      if (!primary) continue;
      const result = reconcileProvider(ctx.db, {
        provider: descriptor.id,
        reportedUsed: primary.used,
        periodStart,
        periodEnd: now,
        now,
      });
      if (result.exceededTolerance) {
        ctx.hosts.logger.warn('attribution drift exceeds tolerance', {
          provider: descriptor.id,
          driftPct: result.driftPct.toFixed(2),
        });
      }
    } catch (err) {
      if (err instanceof AllStrategiesFailedError && err.allUnavailable) {
        ctx.hosts.logger.debug('reconcile skipped — provider unavailable', {
          provider: descriptor.id,
        });
      } else {
        ctx.hosts.logger.warn('reconcile failed', {
          provider: descriptor.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }
}
